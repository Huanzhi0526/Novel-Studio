#!/usr/bin/env python3
"""Deterministic TXT/EPUB to NTS draft-0.1 scaffold converter (stdlib only)."""
from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
import mimetypes
import os
import posixpath
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
import uuid
import zipfile
from xml.etree import ElementTree as ET

VERSION = "0.2.0"
NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container", "o": "http://www.idpf.org/2007/ops"}
MAX_TOTAL = 256 * 1024 * 1024
MAX_FILES = 20000
MAX_RATIO = 1000
NAMESPACE = uuid.UUID("b77e6f4c-cd84-5734-8d3c-ea88c12c71e9")
CATEGORIES = ("character", "setting", "power_system", "organization", "event", "storyline", "location", "item", "technique")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_bytes(data)
    os.replace(temp, path)


def uid(seed: str) -> str:
    return str(uuid.uuid5(NAMESPACE, seed))


def norm(s: str) -> str:
    return unicodedata.normalize("NFC", s.replace("\r\n", "\n").replace("\r", "\n"))


def safe_member(name: str) -> str:
    p = PurePosixPath(name)
    raw_path = name[:-1] if name.endswith("/") else name
    raw_parts = raw_path.split("/")
    if p.is_absolute() or ".." in p.parts or "." in raw_parts or "" in raw_parts or str(p) != raw_path or "\\" in name or ":" in name or any(ord(ch) < 32 for ch in name) or any(part.endswith((".", " ")) for part in p.parts):
        raise ValueError(f"ZIP 路径不安全：{name!r}")
    return str(p)


def resolve_ref(base_dir: str, href: str) -> str:
    from urllib.parse import unquote
    part = unquote(href.split("#", 1)[0]).replace("\\", "/")
    resolved = posixpath.normpath(posixpath.join(base_dir, part))
    if resolved == ".." or resolved.startswith("../") or resolved.startswith("/"):
        raise ValueError(f"引用路径越出 EPUB 根目录：{href!r}")
    return safe_member(resolved)


class XHTML(HTMLParser):
    BLOCKS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "dt", "dd"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.cur = None
        self.ids = {}
        self.pending = []
        self.ignored = []
    def handle_starttag(self, tag, attrs):
        if self.ignored:
            if tag in ("head", "title", "script", "style"): self.ignored.append(tag)
            return
        if tag in ("head", "title", "script", "style"):
            self.ignored.append(tag)
            return
        a = dict(attrs)
        if tag in self.BLOCKS:
            self.flush()
            classes = set(a.get("class", "").split())
            epub_type = a.get("epub:type", a.get("type", "")).lower()
            is_note = bool(classes.intersection({"note", "footnote", "endnote"}) or epub_type in {"note", "footnote", "endnote"})
            self.cur = {"text": "", "tag": tag, "id": a.get("id"), "hrefs": [], "images": [], "is_note": is_note}
        else:
            if a.get("id"): self.pending.append(a["id"])
        if tag == "br" and self.cur:
            self.cur["text"] += "\n"
        elif tag == "img":
            item = {"src": a.get("src"), "alt": a.get("alt", "")} 
            if self.cur: self.cur["images"].append(item)
            else:
                self.blocks.append({"text": item["alt"], "tag": "image", "id": a.get("id"), "hrefs": [], "images": [item]})
                if self.pending:
                    for ident in self.pending: self.ids[ident] = len(self.blocks)-1
                    self.pending.clear()
        elif tag == "image":
            item = {"src": a.get("href") or a.get("xlink:href"), "alt": a.get("aria-label", "")}
            if self.cur: self.cur["images"].append(item)
            else:
                self.blocks.append({"text": item["alt"], "tag": "image", "id": a.get("id"), "hrefs": [], "images": [item]})
                if self.pending:
                    for ident in self.pending: self.ids[ident] = len(self.blocks)-1
                    self.pending.clear()
        elif tag == "a" and self.cur:
            self.cur["hrefs"].append(a.get("href", ""))
    def handle_endtag(self, tag):
        if self.ignored:
            if tag == self.ignored[-1]: self.ignored.pop()
            return
        if tag in self.BLOCKS: self.flush()
    def handle_data(self, data):
        if self.ignored: return
        if self.cur: self.cur["text"] += data
        elif data.strip(): self.blocks.append({"text": data, "tag": "text", "id": None, "hrefs": [], "images": []})
    def flush(self):
        if self.cur:
            self.blocks.append(self.cur)
            for ident in self.pending + ([self.cur["id"]] if self.cur.get("id") else []):
                self.ids[ident] = len(self.blocks)-1
            self.cur = None
            self.pending.clear()
    def finish(self):
        self.flush()
        return self.blocks


def read_epub(path: Path):
    issues = []
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_FILES: raise ValueError("EPUB 文件数超过安全上限")
        total = 0
        seen_paths = set()
        for i in infos:
            name = safe_member(i.filename)
            canonical_name = name.rstrip("/") + ("/" if i.is_dir() else "")
            if i.filename != canonical_name: raise ValueError(f"ZIP 路径非规范：{i.filename!r}")
            if name in seen_paths: raise ValueError(f"ZIP 存在重复成员路径：{i.filename!r}")
            seen_paths.add(name)
            if i.is_dir(): continue
            total += i.file_size
            if total > MAX_TOTAL: raise ValueError("EPUB 解压总量超过 256 MiB")
            if i.file_size and (not i.compress_size or i.file_size / i.compress_size > MAX_RATIO): raise ValueError("EPUB 压缩比超过安全上限")
            mode = (i.external_attr >> 16) & 0xF000
            if mode == 0xA000: raise ValueError("EPUB 含符号链接成员")
        try: container = ET.fromstring(z.read("META-INF/container.xml"))
        except (KeyError, ET.ParseError) as e: raise ValueError(f"EPUB 缺少有效 container.xml：{e}")
        rootfile = container.find(".//{*}rootfile")
        if rootfile is None: raise ValueError("EPUB 找不到 OPF 根文件")
        opf_path = safe_member(rootfile.attrib["full-path"])
        opf = ET.fromstring(z.read(opf_path)); base = str(PurePosixPath(opf_path).parent)
        def resolve(href):
            return resolve_ref(base, href)
        manifest = {}
        for el in opf.findall(".//{*}manifest/{*}item"):
            manifest[el.attrib["id"]] = {**el.attrib, "path": resolve(el.attrib["href"])}
        spine = []
        for ref in opf.findall(".//{*}spine/{*}itemref"):
            item = manifest.get(ref.attrib.get("idref"))
            if item:
                if item.get("media-type") in ("application/xhtml+xml", "text/html"):
                    spine.append(item)
                else: issues.append(f"spine 项不是 HTML，已跳过：{item['path']}")
            else: issues.append(f"OPF spine 引用缺失：{ref.attrib.get('idref')}")
        if not spine: raise ValueError("OPF spine 中没有可读取的 XHTML 内容")
        blocks, href_indices, assets, note_links, note_blocks, used_asset_paths = [], {}, {}, [], [], set()
        external_note_links = []
        for item in spine:
            try: raw = z.read(item["path"])
            except KeyError:
                issues.append(f"spine 文件缺失：{item['path']}"); continue
            parser = XHTML(); parser.feed(raw.decode("utf-8", errors="replace")); part = parser.finish()
            start = len(blocks)
            part_to_output = {}
            for b in part:
                output_index = len(blocks)
                text = norm(" ".join(b["text"].split()))
                if text:
                    blocks.append({"kind": "note" if b.get("is_note") else "text", "text": text, "asset_sha256": None, "note_target": None})
                    if b.get("is_note") or (b.get("id") and re.search(r"(fn|note|footnote|注释|脚注)", b["id"], re.I)): note_blocks.append(len(blocks)-1)
                    for href in b["hrefs"]:
                        if href.startswith("#"):
                            note_links.append((len(blocks)-1, href[1:]))
                for im in b["images"]:
                    if not im.get("src"): issues.append(f"图片缺少 src：{item['path']}"); continue
                    try:
                        ap = resolve_ref(str(PurePosixPath(item["path"]).parent), im["src"])
                        data = z.read(ap); digest = sha(data)
                        ext = Path(ap).suffix.lower()
                        if ext not in (".png", ".jpg", ".jpeg", ".webp"): issues.append(f"图片类型未纳入协议资源：{ap}"); continue
                        assets.setdefault(digest, (ext, data))
                        used_asset_paths.add(ap)
                        blocks.append({"kind": "image", "text": norm(im.get("alt", "")), "asset_sha256": digest, "note_target": None})
                    except (KeyError, ValueError) as e: issues.append(f"图片资源无法读取：{im.get('src')}（{e}）")
                part_to_output[len(part_to_output)] = output_index
            local_ids = {ident: part_to_output.get(local_index, start) for ident, local_index in parser.ids.items()}
            for ident, index in local_ids.items(): href_indices[item["path"] + "#" + ident] = index
            for part_index, b in enumerate(part):
                output_index = part_to_output.get(part_index, start)
                for href in b["hrefs"]:
                    if not href: continue
                    try:
                        if href.startswith("#"):
                            target = local_ids.get(href[1:])
                        elif ":" not in href.split("/", 1)[0]:
                            external_note_links.append((output_index, item["path"], href))
                            target = None
                        else:
                            target = None
                        if target is not None: note_links.append((output_index, target))
                    except ValueError:
                        pass
            href_indices[item["path"]] = start
        for source, source_path, href in external_note_links:
            try:
                target_path = resolve_ref(str(PurePosixPath(source_path).parent), href)
                target_key = target_path + ("#" + href.split("#",1)[1] if "#" in href else "")
                target = href_indices.get(target_key, href_indices.get(target_path))
                if target is not None: note_links.append((source, target))
            except ValueError:
                continue
        if not blocks: raise ValueError("EPUB 未提取到正文段落")
        toc, nav_groups = [], []
        nav_item = next((x for x in manifest.values() if "nav" in x.get("properties", "").split()), None)
        ncx_item = next((x for x in manifest.values() if x.get("media-type") == "application/x-dtbncx+xml"), None)
        if nav_item or ncx_item:
            toc_path = (nav_item or ncx_item)["path"]
            use_ncx = nav_item is None and ncx_item is not None
            try:
                tree = ET.fromstring(z.read(toc_path)); tocdir = str(PurePosixPath(toc_path).parent)
                elements = tree.findall(".//{*}navPoint") if use_ncx else tree.findall(".//{*}a")
                for el in elements:
                    label = " ".join((el.findtext(".//{*}text", default="") if use_ncx else "".join(el.itertext())).split())
                    target = (el.find(".//{*}content").attrib.get("src", "") if use_ncx and el.find(".//{*}content") is not None else (el.attrib.get("href", "") if not use_ncx else ""))
                    if not target or not label: continue
                    resolved = resolve_ref(tocdir, target)
                    key = resolved + ("#" + target.split("#",1)[1] if "#" in target else "")
                    idx = href_indices.get(key, href_indices.get(resolved))
                    if idx is None: issues.append(f"目录目标无法对应 spine：{target}"); continue
                    toc.append((idx, norm(label), target))
                if not use_ncx:
                    # Only direct nav children are considered volume groups. This
                    # avoids treating nested chapter lists as additional volumes.
                    navs = tree.findall(".//{*}nav")
                    for nav in navs:
                        for nav_ol in nav.findall("{*}ol"):
                            for li in nav_ol.findall("{*}li"):
                                label_el = next((child for child in list(li) if child.tag.endswith("}span") or child.tag == "span"), None)
                                list_el = next((child for child in list(li) if child.tag.endswith("}ol") or child.tag == "ol"), None)
                                if label_el is None or list_el is None: continue
                                label = norm(" ".join("".join(label_el.itertext()).split()))
                                indices = []
                                for link in list_el.findall(".//{*}a"):
                                    href = link.attrib.get("href", "")
                                    if not href: continue
                                    resolved = resolve_ref(tocdir, href)
                                    key = resolved + ("#" + href.split("#",1)[1] if "#" in href else "")
                                    target_index = href_indices.get(key, href_indices.get(resolved))
                                    if target_index is not None: indices.append(target_index)
                                if label and indices: nav_groups.append({"title": label, "start": min(indices), "end": max(indices)})
                nav_order = list(nav_groups)
                ordered_groups = sorted(nav_groups, key=lambda x: (x["start"], x["end"]))
                conflict = any(nav_order[i]["start"] >= nav_order[i+1]["start"] for i in range(len(nav_order)-1))
                conflict = conflict or any(ordered_groups[i]["end"] >= ordered_groups[i+1]["start"] for i in range(len(ordered_groups)-1))
                if conflict:
                    issues.append("EPUB nav 分卷链接顺序或区间与 spine 冲突；已回退为单卷")
                    nav_groups = []
                else:
                    nav_groups = ordered_groups
                    for i, group in enumerate(nav_groups):
                        group["end"] = nav_groups[i+1]["start"] - 1 if i + 1 < len(nav_groups) else len(blocks) - 1
            except (KeyError, ET.ParseError, ValueError) as e: issues.append(f"EPUB 目录解析失败：{e}")
        else: issues.append("未发现 EPUB nav/NCX 目录；结构将按标题候选识别")
        for source, target in note_links:
            if isinstance(target, str):
                # Inline links use a local fragment; resolve them after all IDs are indexed.
                continue
            if source in note_blocks and target < len(blocks):
                blocks[source]["note_target"] = f"p{target+1:06d}"
            elif target in note_blocks and source < len(blocks):
                blocks[target]["kind"] = "note"
                blocks[target]["note_target"] = f"p{source+1:06d}"
        for manifest_item in manifest.values():
            media = manifest_item.get("media-type", "")
            if media.startswith("image/") and manifest_item["path"] not in used_asset_paths:
                issues.append(f"manifest 图片未被 spine XHTML 引用或未能提取：{manifest_item['path']} ({media})")
            elif media and media not in ("application/xhtml+xml", "text/html", "application/x-dtbncx+xml", "text/css") and not media.startswith("image/"):
                issues.append(f"EPUB manifest 含未识别资源类型：{manifest_item['path']} ({media})")
        return blocks, toc, assets, issues, nav_groups


def classify_title(title: str):
    s = title.strip().lower()
    if re.search(r"序章|序幕|prologue|序", s): return "prologue"
    if re.search(r"后记|跋|epilogue|afterword", s): return "afterword" if re.search(r"后记|afterword", s) else "epilogue"
    if re.search(r"尾声|终章|epilogue", s): return "epilogue"
    if re.search(r"幕间|间章|interlude", s): return "interlude"
    if re.search(r"第[一二三四五六七八九十百千万0-9零〇两]+[章节回卷部篇]|\bchapter\s+[ivxlcdm0-9]+\b", s, re.I): return "chapter"
    return "frontmatter"


def make_structures(volume_id, revision, blocks, toc, issues, nav_groups=None):
    n = len(blocks)
    candidates = {idx: (title, "toc") for idx, title, _ in toc if 0 <= idx < n}
    for i, b in enumerate(blocks):
        if b["kind"] != "text": continue
        s = b["text"].strip()
        if len(s) < 100 and re.match(r"^(第[一二三四五六七八九十百千万0-9零〇两]+[章节回卷部篇]|序章|序幕|尾声|后记|跋|幕间|间章)(\s|[:：.、]|$)", s):
            candidates.setdefault(i, (s, "heading"))
    cuts = sorted(candidates)
    if not cuts:
        issues.append("未发现可识别章节标题；整卷标记为 unclassified")
        return [{"structure_id": uid(volume_id+":unclassified"), "volume_id": volume_id, "revision_id": revision, "parent_id": None, "type": "unclassified", "title": None, "start": "p000001", "end": f"p{n:06d}"}], issues
    # Prefix before first chapter remains its own frontmatter.
    out = []
    if cuts[0] > 0:
        out.append((0, cuts[0]-1, "frontmatter", None))
    for j, start in enumerate(cuts):
        end = cuts[j+1]-1 if j+1 < len(cuts) else n-1
        title, source = candidates[start]
        typ = classify_title(title)
        out.append((start, end, typ, title))
    structs = [{"structure_id": uid(volume_id+":volume"), "volume_id": volume_id, "revision_id": revision, "parent_id": None, "type": "volume", "title": None, "start": "p000001", "end": f"p{n:06d}"}]
    group_nodes = []
    for group in sorted(nav_groups or [], key=lambda x: (x["start"], x["end"])):
        if group["start"] < 0 or group["end"] >= n or group["start"] > group["end"]: continue
        if group_nodes and group["start"] <= group_nodes[-1]["end_index"]:
            issues.append(f"EPUB nav 分卷区间重叠，未能建立父卷结构：{group['title']}")
            group_nodes = []
            break
        node = {"structure_id": uid(f"{volume_id}:nav-volume:{group['start']}:{group['end']}:{group['title']}"), "volume_id": volume_id, "revision_id": revision, "parent_id": structs[0]["structure_id"], "type": "volume", "title": group["title"], "start": f"p{group['start']+1:06d}", "end": f"p{group['end']+1:06d}", "start_index": group["start"], "end_index": group["end"]}
        group_nodes.append(node)
    structs.extend({k:v for k,v in node.items() if k not in ("start_index", "end_index")} for node in group_nodes)
    for ix, (start, end, typ, title) in enumerate(out):
        parent_id = structs[0]["structure_id"]
        if typ != "frontmatter":
            parent_id = next((g["structure_id"] for g in group_nodes if g["start_index"] <= start <= g["end_index"]), parent_id)
        structs.append({"structure_id": uid(f"{volume_id}:{start}:{end}:{typ}:{title}"), "volume_id": volume_id, "revision_id": revision, "parent_id": parent_id, "type": typ, "title": title, "start": f"p{start+1:06d}", "end": f"p{end+1:06d}"})
    return structs, issues


def convert(args):
    src = Path(args.input).resolve(); out = Path(args.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    identity_path = Path(args.identity).resolve() if args.identity else out / "identity.json"
    if identity_path in (out / "result.json", out / "result.zip"):
        raise ValueError("identity 路径不能覆盖 result.json 或 result.zip")
    identity = {"format": "luna-converter-identity", "tool_version": VERSION, "work_id": str(uuid.uuid4()), "volumes": {}}
    if identity_path.exists():
        identity = json.loads(identity_path.read_text(encoding="utf-8"))
        if identity.get("format") != "luna-converter-identity": raise ValueError("identity 格式不受支持；原文件未修改")
        try:
            uuid.UUID(identity["work_id"])
            if not isinstance(identity.get("volumes"), dict): raise ValueError("volumes 必须是对象")
            for existing_key, existing_id in identity["volumes"].items():
                if not isinstance(existing_key, str): raise ValueError("volume key 必须是文本")
                uuid.UUID(existing_id)
        except (KeyError, TypeError, ValueError) as e: raise ValueError(f"identity 内容无效；原文件未修改：{e}")
    key = args.volume_key or src.stem
    # Reserve the legacy/single-volume ID. For a proven grouped nav this is
    # reused by the first group when migrating an existing identity.
    legacy_key_existing = key in identity["volumes"]
    legacy_volume_id = identity["volumes"].setdefault(key, str(uuid.uuid4()))
    uuid.UUID(legacy_volume_id)
    issues = []
    resources, assets_to_write = [], {}
    source_bytes = src.read_bytes()
    if src.suffix.lower() == ".epub":
        blocks, toc, assets, found_issues, nav_groups = read_epub(src); issues.extend(found_issues)
        assets_to_write = {f"assets/{h}{ext}": data for h,(ext,data) in assets.items()}
    elif src.suffix.lower() == ".txt":
        if args.encoding:
            text = source_bytes.decode(args.encoding)
        elif source_bytes.startswith((b"\xff\xfe", b"\xfe\xff")):
            text = source_bytes.decode("utf-16")
            issues.append("检测到 UTF-16 BOM，已按 BOM 指定的字节序解码")
        else:
            try: text = source_bytes.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = source_bytes.decode("gb18030"); issues.append("TXT 非 UTF-8，按 GB18030 解码；编码为推测，请核对")
        text = norm(text)
        blocks = [{"kind":"text","text":norm(line.strip()),"asset_sha256":None,"note_target":None} for para in re.split(r"\n\s*\n+", text) if (line:=para.strip())]
        toc=[]; nav_groups=[]
        if not args.encoding and source_bytes.startswith(b"\xef\xbb\xbf"): issues.append("检测到 UTF-8 BOM")
    else: raise ValueError("仅支持 .txt 和 .epub")
    if not blocks: raise ValueError("输入没有可用正文段落")
    grouped = []
    if len(nav_groups) >= 2:
        ordered = sorted(nav_groups, key=lambda g: g["start"])
        valid = all(0 <= g["start"] < len(blocks) for g in ordered)
        valid = valid and all(ordered[i]["start"] < ordered[i+1]["start"] for i in range(len(ordered)-1))
        valid = valid and all(g["title"].strip() for g in ordered)
        if valid:
            grouped = [{"title": g["title"], "start": 0 if i == 0 else g["start"],
                        "end": (ordered[i+1]["start"]-1 if i+1 < len(ordered) else len(blocks)-1)}
                       for i, g in enumerate(ordered)]
            valid = all(g["start"] <= g["end"] for g in grouped)
        if not valid:
            grouped = []
            issues.append("EPUB nav 分卷分组与 spine 顺序冲突，已回退为单卷")
    preserve_legacy_single = False
    nav_groups_for_structure = []
    if grouped:
        generated_keys = [f"{key}::nav:{i}:{g['title']}" for i, g in enumerate(grouped)]
        has_group_identity = any(k in identity["volumes"] for k in generated_keys)
        if legacy_key_existing and not has_group_identity:
            preserve_legacy_single = True
            nav_groups_for_structure = [dict(g) for g in grouped]
            issues.append("已有单卷 identity 保持原逻辑卷和 volume 目录父结构；如需拆分，请使用新的 identity 文件或新的 --volume-key（规则 0.2.0）")
            grouped = []
            group_ids = [legacy_volume_id]
        else:
            group_ids = []
            if not legacy_key_existing:
                identity["volumes"].pop(key, None)
        for i, group_key in enumerate(generated_keys):
            if i < len(group_ids): continue
            if not preserve_legacy_single:
                group_ids.append(identity["volumes"].setdefault(group_key, str(uuid.uuid4())))
        for ident in group_ids: uuid.UUID(ident)
    else:
        grouped = [{"title": args.volume_title or key, "start": 0, "end": len(blocks)-1}]
        group_ids = [legacy_volume_id]
    if preserve_legacy_single:
        grouped = [{"title": args.volume_title or key, "start": 0, "end": len(blocks)-1}]
    for path,data in assets_to_write.items():
        dest = out / Path(*PurePosixPath(path).parts); dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
        resources.append({"path":path,"sha256":sha(data),"purpose":"image"})
    if args.include_source:
        p = f"source/{src.name}"; dest = out / "source" / src.name; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(source_bytes)
        resources.append({"path":p,"sha256":sha(source_bytes),"purpose":"source"})
    volumes, all_structures = [], []
    for vindex, (group, volume_id) in enumerate(zip(grouped, group_ids)):
        start, end = group["start"], group["end"]
        local_blocks = json.loads(json.dumps(blocks[start:end+1], ensure_ascii=False))
        for block in local_blocks:
            target = block.get("note_target")
            if target:
                match = re.fullmatch(r"p(\d{6,})", target)
                target_index = int(match.group(1))-1 if match else -1
                if start <= target_index <= end:
                    block["note_target"] = f"p{target_index-start+1:06d}"
                else:
                    block["note_target"] = None
                    issues.append(f"跨卷注释关系未建立，保留注释文本：卷 {group['title']} -> {target}")
        payload = {"volume_id":volume_id,"blocks":local_blocks}
        revision = sha(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        local_toc = [(idx-start, label, href) for idx, label, href in toc if start <= idx <= end]
        structures, struct_issues = make_structures(volume_id, revision, local_blocks, local_toc, issues,
                                                     nav_groups_for_structure if preserve_legacy_single else None)
        issues = struct_issues
        all_structures.extend(structures)
        volumes.append({"volume_id":volume_id,"title":args.volume_title if len(grouped)==1 and args.volume_title else group["title"],"revision_id":revision,"normalized_payload":payload})
        for i, b in enumerate(local_blocks):
            if b["kind"] == "image" and b["asset_sha256"] not in {r["sha256"] for r in resources}:
                issues.append(f"图片资源摘要未写入：卷 {group['title']} 段 p{i+1:06d}")
    title = args.work_title or src.stem
    result = {"schema_version":"draft-0.1","work":{"work_id":identity["work_id"],"title":title},"volumes":volumes,"structures":all_structures,"cards":[],"report":{"processed_ranges":[],"category_status":{k:"not_processed" for k in CATEGORIES},"issues":[f"确定性转换工具 {VERSION} 生成的空卡草稿；Agent 尚未完成知识卡拆解。", *issues]},"resources":resources}
    package_hash = sha(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    result = {"schema_version":result["schema_version"],"package_id":uid("package:"+package_hash),**{k:v for k,v in result.items() if k!="schema_version"}}
    identity["tool_version"] = VERSION
    atomic_write(identity_path, (json.dumps(identity,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))
    result_path = out / "result.json"; atomic_write(result_path, (json.dumps(result,ensure_ascii=False,indent=2)+"\n").encode("utf-8"))
    result_zip = out / "result.zip"; zip_temp = result_zip.with_name(f".{result_zip.name}.{uuid.uuid4().hex}.tmp")
    with zipfile.ZipFile(zip_temp, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(result_path, "result.json")
        for r in resources: z.write(out / Path(*PurePosixPath(r["path"]).parts), r["path"])
    os.replace(zip_temp, result_zip)
    return result


def main():
    p=argparse.ArgumentParser(description="TXT/EPUB 转 NTS draft-0.1 空卡草稿")
    p.add_argument("input"); p.add_argument("--out",required=True); p.add_argument("--identity")
    p.add_argument("--work-title"); p.add_argument("--volume-key"); p.add_argument("--volume-title"); p.add_argument("--encoding")
    p.add_argument("--include-source",action="store_true",help="将原始输入副本加入 ZIP resources")
    a=p.parse_args()
    try:
        r=convert(a); print(json.dumps({"result":str(Path(a.out).resolve()/"result.json"),"zip":str(Path(a.out).resolve()/"result.zip"),"identity":str(Path(a.identity).resolve() if a.identity else Path(a.out).resolve()/"identity.json"),"volumes":len(r["volumes"]),"blocks":[len(v["normalized_payload"]["blocks"]) for v in r["volumes"]],"revision_ids":[v["revision_id"] for v in r["volumes"]],"issues":len(r["report"]["issues"])},ensure_ascii=False,indent=2))
    except Exception as e:
        print(f"convert: {e}",file=sys.stderr); return 2
    return 0

if __name__=="__main__": raise SystemExit(main())
