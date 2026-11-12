> 已完成：2026-11-13合并main（8eae11f）、完整备份、无重算迁移与正式0.2.0升级。后续以HANDOFF顶部上线完成记录为准；下方保留交付时历史操作建议。

> 2026-11-13 GPT审阅接续：用户已授权合并main、完整备份后正式迁移与0.2.0升级，并允许打包版未配置API时使用本机agy。本文下方为Gemini交付时的历史说明，以下“待授权”“打包态不挂CLI”描述已由本轮授权和实现接续。审阅修正：兼容API调用透传独立预算；v2禁止旧ZIP导入写入原创共库；应用内备份包含独立v2库、恢复失败回退双库；agy工作目录位于资料目录且按需启动。实际原创库user_version=1；fullCoverage是台账/结构检查，不是人工内容完备性证明。当前状态见HANDOFF顶部与正式升级回执。

# KB v2 分支交接与合并迁移说明（供接手 Agent / GPT 审阅）

> **分支状态**：所有代码与文档变更均位于实验分支 `feat/kb-v2-mvp`；`main` 基线（`371be17`，`0.1.19`）完全未动。  
> **安全边界核验**：正式 `%LOCALAPPDATA%\Novel Studio`（仅以 `mode=ro` + `PRAGMA query_only=ON` 只读导出 27 部参考书正文与插图）、正式安装目录 `%LOCALAPPDATA%\Programs\Novel Studio`、共享模型目录 `.local/model`、历史备份 `.local/night-final-20261112-0606` 及 `release/` 下既有安装包/源码包/校验清单**全部保持只读原状，零写入、零覆盖、未重打 0.1.19 包**。

---

## 1. 本轮工作与最终交付成果总览

按照用户确认的 KB v2 架构方向与全量无截断拆书指令，在隔离目录 `.local/kb-v2-mvp/` 与分支 `feat/kb-v2-mvp` 上完成了全部 **27 部参考书（278 卷 / 1,110,178 正文块）** 的 100% 满卷覆盖拆解、跨卷切面汇总、GPU 向量入库及桌面端三模式实测闭环：

1. **存储边界物理分离**：新建独立 SQLite 数据库 `reference-v2.sqlite`（`user_version = 2001`，WAL 已 `TRUNCATE` 归并，单文件体积 **`1,630.5 MB`**），与原创写作库 `library.sqlite`（`user_version = 4`）彻底解耦；同时 100% 保留既有 `work_id`、`volume_id`、`revision_id`、`structures`、`assets` 与 `pXXXXXX` 段落编号身份，无缝兼容工作台现有的原文阅读器与高亮定位。
2. **三层去预设标签客观知识结构（全库最终规模）**：
   - **L1 人物与世界机制切面档案（`dossiers = 676` 份，`dossier_facets = 1,575` 条）**：人物拆分为 `identity_appearance`（含身份外貌与跨卷制服/私服/礼服/泳装/武装等具体穿搭细节）、`persona_style`、`relationships`、`arc_highlights`；世界观/能力/制度拆分为 `core_mechanism`、`cost_constraints`、`narrative_application`。
   - **L2 全书顺序剧情场次账本（`scenes = 9,077` 场，278/278 卷 100% 满卷覆盖）**：按正文段号从头到尾连续覆盖整卷全部实质场次（日常逛街、用餐、换装、约会、授课、探索、战斗全部客观入账），杜绝旧版“预设口号标签过拟合”与长卷截断导致的漏召回。
   - **L3 原文细粒度滑窗切片（`passage_chunks = 80,917` 片）**：按章切分约 420 字（上限 640 字，带段尾重叠）的确定性原文切片，直接兜底微观服饰、神态、动作、环境与台词描写。
   - **本地 Qwen3 1024 维向量索引（`vectors = 91,569` 条，100% 对齐）**：`facet` 1,575 条 + `scene` 9,077 条 + `passage` 80,917 条，全部由 `RTX 4060 Laptop GPU`（`Vulkan0`）构建落盘。
3. **混合分词与三档检索模式（`local` / `fast` / `deep`）**：
   - **CJK 分词 + 双字 Bigram 混合 FTS5**：剥离自然语言疑问壳（如“有哪些……情节？”），解决 `Intl.Segmenter` 将“装逼打脸”“修罗场”切碎成单字导致的 FTS 失效问题。
   - **三档模式切换**：`本地混合`（毫秒级三层 FTS5 + Qwen3 1024d 向量 RRF 融合）、`AI 快速`（具象化情境线索展开 + 54 候选多路召回 + 选片参谋导读与单条看点）、`AI 深度翻书`（Agentic 多轮调用 `search_scenes` / `search_dossiers` / `search_passages` / `read_original_range` 翻阅真实原文核证细节，并强制拦截任何未召回的幻觉引用）。
4. **Vulkan 显卡推理加速 + 闲置自动卸载 + 断连重连 + CPU 自动回退**：
   - 在 `.local/kb-v2-mvp/llama-cpp-vulkan/llama-server.exe` 额外部署官方 `llama.cpp` Vulkan 运行库（绑定 `Vulkan0: NVIDIA GeForce RTX 4060 Laptop GPU`，只读复用 `.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf`，模型标识 `Qwen3-Embedding-0.6B-Q8_0:639150592:1794235447360` 不变，与原 CPU 向量余弦相似度 `0.9994+` 完全兼容）。
   - `EmbeddingProvider` 支持 `idleTimeoutMs = 180000`（闲置 3 分钟自动杀进程释放约 0.8 GB 显存并允许笔记本独显休眠，下次检索自动无感拉起）、空闲临界态 `ECONNRESET / ECONNREFUSED / EPIPE` 自动单次重连重试，以及 `fallbackRuntimePath`（GPU 启动异常时自动剥离 `-ngl` / `--device` 等参数无缝切回 CPU `llama-server.exe`）。
5. **关键截断与竞态修复记录（供审阅备查）**：
   - **ACP `192 KB` 单次请求体截断根因与分段续拆修复**：实测发现 `agy.exe acp` 对单次 `session/prompt` 请求在约 `196,608` UTF-8 字节（`192 KB`）处静默截断输入，导致早期 250～480 KB 的单卷小说在段号 `1800～2500` 附近被截断。已在 `split-all-library-v2.mjs` 与 `subagent-tail-prep.mjs` 中实现按章节对齐的 `<= 148 KB`（失败回退 `74 KB`）连续分段续拆与 `isTailFullyCovered` 正篇末尾校验（`fullCoverage: true`），对全部截断卷完成尾段补拆与整书档案重算，实现 **278 / 278 卷零截断满卷覆盖**。
   - **`AgyFlashClient` 进程重置竞态修复**：修复旧 `agy.exe` 子进程超时重置后延迟触发 `exit` 事件误杀新子进程 `pending` 请求的竞态（在 `onProcessDown` 首行校验 `if (this.child !== child) return;`，并在 `#createConfiguredSession` 报 `Unknown model ID` / `Authentication required` 时立即销毁失步子进程），已补充回归单测。

---

## 2. 代码变更清单与模块职责（`git diff main...feat/kb-v2-mvp`）

### 2.1 新增核心模块（`app/kb-v2/`）

| 文件 | 职责与关键接口说明 |
| --- | --- |
| `app/kb-v2/text-index.mjs` | 自然语言疑问壳剥离（`extractQueryCore`）、CJK 词 + 双字 Bigram 混合分词（`tokenizeForIndex`、`extractSearchTermsV2`）及 FTS5 `MATCH` 表达式构造（`buildFtsMatchExpression`）。 |
| `app/kb-v2/store-v2.mjs` | `ReferenceStoreV2`：管理独立的 `reference-v2.sqlite`（`user_version = 2001`）。包含幂等入库 `ingestExportedBook`、`replaceVolumeScenes`、`replaceWorkDossiers`、`volumeOrderNumber`（正确排列前传 0、中文数字卷与短篇特典），以及向上兼容原渲染层 IPC 的适配器方法：`list`、`setHidden`、`listCards`、`getCard`、`editCard`、`read`、`asset`。 |
| `app/kb-v2/search-v2.mjs` | `SearchEngineV2`：三层向量索引构建 `prepare`、本地三层混合 RRF 检索 `query`（含分页游标与 `generation` 失效保护），以及供深度模式调用的 4 个只读工具（`toolSearchScenes`、`toolSearchDossiers`、`toolSearchPassages`、`toolReadOriginalRange`，严格遵守作品筛选范围与封存排除）。 |
| `app/kb-v2/retrieval-v2.mjs` | `RetrievalEngineV2`：统一调度 `local`、`fast`、`deep` 三种模式；复用 `ExpansionService` 管理 `retrieval-api.json` 加密 API 配置（支持 `setting` 全方法）；内置 `parseLooseJson`（自动修复长 JSON 字符串内未转义控制字符、尾随逗号及上游流中断提示）。LLM 调用优先级：`customComplete` > 用户已在 `retrieval-api.json` 保存的接口配置 > 开发态 `fallbackComplete` > 自动降级本地三层混合检索。 |
| `app/kb-v2/agy-client.mjs` | `AgyFlashClient`：面向本机未打包开发态的零配置 Gemini 3.8 Flash（`thought_level=low`）ACP 桥接客户端。内置 `resolveAgyExecutable`（自动穿透 Codex MSIX 沙箱定位物理 `agy.exe`）、`resolveWindowsSystemProxy`（自动读取 Windows 注册表 `Internet Settings` 系统代理供 Go 进程使用）、单 RPC 超时重置与旧子进程隔离保护、`AbortSignal` 取消支持及启动预热 `warmup()`。 |

### 2.2 主进程与渲染层最小侵入改动

| 文件 | 改动说明与向后兼容性 |
| --- | --- |
| `app/main/embedding.mjs` | 新增 `stripGpuArgs`、`fallbackRuntimePath`（GPU 启动失败自动剥离 GPU 参数并切回 CPU 运行库）、`idleTimeoutMs`（闲置自动卸载子进程并在下次 `embed()` 无感重启）、`ECONNRESET / ECONNREFUSED / EPIPE` 自动重连单次重试、自定义 `--ctx-size` 去重，以及离线单测 `spawnImpl` 注入点。默认行为 100% 兼容旧调用方。 |
| `app/main/expansion.mjs` | `ExpansionService.complete` 透传 `options`（如 `maxTokens`、`timeoutMs`、`disableThinking`），不影响原创括号扩写原有 5200/3400 上下文预算与行为。 |
| `app/main/index.mjs` | 1) 通过 `useKbV2 = process.env.NOVEL_STUDIO_KB_V2 === '1' \|\| existsSync(join(dataDir, 'reference-v2.sqlite'))` 自动探测启用 KB v2（若目标 `dataDir` 下无 `reference-v2.sqlite` 且未设环境变量，则完全走旧 v1 `ReferenceService` + `SearchService` + `RetrievalService`）。<br>2) `modelOptions(preferVulkan)` 支持从 `embedding.json` 读取 `fallbackRuntimePath`、`extraArgs`、`idleTimeoutMs`、`startupTimeoutMs`；开发态启用 KB v2 且存在 Vulkan 运行库时自动优先使用 GPU + 3 分钟闲置卸载。<br>3) `app.info` 新增返回 `kbV2: boolean` 与 `embeddingMode: 'gpu' \| 'cpu' \| 'cpu-fallback' \| null`。<br>4) **打包态安全边界**：仅当 `!app.isPackaged` 时挂载 `AgyFlashClient` 作为无 API Key 时的默认回退；正式打包安装版（`app.isPackaged === true`）默认不依赖本机 CLI，严格使用用户在「资料与设置 → AI 辅助检索」配置的兼容 API（未配置或网络失败时优雅回退本地三层混合检索）。 |
| `app/renderer/App.jsx`、`Reference.jsx`、`Conversation.jsx`、`ui.jsx`、`app.css` | 当 `info.kbV2 === true` 时，检索栏底部展示 `本地混合 / AI 快速 / AI 深度翻书` 三档分段开关、创作参考导读横幅（`.v2-synthesis`）与层级徽章（`人物切面 / 设定切面 / 剧情场次 / 原文切片`）；当 `info.kbV2 === false` 时完全保持 0.1.19 原界面不变。 |
| `package.json` | 新增开发脚本 `"start:kb-v2": "node scripts/kb-v2/start-v2.mjs"`（默认指向 `.local/kb-v2-mvp/data/app-profile`）。 |
| `tests/embedding-provider.test.mjs`、`tests/kb-v2.test.mjs` | 新增闲置自动卸载重启测试、GPU 故障剥离参数回退 CPU 测试、KB v2 存储解耦测试、分词与疑问壳剥离测试、卷序排列测试、`AgyFlashClient` 旧子进程退出隔离测试，以及 `local / fast / deep` 三档检索与防幻觉引用拦截单测（全套 `npm test` 共 **65 项全部通过**）。 |

### 2.3 工具与批处理脚本（`scripts/kb-v2/`）

- `scripts/kb-v2/start-v2.mjs`：隔离目录一键启动器（`npm run start:kb-v2`）。
- `scripts/kb-v2/export-all-v2.mjs`：调用 `scripts/export-reference-input.mjs` 从正式 `library.sqlite` 只读导出全部 27 部在用参考书至 `.local/kb-v2-mvp/samples/<work_id>`，生成 `.local/kb-v2-mvp/reports/export-all-manifest.json`。
- `scripts/kb-v2/split-all-library-v2.mjs`：全书库（27 部 / 278 卷）连续队列 `<= 148 KB` 分段无截断拆书 + 跨卷切面汇总 + RTX 4060 Vulkan 向量构建脚本，内置 LRU 内存上限控制、幂等断点续跑及 5 小时配额窗口自动等待保护。
- `scripts/kb-v2/subagent-tail-prep.mjs`：多并发子代理无锁 JSON 分片协同工具（支持 `prep` 全库覆盖度审计与尾段导出、`apply-vol` 尾段无截断校验合并、`build-obs` 全书观测聚合、`apply-synth` 整书切面档案校验落盘）。
- `scripts/kb-v2/finalize-sync-v2.mjs`：单进程原子同步全部 JSON 提取产物至 `reference-v2.sqlite`、补齐 GPU 向量、执行 `PRAGMA wal_checkpoint(TRUNCATE);` 并输出最终台账。
- `scripts/kb-v2/split-book-v2.mjs`：早期样板书拆解脚本（保留备查）。
- `scripts/kb-v2/eval-retrieval-v2.mjs` & `scripts/kb-v2/qa-ui-v2.mjs`：真实语料三模式评测脚本与 Playwright Electron 桌面端全 27 部端到端冒烟验收脚本。

---

## 3. 本机隔离产物位置清单（均在 `.gitignore` 忽略范围内，不入 Git）

| 路径 | 内容说明 |
| --- | --- |
| `.local/kb-v2-mvp/data/app-profile/reference-v2.sqlite` | **核心成品库（`1,630.5 MB`，已 WAL TRUNCATE 归并）**：包含全部 27 部（278 卷、1,110,178 块、插图资源）标准正文，以及全库无截断拆解出的 `676` 份档案、`1,575` 条切面、`9,077` 场顺序场次、`80,917` 片原文切片、三层 FTS5 索引与 `91,569` 条 1024 维 Qwen3 向量。 |
| `.local/kb-v2-mvp/data/app-profile/embedding.json` | KB v2 隔离配置：指向共享 `.local/model/Qwen3-Embedding-0.6B-Q8_0.gguf`、Vulkan `llama-server.exe`、CPU 回退路径及 3 分钟闲置卸载参数。 |
| `.local/kb-v2-mvp/data/extractions/<work_id>/` | 全部 27 部作品共 278 份满卷拆解 JSON（`<volume_id>.json`，均已验证 `fullCoverage: true`）与 27 份跨全卷合成档案 JSON（`dossiers-synthesized.json`），永久保留以便日后无需重跑模型即可调整入库规则或瞬间重建 SQLite。 |
| `.local/kb-v2-mvp/llama-cpp-vulkan/` | 官方 `llama.cpp` Windows x64 Vulkan 运行库（`llama-server.exe`、`ggml-vulkan.dll` 等）。 |
| `.local/kb-v2-mvp/samples/<work_id>/` | 从正式库只读导出的 27 部标准输入包（`result.json` + `assets/`）。 |
| `.local/kb-v2-mvp/reports/` | 导出清单 `export-all-manifest.json`、全库最终进度台账 `full-library-progress.json` / `.md`、配额快照 `quota-after-full-library.json` 及全库 UI 冒烟报告 `ui-smoke-v2.json`（含界面截图）。 |

---

## 4. 后续合并 `main` 与正式环境迁移操作手册（待用户向 GPT 下达正式指令后执行）

> **注意**：当前仅完成实验分支开发与隔离全库构建，**尚未合并 `main`，也未改动 `%LOCALAPPDATA%\Novel Studio`**。当用户确认合并上线时，建议按以下顺序操作：

### 第一步：代码审查与合并前检查
1. 运行 `npm run build` 与 `npm test`，确认 **65 项单测全部通过**。
2. 审阅两点产品收尾细节（按需调整）：
   - **导入入口兼容**：目前 `app/main/index.mjs` 在 `useKbV2` 模式下仍将顶栏「导入标准结果包」绑定在原 `ImportService`（写入 `library.sqlite`），而新书入库走 `ReferenceStoreV2.ingestExportedBook` + 拆书脚本。合并正式版时，可决定是在 UI 隐藏旧 v1 ZIP 导入按钮，还是将其接到 `storeV2.ingestExportedBook`。
   - **打包安装脚本（`setup.nsi` / `scripts/release.mjs`）**：若要重打正式版安装包（如升级版本号至 `0.2.0`），确保 `app/kb-v2/` 目录随 `app/` 一并打入 `resources/app`（当前打包脚本若按整个 `app/` 复制则已天然包含，建议核验一次）。

### 第二步：正式资料目录无损迁移（零重拆、零重算向量！）
由于 `.local/kb-v2-mvp/data/app-profile/reference-v2.sqlite` 使用的 `work_id / volume_id / revision_id` 与正式库 100% 同源，且 `model_id`（`Qwen3-Embedding-0.6B-Q8_0:639150592:1794235447360`）与正式模型完全一致，**无需重新拆书或重新计算任何一条向量**：

1. **确认正式程序已退出**，先对正式 `%LOCALAPPDATA%\Novel Studio` 做一次完整一致备份。
2. **复制成品参考库 v2**：`.local/kb-v2-mvp/data/app-profile/reference-v2.sqlite` 已完成 `PRAGMA wal_checkpoint(TRUNCATE);`，可直接复制为 `%LOCALAPPDATA%\Novel Studio\reference-v2.sqlite`。
   - 应用启动时检测到 `%LOCALAPPDATA%\Novel Studio\reference-v2.sqlite` 存在，即自动启用 `useKbV2 = true`！
   - 原 `%LOCALAPPDATA%\Novel Studio\library.sqlite` 中的用户**原创作品、章节、草稿、历史与标记**完全原封不动继续服务于写作模块；其中旧的 `reference_*` 表不再被查询，可在验证稳定后再决定是否清理并 `VACUUM` 回收磁盘空间。
3. **启用正式环境 Vulkan 显卡加速**：
   - 可将 `.local/kb-v2-mvp/llama-cpp-vulkan` 移至 `.local/model/llama-cpp-vulkan`（或保留原处），并更新 `%LOCALAPPDATA%\Novel Studio\embedding.json`，加入 `runtimePath`（指向 Vulkan 版 `llama-server.exe`）、`fallbackRuntimePath`（指向原 `.local/model/llama-cpp/llama-server.exe`）、`extraArgs`（`["-ngl", "99", "--device", "Vulkan0", "--ctx-size", "16384", "--batch-size", "2048", "--ubatch-size", "1024"]`）及 `"idleTimeoutMs": 180000`。
4. **正式版 AI 检索接口说明**：
   - 正式目录 `%LOCALAPPDATA%\Novel Studio\retrieval-api.json` 中用户原有的加密 API 配置会被 `RetrievalEngineV2` 直接无缝读取复用（兼容 `ExpansionService` v1/v2 格式与当前 Windows 用户 `safeStorage`）。若用户希望正式安装版（`app.isPackaged === true`）在未配 API Key 时也能走本机 `agy.exe` 桥接，只需将 `app/main/index.mjs` 中挂载 `AgyFlashClient` 的 `!app.isPackaged` 条件放宽为检测本机存在 `resolveAgyExecutable()` 即可。
