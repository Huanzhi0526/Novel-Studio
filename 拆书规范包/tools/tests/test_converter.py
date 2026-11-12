import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid
import zipfile

TOOL = Path(__file__).parents[1] / "convert.py"
spec = importlib.util.spec_from_file_location("converter", TOOL)
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)

class ConverterTests(unittest.TestCase):
    def test_txt_repeat_and_identity(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); src = root / "book.txt"
            src.write_text("序章 灯\n\n第一段。\n\n第一章 开始\n\n第二段。\n\n后记\n\n结束。", encoding="utf-8")
            out = root / "out"
            args = type("Args", (), {"input":str(src),"out":str(out),"identity":None,"volume_key":"vol1","volume_title":"第一卷","work_title":"样书","encoding":None,"include_source":False})
            one = c.convert(args); two = c.convert(args)
            self.assertEqual(one["volumes"][0]["revision_id"], two["volumes"][0]["revision_id"])
            self.assertEqual(one["volumes"][0]["volume_id"], two["volumes"][0]["volume_id"])
            self.assertEqual(one["package_id"], two["package_id"])
            self.assertEqual([s["type"] for s in one["structures"]], ["volume", "prologue", "chapter", "afterword"])
            self.assertEqual(len(one["volumes"][0]["normalized_payload"]["blocks"]), 6)
            self.assertTrue((out / "result.zip").exists())

    def test_txt_utf16_bom_is_detected(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for index, codec in enumerate(("utf-16", "utf-16-be")):
                src=root/f"utf{index}.txt"; payload="序章\n\n正文".encode(codec)
                src.write_bytes(payload if index == 0 else b"\xfe\xff"+payload)
                args=type("Args",(),{"input":str(src),"out":str(root/f"out{index}"),"identity":None,"volume_key":f"utf{index}","volume_title":None,"work_title":None,"encoding":None,"include_source":False})
                result=c.convert(args)
                self.assertEqual(result["volumes"][0]["normalized_payload"]["blocks"][0]["text"],"序章")
                self.assertTrue(any("UTF-16 BOM" in issue for issue in result["report"]["issues"]))

    def test_epub_spine_nav_images_and_notes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); src = root / "fixture.epub"; out = root / "out"
            with zipfile.ZipFile(src, "w") as z:
                z.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>')
                z.writestr("OEBPS/book.opf", '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="Text/a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="Text/b.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="im" href="Images/pic.png" media-type="image/png"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
                z.writestr("OEBPS/nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><a href="Text/a.xhtml#pro">序章 灯塔</a><a href="Text/b.xhtml#after">后记</a></nav></body></html>')
                z.writestr("OEBPS/Text/a.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="pro">序章 灯塔</h1><p id="p1">她看见光<a href="#fn1">[1]</a></p><p><img src="../Images/pic.png" alt="灯塔图"/></p><p id="fn1">注释：灯塔在海边</p></body></html>')
                z.writestr("OEBPS/Text/b.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="after">后记</h1><p>故事结束。</p></body></html>')
                z.writestr("OEBPS/Images/pic.png", b"fake png fixture")
            args = type("Args", (), {"input":str(src),"out":str(out),"identity":None,"volume_key":"epub1","volume_title":"一卷","work_title":"测试","encoding":None,"include_source":False})
            r = c.convert(args); blocks = r["volumes"][0]["normalized_payload"]["blocks"]
            self.assertEqual([s["type"] for s in r["structures"]], ["volume", "prologue", "afterword"])
            self.assertEqual(sum(x["kind"] == "image" for x in blocks), 1)
            self.assertEqual(sum(x["kind"] == "note" for x in blocks), 1)
            self.assertEqual(len(r["resources"]), 1)
            self.assertEqual(json.loads((out/"result.json").read_text(encoding="utf-8"))["cards"], [])

    def test_unsafe_zip_member_rejected(self):
        with self.assertRaises(ValueError): c.safe_member("../../outside")
        for name in ("a//b.txt", "a/./b.txt", "C:/outside.txt", "a/trailing. "):
            with self.subTest(name=name), self.assertRaises(ValueError): c.safe_member(name)

    def test_epub_duplicate_and_noncanonical_members_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            cases = [("duplicate.epub", ("META-INF/container.xml", "META-INF/container.xml")),
                     ("noncanonical.epub", ("OEBPS/./book.opf",))]
            for filename,names in cases:
                p=Path(td)/filename
                with zipfile.ZipFile(p,"w") as z:
                    for name in names: z.writestr(name,"x")
                with self.subTest(filename=filename), self.assertRaises(ValueError): c.read_epub(p)

    def test_nav_volume_groups_and_note_class_are_preserved(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); src = root / "grouped.epub"; out = root / "out"
            with zipfile.ZipFile(src, "w") as z:
                z.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>')
                z.writestr("OEBPS/book.opf", '<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="unknown" href="font.woff" media-type="font/woff"/><item id="unused" href="unused.svg" media-type="image/svg+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
                z.writestr("OEBPS/nav.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li><span>卷一</span><ol><li><a href="a.xhtml#ch1">第一章</a></li></ol></li><li><span>卷二</span><ol><li><a href="b.xhtml#ch2">第二章</a></li></ol></li></ol></nav></body></html>')
                z.writestr("OEBPS/a.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><section epub:type="chapter"><h1 id="ch1">Chapter I</h1><p id="body1">正文<a href="#fn1">[1]</a><a href="b.xhtml#fn2">[2]</a></p><p id="fn1" class="note">注释文字</p></section></body></html>')
                z.writestr("OEBPS/b.xhtml", '<html xmlns="http://www.w3.org/1999/xhtml"><body><section epub:type="chapter"><h1 id="ch2">Chapter II</h1><p>第二卷正文</p><p id="fn2" class="note">跨卷注释文字</p></section></body></html>')
            args = type("Args", (), {"input":str(src),"out":str(out),"identity":None,"volume_key":"book","volume_title":"全书","work_title":"分卷样书","encoding":None,"include_source":False})
            r = c.convert(args); blocks = r["volumes"][0]["normalized_payload"]["blocks"]
            groups = [s for s in r["structures"] if s["type"] == "volume"]
            self.assertEqual(len(r["volumes"]), 2)
            self.assertEqual([v["title"] for v in r["volumes"]], ["卷一", "卷二"])
            self.assertEqual(len(groups), 2)
            self.assertEqual([s["type"] for s in r["structures"] if s["type"] == "chapter"], ["chapter", "chapter"])
            note = next(b for b in blocks if b["kind"] == "note")
            self.assertIsNotNone(note["note_target"])
            cross_note = next(b for b in r["volumes"][1]["normalized_payload"]["blocks"] if b["text"] == "跨卷注释文字")
            self.assertIsNone(cross_note["note_target"])
            self.assertTrue(any("跨卷注释关系未建立" in issue for issue in r["report"]["issues"]), repr(r["report"]["issues"]))
            self.assertTrue(any("未识别资源类型" in issue for issue in r["report"]["issues"]))
            self.assertTrue(any("manifest 图片未被 spine XHTML 引用" in issue for issue in r["report"]["issues"]))
            old_id = str(uuid.uuid4()); old_identity = root / "old-identity.json"
            old_identity.write_text(json.dumps({"format":"luna-converter-identity","tool_version":"0.1.1","work_id":str(uuid.uuid4()),"volumes":{"book":old_id}}),encoding="utf-8")
            legacy_args = type("Args", (), {"input":str(src),"out":str(root/"legacy-out"),"identity":str(old_identity),"volume_key":"book","volume_title":"全书","work_title":"分卷样书","encoding":None,"include_source":False})
            legacy = c.convert(legacy_args)
            self.assertEqual(len(legacy["volumes"]), 1)
            self.assertEqual(legacy["volumes"][0]["volume_id"], old_id)
            self.assertEqual(sum(s["type"] == "volume" for s in legacy["structures"]), 3)
            self.assertTrue(any("已有单卷 identity 保持" in issue for issue in legacy["report"]["issues"]))

    def test_appending_nav_volume_preserves_existing_volume_revisions_and_ids(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); src=root/"groups.epub"; out=root/"out"; ident=root/"identity.json"
            def write(count):
                with zipfile.ZipFile(src,"w") as z:
                    z.writestr("META-INF/container.xml", '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="O/book.opf"/></rootfiles></container>')
                    items=''.join(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(1,count+1))
                    refs=''.join(f'<itemref idref="c{i}"/>' for i in range(1,count+1))
                    z.writestr("O/book.opf",f'<package xmlns="http://www.idpf.org/2007/opf"><manifest>{items}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>{refs}</spine></package>')
                    lis=''.join(f'<li><span>卷{i}</span><ol><li><a href="c{i}.xhtml#h">第{i}章</a></li></ol></li>' for i in range(1,count+1))
                    z.writestr("O/nav.xhtml",f'<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol>{lis}</ol></nav></body></html>')
                    for i in range(1,count+1): z.writestr(f"O/c{i}.xhtml",f'<html xmlns="http://www.w3.org/1999/xhtml"><body><h1 id="h">第{i}章</h1><p>卷{i}专属正文</p></body></html>')
            args=lambda: type("Args",(),{"input":str(src),"out":str(out),"identity":str(ident),"volume_key":"book","volume_title":None,"work_title":"样书","encoding":None,"include_source":False})
            write(2); first=c.convert(args()); before=[(v["volume_id"],v["revision_id"]) for v in first["volumes"]]
            write(3); second=c.convert(args()); after=[(v["volume_id"],v["revision_id"]) for v in second["volumes"]]
            self.assertEqual(len(after),3)
            self.assertEqual(after[:2],before)

    def test_identity_maps_multiple_volumes_without_replacing_existing_ids(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); out=root/"out"; ident=root/"identity.json"
            src1=root/"one.txt"; src2=root/"two.txt"
            src1.write_text("第一卷正文",encoding="utf-8"); src2.write_text("第二卷正文",encoding="utf-8")
            def args(src,key): return type("Args",(),{"input":str(src),"out":str(out),"identity":str(ident),"volume_key":key,"volume_title":key,"work_title":"同一作品","encoding":None,"include_source":False})
            first=c.convert(args(src1,"v1")); identity_before=json.loads(ident.read_text(encoding="utf-8"))
            second=c.convert(args(src2,"v2")); identity_after=json.loads(ident.read_text(encoding="utf-8"))
            self.assertEqual(first["work"]["work_id"],second["work"]["work_id"])
            self.assertNotEqual(first["volumes"][0]["volume_id"],second["volumes"][0]["volume_id"])
            self.assertEqual(identity_before["volumes"]["v1"],identity_after["volumes"]["v1"])
            self.assertEqual(set(identity_after["volumes"]),{"v1","v2"})

    def test_package_id_hash_covers_metadata_and_optional_source(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); ident=root/"identity.json"; src=root/"book.txt"
            src.write_text("same body",encoding="utf-8")
            def args(out,title,include): return type("Args",(),{"input":str(src),"out":str(root/out),"identity":str(ident),"volume_key":"v1","volume_title":"v1","work_title":title,"encoding":None,"include_source":include})
            plain=c.convert(args("plain","Title A",False)); renamed=c.convert(args("renamed","Title B",False)); with_source=c.convert(args("source","Title A",True))
            self.assertEqual(plain["volumes"][0]["revision_id"],renamed["volumes"][0]["revision_id"])
            self.assertEqual(plain["volumes"][0]["volume_id"],renamed["volumes"][0]["volume_id"])
            self.assertNotEqual(plain["package_id"],renamed["package_id"])
            self.assertNotEqual(plain["package_id"],with_source["package_id"])
            self.assertEqual(with_source["resources"][0]["purpose"],"source")

    def test_invalid_identity_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); ident=root/"identity.json"; src=root/"book.txt"
            original=b'{"format":"unknown","sentinel":"keep"}\n'
            ident.write_bytes(original); src.write_text("正文",encoding="utf-8")
            args=type("Args",(),{"input":str(src),"out":str(root/"out"),"identity":str(ident),"volume_key":"v1","volume_title":"v1","work_title":"作品","encoding":None,"include_source":False})
            with self.assertRaisesRegex(ValueError,"identity 格式不受支持"): c.convert(args)
            self.assertEqual(ident.read_bytes(),original)

if __name__ == "__main__": unittest.main()
