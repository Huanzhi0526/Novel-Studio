# KB v2 最小可行原型（MVP）与全库 27 部实测记录

> 分支：`feat/kb-v2-mvp`（隔离运行目录：`.local/kb-v2-mvp/data/app-profile`，正式 `%LOCALAPPDATA%\Novel Studio`、`.local/model`、`release/` 与 `main` 0.1.19 基线保持只读未动）

## 1. 针对 v1 痛点的核心重构

1. **存储边界解耦（[store-v2.mjs](../app/kb-v2/store-v2.mjs)）**
   - 参考知识库独立存储于 `reference-v2.sqlite`（`user_version = 2001`），与原创写作库 `library.sqlite` 完全分离；同时完整保留标准 `work_id / volume_id / revision_id / pXXXXXX` 原文段落锚点与插图资源，无缝复用工作台阅读器高亮跳转。
2. **去预设标签的三层客观结构**
   - **第一层：人物与世界机制切面档案（`dossiers` + `dossier_facets`）**：人物拆分为 `identity_appearance`（显式收录身份外貌与各卷制服/私服/礼服/泳装等穿搭细节）、`persona_style`、`relationships`、`arc_highlights`；世界观与魔法/制度拆分为 `core_mechanism`、`cost_constraints`、`narrative_application`。每个切面独立建 FTS5 与向量索引。
   - **第二层：全书顺序剧情场次账本（`scenes`）**：按正文段号从头到尾连续切分整卷全部实质场次，客观记录场景氛围、在场人物、完整事件经过、互动张力与叙事看点，不再漏掉日常逛街、换装、用餐、约会等非主线桥段。
   - **第三层：细粒度原文滑窗切片（`passage_chunks`）**：确定性按章切分约 420 字原文段落窗口并建立双字 Bigram + 分词 FTS5 与 1024 维向量，直接兜底微观服饰、动作、神态与台词描写。
3. **混合分词、三档检索模式与显卡加速（[text-index.mjs](../app/kb-v2/text-index.mjs)、[search-v2.mjs](../app/kb-v2/search-v2.mjs)、[retrieval-v2.mjs](../app/kb-v2/retrieval-v2.mjs)、[embedding.mjs](../app/main/embedding.mjs)）**
   - **CJK 词 + 双字 Bigram 混合索引**：剥离自然语言疑问壳（如“有哪些……情节？”），消除 `Intl.Segmenter` 将“装逼打脸”“修罗场”切碎成单字导致的零召回问题。
   - **Vulkan 显卡加速、空闲自动释放与断连自愈**：在 `.local/kb-v2-mvp/llama-cpp-vulkan` 隔离接入官方 Vulkan 运行库（绑定 `RTX 4060 Laptop GPU` / `Vulkan0`，只读复用 `.local/model` 权重，与 CPU 向量余弦相似度 `0.9994+` 100% 兼容）；支持 **3 分钟空闲自动卸载**（释放显存与独显唤醒状态）、空闲临界态 `ECONNRESET` 自动重连单次重试，以及 **CPU 自动回退**（异常时自动剥离 GPU 参数切回 CPU 运行库）。
   - **本地混合模式（`local`）**：秒级三层 FTS5 + 本地 `Qwen3-Embedding-0.6B` 1024 维向量 RRF 融合。
   - **AI 快速模式（`fast`）**：具象化情境/描写线索展开 + 多路召回 + 选片参谋归纳「创作参考导读」与单条「参考看点」。
   - **AI 深度翻书模式（`deep`）**：Agentic 多轮只读工具循环（`search_scenes` / `search_dossiers` / `search_passages` / `read_original_range`），支持直接翻阅分卷真实原文段落核证细节并拦截任何未验证引用。

## 2. 首轮两部样板书（全 30 卷）性能基线

早期对《败北女角太多了！》全 **8 卷**与《公女殿下的家庭教师》全 **22 卷**（共 **30 卷、112,621 正文块**）开展首轮并发拆解与显卡向量加速对比：
- **显卡向量化提速对比**：此前 CPU 双路构建 1,651 条向量耗时 `1,583s`（约 26.4 分钟，约 `958ms/条`）；切换 `RTX 4060 Vulkan0` 后，构建 **5,964 条新向量（含 SQLite 事务落盘）仅耗时 `191.4s`（约 3.2 分钟，单批纯推理约 `20ms/条`）**，提速约 **30～50 倍**。

## 3. 全库 27 部参考书（278 卷 / 1,110,178 块）全卷无截断建库与端到端实测

针对实测发现的 `agy.exe acp` 单次 `session/prompt` 约 `192 KB`（`196,608` UTF-8 字节）输入截断边界，升级按章节对齐的 `<= 148 KB` 连续分段续拆与正篇末尾覆盖校验（`fullCoverage: true`），对全部 **27 部参考书、278 卷**完成零截断拆解、跨全卷切面汇总与全量 GPU 向量化：

| 汇总维度 | 全库最终实测数据 |
| --- | ---: |
| 覆盖作品与分卷数 | **27 / 27 部**、**278 / 278 卷（100% 满卷无截断）** |
| 标准正文总块数（`blocks`） | **1,110,178 块** |
| 跨全卷人物与世界设定档案（`dossiers`） | **676 份** |
| 独立检索切面（`dossier_facets`） | **1,575 条** |
| 全书顺序剧情场次（`scenes`） | **9,077 场** |
| 细粒度原文滑窗切片（`passage_chunks`） | **80,917 片** |
| 本地 `Qwen3-Embedding-0.6B` 1024d 向量总数 | **91,569 条**（切面 1,575 + 场次 9,077 + 切片 80,917，100% 对齐） |
| 独立参考库体积（`reference-v2.sqlite`） | **`1,630.5 MB`**（已执行 `PRAGMA wal_checkpoint(TRUNCATE);`） |

### 全库桌面端 Playwright 端到端冒烟实测（`qa-ui-v2.mjs`）

在满载 **91,569 条向量**与 **27 部全书库**的真实 Electron 桌面窗口（无外部代理环境变量裸启动）下实测：
- **存储隔离验证**：`reference.list` 完整列出全部 **27 部**参考书；同目录原创库 `library.sqlite` 中 `reference_works = 0`，实现彻底物理隔离。
- **本地混合模式（`local`）**：自动按需拉起 `Vulkan0` GPU（`embeddingMode: "gpu"`），全库 9.15 万条向量 + 三层 FTS5 混合检索返回 12 张多层级卡片耗时 **`2.25s`（`2,249ms`）**，长篇后半程分卷（第 5～8 卷等）精准命中。
- **AI 快速模式（`fast`）**：自然语言问句「有哪些约会情节？」端到端展开线索、多路召回并生成跨书选片导读总耗时 **`19.5s`（`19,496ms`）**，稳定返回 12 张精选卡片。
- **AI 深度翻书模式（`deep`）**：自然语言问句「有哪些能力或魔法的使用限制与代价？」经多轮工具翻书与原文核证，横向归纳《无尽连锁》《蜘蛛》《佐佐木与文鸟》《家庭教师》《沉默魔女》《漫步》《没有信徒的女神》《不死冒险者》《绝对神境》等 9 部作品的四大代价流派，总耗时 **`42.0s`（`42,041ms`）**；点击首条引用链接 `[1]` 直达独立阅读器并精准高亮 **14 段**真实原文。

## 4. 启动、维护与测试命令

```powershell
# 启动隔离的 KB v2 桌面端原型（显式指向 .local/kb-v2-mvp/data/app-profile）
npm run start:kb-v2

# 运行前端打包与全量单元测试（共 65 项）
npm run build
npm test

# 审计 27 部全库 JSON 覆盖度 / 原子同步入库并补齐 Vulkan GPU 向量
node --disable-warning=ExperimentalWarning scripts/kb-v2/subagent-tail-prep.mjs prep
node --disable-warning=ExperimentalWarning scripts/kb-v2/finalize-sync-v2.mjs

# 运行全库 27 部桌面端 Playwright 三模式端到端冒烟验证
node --disable-warning=ExperimentalWarning scripts/kb-v2/qa-ui-v2.mjs
```
