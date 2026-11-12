"""List card content and evidence risks for a human quality review."""

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from zipfile import ZipFile


JSON_LIMIT = 32 * 1024 * 1024
MARKER = re.compile(r"\[([0-9]+)\]")
PARAGRAPH = re.compile(r"p([0-9]{6,})\Z")


def read_cards(path):
    if path.suffix.lower() == ".zip":
        with ZipFile(path) as archive:
            entries = [entry for entry in archive.infolist() if entry.filename == "result.json"]
            if len(entries) != 1 or entries[0].file_size > JSON_LIMIT:
                raise ValueError("需要 ZIP 内唯一且不超过 32 MiB 的 result.json")
            data = archive.read(entries[0])
    else:
        if path.stat().st_size > JSON_LIMIT:
            raise ValueError("结果 JSON 超过 32 MiB")
        data = path.read_bytes()
    return json.loads(data)["cards"]


def normalized(value):
    return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def span_width(span):
    start = PARAGRAPH.fullmatch(span["start"])
    end = PARAGRAPH.fullmatch(span["end"])
    return int(end[1]) - int(start[1]) + 1 if start and end else 0


def main():
    parser = argparse.ArgumentParser(description="列出 NKS 结果卡的人工复核线索")
    parser.add_argument("result", type=Path, help="result.zip 或 result.json")
    args = parser.parse_args()
    cards = read_cards(args.result)
    categories = Counter(card["category"] for card in cards)
    titles = Counter((card["category"], normalized(card["title"])) for card in cards)
    contents = Counter(normalized(card["content"]) for card in cards)
    flagged = []
    bad_markers = 0
    for card in cards:
        category, content, evidence = card["category"], card["content"], card["evidence"]
        length = len(normalized(content))
        markers = {int(number) for number in MARKER.findall(content)}
        expected = set(range(1, len(evidence) + 1))
        flags = []
        if length < 100:
            flags.append("较短，检查信息是否完整")
        if titles[(category, normalized(card["title"]))] > 1:
            flags.append("同类同名，检查卡片边界")
        if contents[normalized(content)] > 1:
            flags.append("正文重复，检查卡片边界")
        if not markers:
            flags.append("正文未编号对应证据")
        elif markers - expected:
            flags.append("正文引用编号越界")
            bad_markers += 1
        if markers and expected - markers:
            flags.append("有证据未在正文标明用途")
        if len(evidence) < 2:
            flags.append("仅一处证据，按主张范围复查")
        if any(span_width(span) > 30 for span in evidence):
            flags.append("存在超过 30 段的证据，检查可否收窄")
        if category == "technique" and card["claim_type"] == "fact":
            flags.append("技巧卡标为事实，核对手法与效果的区分")
        if flags:
            flagged.append({"card_id": card["card_id"], "category": category, "title": card["title"],
                            "non_whitespace_chars": length, "flags": flags})
    print(json.dumps({"cards": len(cards), "categories": categories, "flagged": flagged,
                      "invalid_reference_markers": bad_markers,
                      "note": "仅筛查线索。卡名、类别、信息密度与证据支持关系须逐卡核验。"},
                     ensure_ascii=False, indent=2))
    return int(bad_markers != 0)


if __name__ == "__main__":
    raise SystemExit(main())
