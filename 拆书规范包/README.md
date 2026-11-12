# 通用拆书规范包 v0.4

本目录提供 `NTS/NKS draft-0.1` 的技术约定、九类制卡要求、可离线运行的转换器和自创样例。交接包中的流程与记录模板负责派工、公开资料研究和验收。先明确本次使用的原文和卷章范围。

- [九类制卡与验收](知识卡质检与返工.md)规定怎样采用可核实的公开资料、按对象组织卡片和逐条查验原文证据。
- 卡片正文采用轻量 Markdown，九类卡按证据登记分组检索标签。格式和标签仍写入 `content`，实际配色由软件处理。现有纯文本数据继续合法。
- [NTS／NKS 约定](NTS-NKS.md)和 [JSON Schema](schema/result.schema.json)规定结果包、稳定正文、九类字段及引用坐标。
- [标准结果样例](examples/标准结果样例.zip)使用自创短文，便于验证打包及校验工具。

## 原文转换

用 Python 3.10+ 运行标准库转换器。新作品与新逻辑卷分配 UUID。同一作品补卷复用身份清单，并为新卷使用独立的逻辑键。同一卷重跑使用原逻辑键。已有标准正文时，使用其原卷、正文版本、段落和目录。

```powershell
python -X utf8 tools/convert.py '作品.epub' --out '第一卷草稿' --identity 'identity.json' --volume-key v01
python -X utf8 tools/convert.py '第二卷.txt' --out '第二卷草稿' --identity 'identity.json' --volume-key v02 --volume-title '第二卷'
```

核对 `result.json` 的正文、目录和 `report.issues`。转换器生成的 `result.zip` 是空卡草稿。EPUB 有可验证的多卷目录和阅读顺序时可直接拆为多卷。TXT 可读取 UTF-8、带 BOM 的 UTF-16 和可严格解码的 GB18030，必要时用 `--encoding` 指定。正文、段号和摘要由程序计算。

完成卡片及 `report` 后，按交接包工具说明重打包。标准结果 ZIP 根目录放 `result.json` 和它声明的 `assets/` 等资源。身份、网页来源、复核与检索题单随交付件单独提供。`tools/review-cards.py` 可给出机器筛查提示，最终逐卡复核标题、正文、类别和证据。
