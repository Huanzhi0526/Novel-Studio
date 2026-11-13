# 维护地图

这份文档面向接手开发的人。当前版本、正式库统计和待办见 [HANDOFF](../HANDOFF.md)。安装、写作及备份操作见 [README](../README.md)。

## 代码入口

| 任务 | 入口与责任 |
| --- | --- |
| 桌面壳与 IPC | `app/main/index.mjs` 启动 Electron、设置资料根目录和注册白名单 IPC。渲染页通过 `app/main/preload.cjs` 暴露的接口访问本地服务。 |
| 原创书架与编辑 | `app/renderer/App.jsx` 负责导航。书架与封面用 `OriginalBookshelf.jsx`、`BookCover.jsx`、`book-cover.css`。正文、卷章和资料由 `Writing.jsx`、`ManuscriptDirectory.jsx`、`WritingResources.jsx` 负责。 |
| 原创存储 | `app/main/writing.mjs` 处理卷章、资料、恢复稿、历史与标记。保存和切换按正文修订号校验。界面续写位置在 `app/renderer/writing-session.mjs`。 |
| 参考导入与阅读 | `app/main/protocol.mjs` 校验结果包，`reference.mjs` 事务入库、读正文与卡片。界面由 `Reference.jsx`、`reader-workspace.css` 提供。 |
| 知识卡详情与编辑 | `Reference.jsx` 的 `CardEditor` 默认提供阅读视图，原文证据折叠。点编辑后挂载同文件的 `CardForm`，取消时丢弃表单并回到阅读。共享弹窗与卡片展示位于 `ui.jsx`。`CardContent.jsx` 使用锁定的 `react-markdown` 渲染受限格式、识别标准标签分组；`card-content.css` 统一九类配色、标签色和摘要高度。 |
| 参考检索 | `app/main/search.mjs` 融合关键词和本地向量。向量进程由 `embedding.mjs` 管理。对话式检索 UI 位于 `Conversation.jsx`。 |
| 外部 AI 辅助检索 | `app/main/retrieval.mjs` 先生成最多三条改写，再合并最多 36 张候选卡摘录，请模型返回有效候选编号。候选召回阶段放宽向量门槛，最终按模型选择返回已有卡片。沿用检索的作品和类别范围、取消与失效检查。 |
| 设置与检索界面 | `App.jsx` 的设置分类切换保留各组表单，`workspace-settings.css` 管理宽窄布局。`Conversation.jsx` 的检索模式和接口入口位于输入区，`reference-bookshelf.css` 管理参考页的宽度、工具栏及阅读间距。 |
| AI 扩写 | `ExpansionDialog.jsx` 和 `Writing.jsx` 管理选区及原位预览。`app/main/expansion.mjs` 限制上下文、保存配置，`expansion-provider.mjs` 调用兼容接口。 |
| 本地数据库和备份 | `app/main/store.mjs` 定义 SQLite 表与版本。`backup.mjs` 生成一致快照，检查恢复包并保留恢复前副本。 |
| 构建和发布 | `scripts/setup-electron.mjs` 安装已锁定运行时，`start.mjs` 启动开发版，`build.mjs` 构建界面，`release.mjs` 和 `setup.nsi` 打包 Windows，`package-source.mjs` 输出可移交源码 ZIP。 |
| Windows 图标 | `app/assets/app-icon.png` 为黑白钢笔尖母版及窗口图标，多尺寸 ICO 用于 Windows。打包时 `scripts/embed-windows-icon.ps1` 写入 Electron 可执行文件的副本，NSIS 同步安装器和卸载器图标。升级脚本通知桌面刷新快捷方式。若更新 Electron 后资源布局校验失败，应重新检查图标资源 ID 与语言。 |

## 资料和迁移

- 源码 ZIP 用于开发。新机器解压后依次执行 `npm ci`、`npm run setup:electron` 和 `npm run build`，用 `npm start` 打开独立开发资料。核对生产问题时，应先复现于隔离资料。需要指定目录时使用 `NOVEL_STUDIO_DATA_DIR`，需要关键词模式时使用 `NOVEL_STUDIO_NO_MODEL=1`。
- 应用备份使用 SQLite 一致快照，适合转移原创、暂存、标记、历史、参考原文、图片、卡片和索引。程序运行中若需复制资料，用应用备份。手动回退数据库快照前先正常退出并保留现有 SQLite、WAL 和 SHM。旧版到新版涉及数据变化时，先在备份的副本上验证。
- 参考库快照按作品提供标准结果 ZIP，适合在新库中逐本审核导入。迁移原创仍用应用备份。可选模型从独立模型包解压到新资料根目录，再按应用提示重建索引。正式库当前的模型路径指向工作区 `.local/model`，目录搬动后检查 `embedding.json`。
- AI 扩写凭证由当前 Windows 用户加密，迁机时重新填入。UI 主题、写作设置及最近位置保存在资料目录下的 Chromium 本地存储。项目源码包和应用 SQLite 备份均与这些凭证及偏好分开。
- AI 辅助检索的接口配置和加密密钥保存在资料目录的 `retrieval-api.json`。在「资料与设置 → AI 辅助检索」填写完整 Chat Completions 地址、模型名及密钥，保存后可测试连接。检索页勾选「外部 AI 辅助」才调用服务，发送问题和候选知识卡前 2,400 字，返回既有卡片与引用。接口失败回退本地检索，取消和库变更会终止此次结果。配置与原创扩写分别管理。
- `.local` 同时存放活跃模型、原文档案、历史验收和可重建测试副本。按具体目录核对用途后再归档。源码包通过指定目录构建，省去安装产物、用户资料、参考原文和依赖缓存。

## 协议和知识库

正式库的知识卡曾为重构清空，现已按用户授权导入拆书交付共 910 张卡（格式标签简验，内容未深审）。入库正文、卷册身份及已有导入记录继续用于版本核对。重建卡片的结果包需要新的 `package_id`，先走隔离审核和证据定位。历史清空操作与校验结果见[知识卡归档与清空](acceptance.md#知识卡归档与清空)，当前两本的导入与备份见[标准升级导入记录](acceptance.md#2026-11-11-两书标准升级简验与正式导入)。

外部拆书使用原文、[独立交接包](../待拆书交接/README.md)和[提示词](../待拆书交接/拆书Agent接手提示词.md)。Agent 优先利用已核实的公开资料，再按[九类制卡与验收](../拆书规范包/知识卡质检与返工.md)完成卡片、证据和真实问句。应用内审核通过后才进入参考库。

通用派工标准采用受限 Markdown 和九类分组标签，继续使用 `content`。0.1.19 起，卡片详情、书架、导入审核和检索结果共用受限渲染：二／三级标题、短段落、粗体、列表、短引用及证据编号。九类标记和粗体强调沿用类别色，正文保持阅读底色；`检索标签` 标题下的无序列表按 `分组｜标签、标签` 显示标签，身份、性格、关系、能力、条件代价、情节、空间等分组各有配色，未知分组及旧式 `检索标签｜…` 用中性色。普通正文不猜测标签或自动补重点。HTML 不执行，链接只显示文字，图片不加载。编辑、存储、索引继续使用原始字符串，无数据库迁移。现有卡片的格式、标签整理按用户指定批次进行，专书返工范围在 HANDOFF 中登记。将格式整理、标签补充、具体桥段补卡与全文核读分别验收。

封存保留原书及卡片，应用使用参考作品的既有隐藏状态。检索范围同时排除关键词和语义候选，书架把封存作品单独展示。逐本重拆后先在隔离资料目录核对差异和检索，正式审核写入后才从「封存书目」恢复单本。恢复单本无需替换数据库快照。

版本与段落编号属于正式引用的一部分。补卷沿用原作品身份，正文修订进入对应卷的新版本，历史卡仍引用当时正文。涉及协议兼容的改动同步更新 Schema、示例、转换器、校验器和验收文档。[历史 ADR](adr) · [知识库档案](knowledge-library.md)

本机知识库旧批次脚本分布在 `.local/knowledge-library`，包含正式导入模式和历史版本假设。接手时先读 [当前待办](../HANDOFF.md#正式参考库与待办) 并在隔离安装复核结果。

## 给外部 Agent 准备原文

本机派工入口为项目内 `拆书工作区/Novel Studio 拆书派工`。全量原文已集中在 `原文`，内有 EPUB／TXT 原档和按书打包的已入库同版正文。从同一目录取交接 ZIP、提示词和本次所选原文。`先看这里.md` 指引选择，`原文目录.md` 可按书定位，`来源与校验.json` 保留来源路径与摘要。

| 本机位置 | 可提供的原文 |
| --- | --- |
| `.local/knowledge-library` 下的批次与书目子目录 | 下载及整理的原档，历史批次路径用于追溯 |
| `D:\Vibe Coding\Novel Studio 知识库归档\2026-11-10-清空前\拆书交接旧版\待拆书交接\原文` | 随旧交接文件夹归档的 63 份原文副本，清单在上一层 |
| `%LOCALAPPDATA%\Novel Studio\library.sqlite` | 当前同版入库正文及目录、图片、注释。2026-11-11 核验为 27 部、278 卷；桌面已有 26 部、256 卷 ZIP 是此前导出截点，新增或更换范围时先核对身份与版本，再只读导出 |

新书直接选 EPUB／TXT。多文件可以作为一个原文 ZIP 交付。已入库作品在本机用以下命令列书和卷，按派工范围导出。`export` 需要显式选卷。直接传卷 ID 时取最新入库版本，用 `卷ID@正文版本` 可指定版本。脚本只读读取参考书目、卷、正文、目录和引用的图片。

```powershell
$library = Join-Path $env:LOCALAPPDATA 'Novel Studio/library.sqlite'
node --disable-warning=ExperimentalWarning scripts/export-reference-input.mjs list $library
$workId = '<作品 ID>'
node --disable-warning=ExperimentalWarning scripts/export-reference-input.mjs list $library $workId
$volumeId = '<所选卷 ID>'
$draft = '.local/本次派工原文'
node --disable-warning=ExperimentalWarning scripts/export-reference-input.mjs export $library $workId $draft $volumeId
python -X utf8 '待拆书交接/工具/pack-result.py' $draft --out '.local/本次派工原文.zip'
node '待拆书交接/工具/校验器/validate-result.mjs' '.local/本次派工原文.zip'
```

导出目录应尚未存在。多卷在命令末尾依次列出。只把生成的原文 ZIP 作为三样派工材料之一。作品与卷身份、正文版本和段号由 ZIP 带给接手 Agent。

### 扫描外部交付与标记原文

用户通知项目内「拆书工作区/本地知识库拆书」有成品时，从项目根目录运行：

```powershell
pwsh -File scripts/scan-book-reviews.ps1
.\scripts\scan-book-reviews.ps1 | Where-Object 待打开
```

每部作品放在提交根目录的一个子目录。扫描优先看 `施工输出/交付`，再看 `施工输出`、`交付` 和书目录本身，使用首个含 `result.zip` 或 `result-*.zip` 的目录。正式交付请放在同一优先目录。多个同批 ZIP 分别验收，探路稿和中间产物留在别处。可用 `-Root` 指向其他提交根目录。

对「待验收」和「待复验」的文件执行离线校验、隔离入库、检索及原文抽查。逐包核对范围、证据、受限 Markdown 卡面和九类检索标签，再更新书目录的 `验收状态.json`。其 `packages` 数组每条保存 `result`（相对路径）、`sha256`、`packageId`、`status`（`已验收` 或 `待返工`）、`checkedAt`、`source`（实际派工文件及其摘要）和 `note`。同一 SHA-256 已通过时跳过。待返工的同一包也跳过，等新版 ZIP 或用户指定复验。更换包后按新摘要复验，保留旧判定。验收通过和正式入库分别记录。

确认工作成果对应的原文文件和卷章范围后，在项目内「拆书工作区/Novel Studio 拆书派工」的 `原文目录.md` 为对应文件加状态，并在原文旁写 `<原文件名>.派工状态.md`。已交成果可标「已拆·待验收」或「已拆·待返工」，全部派工范围通过后标「已拆·已验收」。记明用到的版本、卷章、对应结果和待办。原文及索引链接保留原路径。同一作品的其他原文版本仅提示已有哪一版做过。遇到同名且无法确认原文版本的交付，先登记疑点。


## 完整交付提示词加强（2026-11-11 用户最新要求）

已入库内容本轮暂不修改。生产端执行 [完整交付与内容自检](../拆书规范包/完整交付与内容自检.md)：逐项回读主张与同版证据，核对主语、时间、动机、条件和例外，防止信息拼接、过度概括及引用错位。全部派工范围连续完成后一次提交最终包，不交阶段稿；内部检查点可保留，真实阻碍如实登记。接收端仍只验格式、标签和导入安全，不因此自动扩大内容验收。

通用提示词、独立交接包、通用规范包、共享派工副本及15本未完成任务提示词已更新，已完成10本提示词不变。在跑3路不强制重启或替换正在读取的输入；队列以pendingBundleSha256登记新版，启动脚本在下次安全启动/接续前同步交接ZIP与工具文档。保留已接收卡ID、基线包及cardRevisions，不以本轮提示词更新覆写正式卡片。

`book-agent-prompt.mjs`按实际模型注入用户指定DeepSeek原句，其他模型及免费Hy3回退不注入。真实额度、用户叫停、目录权限与三并发规则继续有效。worker自动接续reading/writing/validating/partial等未完状态；最多20回合的异常保护仍保留，达到保护或真实阻碍时标needs_attention，不能把未完稿当成待验收最终稿。定时接续沿用原任务，不重派同书。已有阶段接收记录仅作历史，此后未完成稿不再阶段入库。

既有heartbeat novel-studio已更新上述要求，保留30分钟首检和原通知设置。本轮不启动新CodeBuddy请求、不持续监督。


## 2026-11-11 17:35 用户授权单独续派亡灵

只恢复《叹气的亡灵想隐退》，继续反重力Gemini 3.8 Flash Low，其他9本未派书和已完成的败北不动。用户仍要求派发后结束、等叫验收；novel-studio保持PAUSED，不自动验收或补派。队列仅该书由needs_attention改running，派发回执及额度新基线 `.local/antigravity-wanling-resume-20261111-1735`。原会话已结束，保留151卡施工JSON、旧状态、45卡正式基线和核读断点，备份后另起同书串行会话继续；没有子代理。

本次任务优先补齐台账尚未登记的21121段（集中8—13卷），分块核读并保存真实对象笔记，不以自动补满范围冒充完成。已完成范围不重做，既有入库卡保持原状；全部核读/卡片/标签/自检完成后一次交完整成果。旧测试包和交付ZIP不删除不覆盖，打包选不存在的唯一文件名，避免先前File exists和Remove-Item权限拦截；最终放施工输出/交付/result-完整版-时间戳.zip，回执注明最终文件并绑定实际ID/SHA。不修改正式资料。

**纠正此前大小判定**：实际app/main/protocol.mjs及随包pack-result.py限制为result.json≤32MiB、整包解压后总量≤512MiB；约67MB ZIP本身不违规。此前将ZIP超过32MiB作为亡灵问题的说法错误，历史记录保留但由本条更正；未接收整书的有效原因是未完成核读范围和未收尾交付。此次不无故删原插图/封面、也不因ZIP超过32MiB强制拆包，保持资源与正文身份。

实际操作：备份queue/旧status/工作JSON；内置 `agy --model gemini-3.8-flash-low --effort low --output-format json --print /usage`保存quota-before.json，Start-Process -WindowStyle Hidden启动本地Node ACP worker。session/set_model及thought_level回执已核实Gemini Flash low，state=running、sessionId和提示词摘要就绪。工作入口复用已核验worker，本次恢复提示词在job.json。稍后验收按新旧各轮额度基线分段核算，跨重置和共享使用不强行归因。

更新交接、维护及验收文档后重做源码ZIP和摘要；应用仍0.1.19，协议draft-0.1、安装器及规范包不变。确认启动后结束本轮，不持续监督。


## 2026-11-11 19:03验收与19:07权限修复后续派亡灵

用户主动叫验收后发现没有新正式交付：交付目录旧138卡包摘要未变，不重复验同SHA；本轮内部稿由151卡变144卡（移除7张未入库卡，旧151卡副本保留），对 `施工输出/工作/result-144-test.zip` 运行 `node --disable-warning=ExperimentalWarning .local/antigravity-review-20261111-1903/review.mjs`：144卡受限Markdown、分组标签、协议、同版正文/目录/资源全部通过，无警告。包ID a4d4fa89-9f72-530b-84dd-bca92348c62f，SHA-256 3e0604821a0e4dc5afea5cfae6959c29a50994e2e372f4640a320258239f586d。此为内部检查点，根进度仍partial、登记覆盖仍39094/60215段，未作为整书验收入库，未打开或改写正式数据库；沿用上次1153卡计数。没有内容语义深审。

根因是接收端旧ACP权限适配器直接替换反斜杠而未规范化Python转义路径：合法同书D:\\...变成D://...而被误判越界，拦住准备最终ZIP路径的安全python命令。是本机适配器误拦，不是用户叫停或模型仍在跑。用户随后明确授权“把权限方面的东西都搞好，然后让它继续”。

新增 `scripts/book-agent-permissions.mjs`：按Windows规则规范化正常/双反斜杠路径；核对常见读写目录字段；放行本书正常读取、打包、校验和仅工作目录内单个result测试ZIP清理（不允许通配/递归或输入删除）；其他书、父目录、正式库及凭证目录继续拒绝，不允许派生子代理。新worker使用该模块。`node --test tests/book-agent-permissions.test.mjs` 4项通过；回放历次亡灵161次真实permission请求，全部本书合法请求通过，包含两次已知误拦场景。数据在 `.local/antigravity-wanling-permissions-20261111-1907/permission-replay.json`，`node --check` 新worker通过。

已备份旧status/队列/144卡JSON，再启动同书单路Gemini 3.8 Flash Low；先核读21121段缺口、每500—1000段更新持久台账，补完后再集中写卡和打包，不重复花整轮巡检已有卡。保留正式45卡基线、不修改其内容/ID；151卡历史稿副本保留在本书工作目录。新额度基线、job、dispatch-receipt在 `.local/antigravity-wanling-permissions-20261111-1907`。模型与thought_level=low回执已核对、state=running，随后结束本轮，不持续监督；其他9本不动，定时仍PAUSED，等用户叫验收。

19:03前一轮额度观测：五小时剩余94.938809%→94.178838%，下降约0.759971个百分点；周剩余97.839659%→98.336810%，反而回升0.497150个百分点，同reset_time不能据此可靠计算本轮周消耗，不把负差说成退款或消耗。原始前后值及比较存于本轮审计目录quota-comparison.json；都是Gemini组共享账户读数，不伪称单任务精确账单。

更新HANDOFF、维护/派工及验收记录，重做源码ZIP与SHA-256并校验CRC，应用仍0.1.19；安装器及通用规范包摘要不变。此次仅修复本地派工权限适配，不改工作台应用、协议或正式资料。


## 2026-11-11 22:40 反重力两书并发派发

用户授权同时派下一批两书：《佐佐木与文鸟小哔》10卷、《弱角友崎同学》11卷，均Gemini 3.8 Flash Low。两书已核对原文SHA-256、work_id/卷数/各revision身份及ZIP CRC，同步pendingBundleSha256指定的最新交接ZIP（27b9d630a30aa39b20cdea76f6754f19bfd3e092df971652dc275861a961b3a4）并安全解压。原文/交接/提示词三件套齐备，任务强调分块真实核读、对象笔记/台账/进度，全部范围完成后一次交付，受限Markdown与九类适用分组标签、正确资源限制和实际最终包ID/SHA回执。不自行导入、不派生子代理、不触碰正式库/其他书/凭证，不主动手动压缩。

佐佐木在原工作区正常运行。弱角的原路径和短联接曾被CLI终端报找不到cwd，首次探索父目录被范围门拒绝，失败会话的用量/额度记录保留。仅核对并停止本任务worker及所属CLI后，创建实际短目录 `.local/antigravity-run/Tomozaki-work`，复制同书输入并校验两项摘要完全一致；队列workspace/input/prompt及本次job改指此处，work_id不变，原目录保留，不重复派同书。当前反重力会话已成功执行Get-Location返回实际短目录。`拆书工作区/本地知识库拆书/弱角友崎同学-当前工作区`是指向当前物理目录的扫描/浏览入口；原目录是保留副本，不能把它们当不同书。目录映射见weak-workspace-migration.json及weak-scan-entry.json。

实际模型和thought_level=low经ACP回执确认，两路state=running、worker/CLI均存活，sessionId/提示词SHA/日志见 `.local/antigravity-batch-20261111-2240/dispatch-receipt.json`、startup-check-final.json。首轮失败与目录重试都留档；无持续监督，确认后结束本轮，等用户叫验收。当前队列16部完成、2部运行、7部未派，正式1252卡未触碰。定时novel-studio仍PAUSED，queue.automationPaused=true，不自动派下一批。

新增 `scripts/capture-antigravity-usage.mjs`，带30秒超时并核对内置/usage的command与num_turns=0，实际派发前调用成功，基线存quota-before.json；各worker结束时自动再留存一次 `运行记录/antigravity-quota-at-end-<sessionId>.json`，记录capturedAt、bucket和reset_time，状态记录路径或失败原因。此动作不发模型请求、不验收/补派、不需要Codex轮询，用于避免验收时已跨额度重置。账目仍是Gemini组共享额度，不假称单书精确消耗；失败启动会话也计入批次实际尝试。

`node --test tests/book-agent-permissions.test.mjs`4项通过，worker及额度捕获脚本node --check通过。Start-Process使用WindowStyle Hidden，模型只两路；启动失败的所属进程停止后才替换。更新HANDOFF、维护/派工/验收记录后运行 `node scripts/package-source.mjs` 并重算源码SHA/CRC；应用0.1.19、协议draft-0.1、安装器及通用规范包不变。


## 2026-11-11 23:23 两书进度核查、权限误判修复与额度

用户叫验收/询问进度与额度。本批0/2部完成：佐佐木phase=writing，Agent登记10/10卷核读完成（接收方未深审），26卡草稿，尚无完整包；弱角phase=reading、0/11卷登记完成、无卡片交付。两个worker和所属任务均已停止，stopReason=end_turn，但未满足completed条件，不是还在后台跑。扫描无标准成品，故无可正式验收入库包；本轮未打开或写正式库，沿用1252卡计数，队列仍16已完成/2待继续/7未派。旧公女包不续审。

本轮阻断仍来自接收端权限适配误判：佐佐木打印 `c9 content:\n` 时匹配到字符串末尾t:\n，被误当盘符；弱角用urllib访问https公开资料时，匹配URL末字母s://，被误当盘符。已修正scripts/book-agent-permissions.mjs：盘符前要求路径token边界，避免普通单词尾字母被识别为驱动器；公开网页URL和日志标签放行，真实其他书/父目录/凭证路径、递归删除等仍拒绝。新增两个针对性回归，合计 `node --test tests/book-agent-permissions.test.mjs` 6项通过；回放本批两书当前会话的全部真实权限请求，包含实际被拒的两条命令已通过，见permission-replay.json。此次只离线修复，未擅自重启模型或派下一批。

读取自动保存的任务结束/usage（不需要此刻重查）：佐佐木结束23:11的Gemini账户五小时剩95.122969%、周剩98.110181%，相对派发前均100%读数分别下降4.877031、1.889819个百分点。两bucket重置标记相对基线均变化；这是共享账户的观测余额差，不能严格归因两书或伪称同窗口精确账单。末次快照在佐佐木运行记录/antigravity-quota-at-end-682cb975-157a-4a44-a764-5c5bfe4a1078.json，弱角结束读数和首次启动失败读数也留存。比较在 `.local/antigravity-review-20261111-2323/quota-comparison.json`；逐书会话token用量、26卡稿SHA、阶段与交付缺失判定在review.json，缓存token不冒充同价新输入。

实际命令：`node scripts/book-dispatch-status.mjs`、`pwsh -NoProfile -File scripts/scan-book-reviews.ps1`、两书日志/进度及结束额度读取、`node .local/antigravity-review-20261111-2323/replay.mjs`和6项权限测试。源码文档更新后运行 `node scripts/package-source.mjs` 并重算源码SHA/验证CRC；应用0.1.19和协议draft-0.1、安装器及规范包不变。当前自动化继续PAUSED，queue.automationPaused=true；等用户另行指示是否接续，不自动派工。


## 2026-11-11 23:30 恢复夜间三并发与批次截止关机

用户明确授权重新派佐佐木/弱角，再增加女神攻略异世界，Gemini 3.8 Flash low三并发；自动定时验收/接收后轮转，先90分钟，按进度调20/30/60/90/120分钟。北京时间2026-11-12 06:00后当前批全部验收保存完成就不再开下一批，最终备份后正常关机；不是06:00强制中断在跑任务。原暂停由此次授权接续，队列overnight含明确cutoffAt、shutdownAuthorized=true、shutdownReady=false及当前batchWorkIds。

已用 `pwsh -NoProfile -File scripts/start-antigravity-book-agents.ps1 -Count 3` 启动佐佐木10卷、弱角11卷、女神攻略异世界（以队列卷数为准）。新通用准备器核对原文/交接摘要，按work_id和现有断点准备任务，不重读有效成果；新书及佐佐木采用实际ASCII短工作目录、保留原目录，弱角沿用Tomozaki-work。书目录根下反重力-<order>-当前工作区联接用于扫描，不能当新书重复派。当前批ID e4e917f1-0156-4fca-bc2b-45dc6e7e40b2，三路均state=running，实际模型、low回执、会话ID与日志见 `.local/nightly-setup-20261111/dispatch-receipt.json`。

通用入口：scripts/antigravity-book-worker.mjs（权限6项回归已修复，未完成end_turn最多20回合有界接续、连续3回合无工具进展停止，不在额度限制下反复空耗；每会话结束自动采零模型turn的usage）、prepare-antigravity-dispatch.mjs、start-antigravity-book-agents.ps1。活跃批未全部正式接收不派其他新书；到06:00后只允许同批原任务继续，不开始新批，避免截止误开新书。

每次heartbeat有界检查，先扫描新SHA、仅格式/标签/协议/同版身份和安全导入简验，少量问题自修保留原包；不阶段入库、不深审内容。通用验收/接收入口为review-book-batch.mjs、import-reviewed-books.mjs、index-reviewed-books.mjs、publish-reviewed-books.py；索引包括封存卡而不改封存。正式应用在用时延后；截止后已交齐成品且仅待应用空闲时，正常保存退出再导入，不强退。逐批记录实际包ID/SHA、备份、摘要一致性、计数、索引与额度，更新文档和源码包。

已通过Automations工具把原novel-studio改为ACTIVE，间隔90分钟，保留当前聊天及failed_runs_only通知，完整替换旧暂停/CodeBuddy提示。新提示与docs/overnight-dispatch.md一致，禁止一直监督/高频轮询。每批完成若尚未截止且仍有队列才派下一批；早完成全部队列则保留一次06后保存复核与关机检查。

关机防护：overnight-dispatch-policy.mjs及finish-night-dispatch.ps1校验北京时间截止、截止后整批正式completed、无在跑任务、正式程序正常关闭、最新一致备份SHA及发布摘要；backup-night-library.mjs导出最终资料备份。准备齐全后写shutdownReady=true，停止/删除夜间自动化并记录，再 `pwsh -NoProfile -File scripts/finish-night-dispatch.ps1 -Shutdown`。本轮仅运行无参数检查模式，未发关机请求。Windows本机shutdown帮助已确认正数/t隐含/f，所以只用/s /t 0，不强制关未保存窗口。用户之后撤销或叫停优先。

验证：`node --test tests/book-agent-permissions.test.mjs tests/overnight-dispatch-policy.test.mjs`8项通过，覆盖真实误拦、目录边界、06:00新批次禁入和缺条件不关机；通用worker/准备/索引/验收脚本node --check、两个PowerShell Parser检查、发布脚本Python编译通过。额度基线 `.local/nightly-setup-20261111/quota-before.json`，实际自动化前状态同目录留档。程序/协议/正式1252卡未改，应用仍0.1.19；更新记录后重做源码ZIP、SHA/CRC，安装器与通用规范包不变。成功派发后结束本轮，按已设定时续作。


## 2026-11-11 夜间额度回退更新

用户补充：Gemini受限且很快刷新就等刷新后继续；刷新很久/额度不可用时转回CodeBuddy，优先hy4，再此前默认DeepSeek。接收方将短等待明确为30分钟内，按真正阻断bucket的最晚reset_time判断；使用retryNotBefore与动态heartbeat，不阻塞当前Codex会话、不高频重试。CodeBuddy本机help实际支持hy4free、hy4std、deepseek-v4.1-flash，按此前免费偏好优先hy4free low，其不可用再deepseek-v4.1-flash low；旧hy3自动回退不用于本轮。DeepSeek也无额度则保存断点等待真实刷新或下次定时复核，不擅自多开/换其他模型。

新增book-quota-policy.mjs、apply-book-quota-policy.mjs，按work_id记录quotaHistory/engine/model/等待时刻；统一启动器按engine选反重力或CodeBuddy worker，全局仍3槽且按整批/截止保护执行。确认旧会话结束再切换，从同书持久施工文件与ID断点继续；CodeBuddy仅同CLI才尝试load旧会话，不加载Gemini会话。准备器不再强制把已选的CodeBuddy改回Gemini，已知Gemini恢复时刻后新批可恢复Gemini；不打断当前健康模型。状态同步阻止本轮限额触发旧hy3分支。CodeBuddy使用修复的路径解析器、未完成有界接续和限额即停；只有实际DeepSeek调用才加用户原句。两提供方额度分开记录。

已通过Automations工具更新同一novel-studio提示，保留ACTIVE、90分钟及通知设置、当前聊天，新增额度回退操作；11月12日北京时间06:00后验收当前批、保存及正常关机的规则不变。q.overnight.quotaPolicy已落盘，当前三路健康Gemini未切换，本轮未启动额外模型或改正式资料。

验证：本机CodeBuddy --help只读核对模型ID；node --check相关worker/准备/回退脚本及PowerShell Parser通过。`node --test tests/book-agent-prompt.test.mjs tests/book-agent-permissions.test.mjs tests/book-quota-policy.test.mjs tests/overnight-dispatch-policy.test.mjs`14项通过，覆盖短刷新等待、长/未知刷新切hy4、hy4后DeepSeek、无hy3回退、权限与截止关机保护。更新文档、源码ZIP及SHA/CRC，安装器和规范包不变，应用仍0.1.19。


## 2026-11-12 01:15 夜间首批验收与轮转

- 佐佐木与文鸟小哔（中译版）：26卡／10卷，package_id `3917f11f-5ba1-4abe-89a9-e382aa7be454`，SHA-256 `48d913de1f5d9818356fc369c6398ef83e42e515223d336a113bb4d5d003079c`。
- 弱角友崎同学(弱势角色友崎君)（中译版）：36卡／11卷，package_id `948356cd-5ab1-5d26-a301-ea28f41aebb7`，SHA-256 `232f073a1eb405ecdc9fe59fd25af8007c08a4f4f94f331f19e647e4943fbcfe`。
- 和没有信徒的女神大人一起攻略异世界（中译版）：30卡／12卷，package_id `b9478a8b-53bd-5323-8d14-e9145d1d921f`，SHA-256 `11f6b5591b91af3412f5bc2477fa10253b3b815966e5ba04ae8013dc1811b6f6`。

三书已交完整包，Agent进度均completed；只按受限Markdown、九类适用分组标签、协议、同版正文/目录/资源和导入安全简验，未深审内容/阅读质量/证据或标签语义。佐佐木24卡把字面\n写入content，接收方仅改成真实换行，原包和原SHA留存，文字/标签词/证据不变；修订包重新校验无警告，旧原包以被修订接续记录，不重复验同SHA。原包dd196b2a24d29395ad1ffcde4c75eeddc053d0827a7013c87452cf525f2fdca1。

实际命令：`pwsh -NoProfile -File scripts/scan-book-reviews.ps1`、`node --disable-warning=ExperimentalWarning scripts/review-book-batch.mjs .local/night-cycle-20261112-0115`（修前24条缺标签为换行解析问题，修后全通过）、`node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/night-cycle-20261112-0115`（正式应用0进程，一致备份、隔离演练、正式导入和重复duplicate通过，新增92卡、更新0卡、正文版本新增0，原创/正文/资源/封存及非本批卡证据摘要不变，SQLite完整性/外键通过）。备份 `D:\Vibe Coding\Novel Studio\.local\night-cycle-20261112-0115\before-import.zip`，SHA-256 `a0e0640e43b2b80cb9bed07207eaf2b8151f8a31635078eb949deb75050dc054`。

`node --disable-warning=ExperimentalWarning scripts/index-reviewed-books.mjs .local/night-cycle-20261112-0115`实际首次运行通用全状态索引入口，1344张当前卡向量全部就绪、封存未变。`python -B -X utf8 scripts/publish-reviewed-books.py .local/night-cycle-20261112-0115`同步状态、基线、正式回执和派工原文标记；联接按work_id/同SHA去重，不将原目录当第二份书。已记overnight.lastBatchAcceptedAt及batchHistory，旧批e4e917f1-0156-4fca-bc2b-45dc6e7e40b2全正式completed。

任务结束自动额度快照已收集。相对夜间本批前基线，Gemini五小时剩95.122969%→82.741737%，观测下降12.381232个百分点；周剩98.110181%→95.069069%，下降3.041112个百分点，两窗口reset_time相同。依然是共享账户观测，不精确归因单书；逐会话原始usage和快照见quota-comparison.json。

当前仍早于北京时间06:00，已用统一启动器补派下一批：天才王子的赤字国家重生术（天才王子的赤字国家振兴术）（中译版）、乙女游戏世界对路人角色很不友好（文库中译版）、因为不是真正的伙伴而被逐出勇者队伍，流落到边境展开慢活人生（中译版）。不提前填空；先验完上一批才派新批。当前整书完成19/25部、3部在跑、3部未派，正式库27部278卷1344卡，资料内容本轮只新增。启动器新增每批自动保存quota-before.json（同批重试不重写；失败记录不阻断授权任务），避免只保存整个夜间的累计起点；结束快照仍由worker自动留存。

定时novel-studio保持ACTIVE，重置90分钟首检；06:00后当前批验收/保存完毕就不再开新批并正常关机，条件和防护未变，本轮不关机、不持续监督。操作详情docs/overnight-dispatch.md。更新HANDOFF及验收/维护记录，运行 `node scripts/package-source.mjs` 并重算源码SHA、校验CRC，安装器与规范包不变，应用0.1.19、协议draft-0.1。


## 2026-11-12 02:49 夜间同批部分接收与恢复

- 天才王子的赤字国家重生术（天才王子的赤字国家振兴术）（中译版）：123卡／12卷，package_id `38965d0a-03e1-535f-9132-de52a0d7ce23`，SHA-256 `7b2e9c6a445f12ad4f73b2bacfad40c485585ecad1ee8ceb6d6625b725ef2448`。
- 乙女游戏世界对路人角色很不友好（文库中译版）：52卡／13卷，package_id `67803bbc-fb32-472d-a75c-12f798986181`，SHA-256 `f1662f79b9e55f13c290a37a92b327982f3c9c198816e7fb76d5e4680fc8725f`。

两书completed且有完整交付，只验格式、分组标签、协议/同版正文和导入安全，不深审内容、阅读或证据语义。乙女原包自行重建了structures（原章节ID/标题/范围变化），但同版正文、资源、卡片证据身份原样一致；接收方仅把structures恢复为输入原目录，不改正文/卡片/证据，原包保留。修复和原SHA见receiver-fixes.json。原章节结构不是可随意覆写的正式资料。review-book-batch首遍因目录保护中止，原断言打印大量对象差异；已改用布尔深比较保留保护、只报简短错误，防止无必要输出原稿/段落。

实际运行扫描及 `node --disable-warning=ExperimentalWarning scripts/review-book-batch.mjs .local/night-cycle-20261112-0249`，修后两包全部格式标签通过、无警告；随后 `node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/night-cycle-20261112-0249`：正式程序0进程，一致备份、隔离演练、正式新增175卡、更新0卡、正文版本新增0，各包重导duplicate；原创、正文、目录、资源、封存及非本批卡证据摘要不变，SQLite完整性/外键通过。备份 `D:\Vibe Coding\Novel Studio\.local\night-cycle-20261112-0249\before-import.zip`，SHA-256 `96032f01d31f59cbc6b220c1cf3f39bed8aee8444a06fc2d76abe33cd82b1f86`。`node --disable-warning=ExperimentalWarning scripts/index-reviewed-books.mjs .local/night-cycle-20261112-0249`补齐含封存卡向量，1519卡全部就绪。`python -B -X utf8 scripts/publish-reviewed-books.py .local/night-cycle-20261112-0249`同步正式回执、状态、基线与原文旁标记，旧原包以被修订接续留档不重复导入。

同批《真正伙伴》仍根phase=reading，已有18卡候选v3包，未作为完整成品接收。前次想批量删旧交付ZIP被范围门正确拒绝；worker之后又从读入规范文字“额度耗尽”误认真实限额而停。真实Gemini快照两bucket仍有余额，不应回退CodeBuddy。已修正额度识别只读取提供方结构化错误/异常，不在原文/工具输出/提示词中正则判限额；同步修复反重力和CodeBuddy worker，新增真quota与普通规范文字反例测试。权限、额度、截止测试共12项通过，两个worker语法通过。

确认旧会话停止后，统一启动器只恢复当前批真正伙伴，保留18卡与旧ZIP，明确不清理交付历史、从真实未完成范围继续，实际完工再同步根进度/回执；未增加其他新书，未套用免费hy4回退。当前批a15df8ad-683d-4ce1-a5fa-6b4d81d55d37必须等该书正式completed后才能开新批，未写整批lastBatchAcceptedAt。本次恢复细节partner-recovery.json/partner-state-before.json留存。

本批首轮结束会话的共享Gemini观测：五小时82.741737%→69.091558%，下降13.650179个百分点；周95.069069%→91.245013%，下降3.824055个百分点，同reset_time。第三书已恢复，以上不是整批最终消耗；原始快照/逐会话用量见quota-comparison.json，不能精确归因单书。没有为假限额密集重试或错误切模型。

当前21/25部整书已完成、同批1书继续、3书未派，正式27部278卷1519卡。自动化仍ACTIVE，为当前已有候选包的收尾恢复调整到30分钟，下批恢复90分钟，06:00后的整批验收保存关机保护保持不变，本次不关机、不持续监督。更新HANDOFF/派工/维护/验收记录后重做源码ZIP、SHA/CRC，应用仍0.1.19、安装器与通用规范包不变。


## 2026-11-12 03:27 收尾检查与进度编码修复

有界检查：`node scripts/book-dispatch-status.mjs`，同批真正伙伴仍worker=running，实际worker/CLI存活，有新v5完整候选包正在打包/收尾，故不在写入期间验收或导入，也不派下一批。根进度已由Agent写completed（14卷），原状态脚本却读不到：PowerShell UTF-8 BOM使JSON.parse失败，导致旧worker误续作4回合。接收方只移除该进度文件BOM，字段和状态完全不改，前字节与摘要留在 `.local/night-check-20261112-0327/encoding-fix.json` 和progress-before.bin；给仍在运行旧worker提供可读进度，未重启或取消它。

新增parseBookProgress为两个provider worker、状态同步及批次review统一支持UTF-8 BOM，避免已完成任务反复续作。`node --test tests/book-agent-prompt.test.mjs`4项通过，包含实际BOM进度完成识别回归，两个worker及review语法通过。验证状态脚本已显示completed进度，但worker仍活跃，所以本轮仅保存编码修复，不把自报状态直接当成稳定交付入库。正式资料未读写，沿用1519卡计数；当前仍21完成/1书收尾/3未派。

自动化按实际收尾进度调20分钟后复核，保持ACTIVE及额度回退/06:00批次截止保存关机保护；新批派发后恢复90分钟。当前不持续监督，不关闭电脑。更新记录及源码包/摘要、CRC，应用仍0.1.19，安装器与规范包不变。


## 2026-11-12 03:50 当前批完成接收及最后三书派发

真正伙伴最后稳定v5完整包18卡／14卷通过受限Markdown、九类适用分组标签、协议及同版正文/目录/资源身份核对，无警告。package_id `f46067ee-3908-5712-b9ec-8c002741c3cc`，SHA-256 `a59f064a025a81266865023a5ca3e72365a279d5f7cbccc1d78ed417b6d4b2e7`，文件 `D:\Vibe Coding\Novel Studio\.local\antigravity-run\book-22\施工输出\交付\result-完整版-20261112v5.zip`。旧进度BOM使旧worker未识别完成并触发3回合无工具进展停止，但Agent根进度已completed；接收方核对进程均退出、文件稳定、版本与格式安全后接收，不仅凭worker标签下结论。补齐绑定v5实际ID/SHA的接收回执，没有修改任何卡片/正文/资源。旧v1—v4保留不当作新任务，不深审阅读质量/内容/证据语义。

命令：扫描、`node --disable-warning=ExperimentalWarning scripts/review-book-batch.mjs .local/night-cycle-20261112-0350`全通过；`node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/night-cycle-20261112-0350`在正式程序0进程时一致备份、隔离演练后正式新增18卡，更新0、正文版本新增0，重导duplicate，原创/正文/目录/资源/封存与非本批卡证据摘要一致，SQLite完整性/外键通过。备份 `D:\Vibe Coding\Novel Studio\.local\night-cycle-20261112-0350\before-import.zip`，SHA-256 `2cfc18ac69ecc7227a173e0b4e2d4ae3e2477cb047a923af9c411cee6409f5aa`。`node --disable-warning=ExperimentalWarning scripts/index-reviewed-books.mjs .local/night-cycle-20261112-0350`1537张卡向量全部就绪；`python -B -X utf8 scripts/publish-reviewed-books.py .local/night-cycle-20261112-0350`同步所有状态、回执、基线、原文标记。旧批a15df8ad-683d-4ce1-a5fa-6b4d81d55d37三书全部正式完成（累计193卡，其中175卡在02:49接收），已记录batchHistory和lastBatchAcceptedAt。

整批Gemini共享额度：周95.069069%→90.174919%，同reset_time观测下降4.894149个百分点；五小时82.741737%→99.762309%已跨重置，不推算负消耗或退款。包含原任务和恢复会话，非单书精确账单，原始结果见quota-comparison.json。

当前时间仍早于06:00，经统一启动器截止保护后已派最后三书：Only Sense Online 绝对神境（中译版） 16卷、怕痛的我，把防御力点满就对了（中译版） 18卷、Infinite Dendrogram 无尽连锁（中译版） 22卷，均Gemini 3.8 Flash low、三并发。本次没有新建第4路，其他已完书不动。当前22/25书完成、最后3书在跑，无未派书；正式27部278卷1537卡。每批基线自动保存当前批audit/quota-before.json，结束快照按会话自动记录。定时恢复90分钟，后续按实际进度调整；06:00后当前批验收保存完成就不再派工，最终备份后正常关机，保护条件不变，本次不关机、不持续监督。

更新HANDOFF、维护/派工/验收记录后重做源码ZIP、SHA/CRC，安装器及规范包不变，应用0.1.19、协议draft-0.1。审计 `.local/night-cycle-20261112-0350`，正式资料仅新增18卡，未覆盖既有内容。


## 2026-11-12 05:25 最后三书接收完成，待六点后保存关机

最后三书Only Sense Online（16卷24卡）、怕痛防御力（18卷37卡）、无尽连锁（22卷18卡）实际会话均停止，根进度completed，完整交付已接收。仅核对受限Markdown、分组标签、协议、同版原文/目录/资源和安全导入，不深审内容、全文覆盖或证据语义。怕痛37张卡各有一个一级标题，接收方仅降为二级标题，原包保留于审计bofuri-original.zip及原交付目录，修订ID/SHA、逐卡修改在receiver-fixes.json；原包标superseded，避免重复验收导入。

- Only Sense Online 绝对神境（中译版）：24卡，package_id `3588bc67-34a9-5a7b-ad2b-fe5f47f53ffb`，SHA-256 `ae95cad9b48e658a55b76c03c7147abd9053678e8cc00919504a7ccbb3a5e7a5`。
- 怕痛的我，把防御力点满就对了（中译版）：37卡，package_id `370c2307-2533-46bb-821a-cc28b97de041`，SHA-256 `da568b0b9fceee11fed1ee2a661ef7db40920b52e8a160d2c11c30366d2696fd`。
- Infinite Dendrogram 无尽连锁（中译版）：18卡，package_id `d9696829-1730-5246-b4ff-95a95366266e`，SHA-256 `2a4fb73da440462a3e3e97491347da60785b395ec6b2123224fd6dbe1210ea39`。

实际命令：`pwsh -NoProfile -File scripts/scan-book-reviews.ps1`；`node --disable-warning=ExperimentalWarning scripts/review-book-batch.mjs .local/night-cycle-20261112-0525`（修订后全部零错误零警告）；`node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/night-cycle-20261112-0525`（正式程序0进程，一致备份、隔离演练、重导duplicate、正式新增79卡，更新0，正文版本新增0）；`node --disable-warning=ExperimentalWarning scripts/index-reviewed-books.mjs .local/night-cycle-20261112-0525`（1616/1616当前向量）；`python -B -X utf8 scripts/publish-reviewed-books.py .local/night-cycle-20261112-0525`同步接收/正式回执、基线、原文标记和队列。原创、原文、目录、资源、封存及非本批内容摘要未变，完整性和外键检查通过。

导入前备份 `D:\Vibe Coding\Novel Studio\.local\night-cycle-20261112-0525\before-import.zip`，SHA-256 `daa21f857094356588445ddca305fe876cf58461cba93431ce0a62f67c690feb`。审计 `.local/night-cycle-20261112-0525`。

最后整批Gemini共享额度同reset_time：五小时99.762309%→87.974089%，下降11.788219个百分点；周90.174919%→86.664188%，下降3.510731个百分点。快照及逐会话用量见quota-comparison.json，非单书精确账单，本批无需额度回退。

当前25/25部整书正式完成、无在跑或未派书；正式27部（15在用12封存）278卷1,110,178正文块1616卡，向量齐备。未再派任务。完成时尚未06:00，不提前关机；通过Automations工具将既有novel-studio改为35分钟后进行最终保存复核（约06:06），只为截止后最终一致备份、发布摘要复核、停止自动化和正常关机保留一次检查。shutdownReady仍false，尚未执行关机。06后按docs/overnight-dispatch.md操作，无强退。用户之后撤销/叫停优先。

文档完成后执行`node scripts/package-source.mjs`更新源码ZIP并重算发布SHA，核对ZIP CRC及文档内容；安装器、通用规范包保持原摘要，应用0.1.19、协议draft-0.1未变。


## 2026-11-12 06:10 最终保存及正常关机准备

截止后`node scripts/book-dispatch-status.mjs`确认25/25部completed、active为空；提升权限实际进程检查无正式程序或拆书worker。25份正式接收包SHA一致，正式1616张卡/当前向量1616、278卷、1,110,178正文块及封存状态复核通过，quick_check=ok、foreign_key_check零行。没有派新任务或重复导入。审计`.local/night-final-20261112-0606`。

`node --disable-warning=ExperimentalWarning scripts/backup-night-library.mjs .local/night-final-20261112-0606`已导出最终一致备份`D:\Vibe Coding\Novel Studio\.local\night-final-20261112-0606\final-library.zip`。ZIP SHA-256 `f096ef93aa8d202afbef5e1b76716949b6e36954995c9ffcfa31718f8798c935`；其中数据库SHA-256 `cc9f0beac1a323f4e78907d8939b3f0bbc4320d5da90712ae325c8b7b91506bb`。ZIP CRC及manifest/database摘要验证通过。修正了该维护脚本回执原先将BackupService返回的数据库摘要误作ZIP摘要的问题：现在分存databaseSha256和sha256；备份内容未改，真实ZIP摘要用于关机保护。

Automations工具已成功删除novel-studio，deleteStatus=deleted，不再自动派工。队列绑定真实最终备份、截止后复核时间、shutdownReady=true。保存文档后执行`node scripts/package-source.mjs`、重算发布清单，核对源码CRC/文档字节、安装器和规范包SHA不变。随后`pwsh -NoProfile -File scripts/finish-night-dispatch.ps1`检查，再以`-Shutdown`执行已授权`shutdown /s /t 0`，不强退。实际请求以`.local/overnight-dispatch/shutdown-receipt.json`为准，本文不声称已观察到断电。下次开机等待用户新指令。


## 2026-11-12 用户授权全部解封

用户明确要求拆书完成后全部解封。封存仅通过reference_works.deleted隐藏书架及检索，正文/知识卡保留。正式应用已退出，先`node --disable-warning=ExperimentalWarning scripts/backup-night-library.mjs .local/unarchive-20261112`做一致备份，ZIP SHA-256 `b7dd943efcbaecf645f35a174dabf89831675a8375651339466d0389061fc35f`，库内数据库摘要`cc9f0beac1a323f4e78907d8939b3f0bbc4320d5da90712ae325c8b7b91506bb`。从备份抽取隔离数据库，执行`.local/unarchive-20261112/unarchive.mjs`调用生产ReferenceService.setHidden逐书恢复，在事务内核对仅12部deleted变为null，保护表行数及原创/卡片/证据摘要相同，quick_check和外键通过，再对正式库执行同样流程通过。

结果27部全部在用、0部封存；278卷、1616卡、现有索引/正文/原创/证据未改。解除deleted过滤后全部书目可进入日常书架和参考检索，无需重导或重新拆书。旧封存时间及回退依据保存在unarchive-report.json.restored；如需回退，只按本次12部workId恢复previousDeleted，避免覆盖后续用户资料。完整隔离及正式回执在`.local/unarchive-20261112`。本轮未启动自动派工或关机。


## 2026-11-12 当前方向评估与接手

当前参考库27部全部在用、1616卡及向量齐备，拆书轮转结束。已诊断但未修复的检索链路问题和“7个并非全库覆盖统计”见HANDOFF；用户正在讨论知识生产/查询与工作台解耦，未确定方案或授权实施。以[方向评估](知识库方向评估.md)区分事实/建议/未定事项，勿自动依据历史派工说明执行。主管转交用[接管提示词](开发与运维接管提示词.md)。

## 2026-11-12 本机清理后的资料位置

用户已授权并完成.local大幅清理。当前只保留model、night-final-20261112-0606、nsis-official；下载原文另存项目根目录“原文保留/20261112-local清理”，派工原档保留。旧测试、检查点、临时验收和派工运行路径可能已删除；历史命令不得假设输入仍存在。清理清单见cleanup-20261112，当前说明见HANDOFF末尾。

## 2026-11-13 正式KB v2维护入口

生产为main/0.2.0，参考使用正式资料reference-v2.sqlite，原创继续library.sqlite。迁移与回退证据见HANDOFF顶部。新增app/kb-v2下存储、检索、agy桥接；打包通过esbuild将这些模块捆入resources/app/app/main/index.mjs，并非必须按源目录逐文件复制。旧ZIP导入在v2隐藏且IPC拒绝；新书使用专用建库流程。BackupService支持双库备份恢复及失败回退，旧格式仅恢复旧共库。显卡配置指向正式runtime/llama-cpp-vulkan，CPU与权重仍复用原.local/model。检索API配置优先；未配置可回退本机agy，缺失或失败会降级本地。所有后续验收先使用隔离NOVEL_STUDIO_DATA_DIR，不因已授权本轮升级而自动覆盖正式库。

## 0.2.1 反重力模型来源

AI辅助检索设置新增模型来源：auto（优先既有API，无配置时使用反重力）、api（仅API）、agy（直接反重力账号）。选择保存在资料目录retrieval-provider.json，和现有retrieval-api.json/expansion.json凭证分离，不要求迁移旧配置。未保存新文件时保持旧版自动回退行为。app/kb-v2/agy-provider.mjs通过agy models动态枚举Gemini及Orchestrator变体，按家族和模型ID中的思考强度展示；不将未公布模型作为可选项。刷新只查模型目录，测试连接只发送固定JSON测试句，不访问小说库。

请求经现有AgyFlashClient的ACP连接，复用本机CLI登录；本机需先完成Google账号登录。调用子进程移除继承的Gemini/Google API Key、ADC等环境变量，不读取/导出CLI凭证、不改CLI持久设置。CLI当前登录状态与账号权限仍由反重力维护；不提供Key转订阅或HTTP反代服务。模型ID和思考强度透传，未带强度的模型使用自身默认。CLI错误/额度不足按原检索策略显示原因并回退本地，API模式不会自动改用账号额度。切换来源/模型或库变更会作废旧检索结果。

主进程IPC为retrieval.provider.get/save/listModels/test，模型目录与测试支持取消；UI为RetrievalPreferences.jsx。仅影响参考AI检索，原创扩写配置和行为不变。正式升级脚本指纹新增v2数据库和来源配置，不重拆或重建索引。
