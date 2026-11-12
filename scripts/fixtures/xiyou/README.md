# 《西遊記》回归样例

本样例来自吴承恩《西遊記》的 Project Gutenberg EPUB 23962。Project Gutenberg 将这部书标为在美国属于公有领域。样例是本项目已验收的转换及人工试拆结果，保留全书 100 回、2,981 个正文块，知识卡覆盖第一至第三回，共 31 张。46 条人工标注问题中有 11 条预期无答案。 [Project Gutenberg 原书](https://www.gutenberg.org/ebooks/23962)

| 文件或内容 | SHA-256 |
| --- | --- |
| 验收时使用的原 EPUB | `23527709a28a2ef8578dc7ee97b833ff04565e2d814a64f2a5ebabbb15b30c57` |
| `result.zip` | `f7b8e8a4010297d0e3179a38eac536ff928787e46feaba5039dc2c78258c2bdd` |
| `queries.json` | `dc41df9da4de9cd2de05ce70a636c49435c5a6dc2a6e0cc523abd0af4464dcb1` |
| 读包时得到的逻辑摘要 | `3c5d0d63f6b95a272024f17ba297b90ae2b91ea52acce05f393b1150738576c0` |

从项目根目录运行脚本。视觉验收和安装版模型验收会从此目录导入 `result.zip`。检索验收默认读取此处的样例，报告写入 `.local/search-qa`。传入自定义样例目录时，报告仍写入指定目录。检索验收使用另行安装的本地向量模型。历史转换过程记录于原工作区的 `.local/acceptance/xiyou/acceptance-notes.md`。
