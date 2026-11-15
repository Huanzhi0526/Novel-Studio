# Novel Studio 验收记录

## 2026-11-11 首次检查间隔改为30分钟

- 读取当前队列、各书运行状态startedAt／finishedAt及stdout回执时刻；仅统计本轮10个已整书完成任务，不把completedAt验收入库时刻当作CLI施工结束。最后有效交付回合均值14.02分钟，中位14.67，范围7.49—19.27；含重试累计均值14.31分钟；提交后至验收入库均值109.96分钟（含接收处理）。数据 `.local/dispatch-timing-20261111/timing.json`。
- 读取既有automation.toml后通过automation_update更新 novel-studio 为30分钟，保留当前聊天、ACTIVE及failed_runs_only通知设置。提示明确新派发或阶段接续首检30分钟，后续按进度20／30／60／120分钟，补派后恢复30；不持续监督。
- start-book-agents.ps1 新增firstCheckAt及队列首检30分钟记录；prepare-book-dispatch.mjs默认同步30。未启动新会话、未改变正在施工的工作区、应用和正式资料。同步HANDOFF、运维说明、队列及README。源码包重做并校验CRC及关键文档，安装器不变，应用0.1.19。


## dispatch-cycle-20261111-1220 定时简验与接续

本轮只验受限Markdown、分组检索标签、协议与同版导入安全，不复核内容、全文质量或标签语义。

- 骑士＆魔法（中译版）：46卡／11卷，package_id `e8bf4332-f137-5c83-815b-906da2bd29d8`，SHA-256 `06dccb569d4d52449790a606601d81ffd33515ce05367ff22ce9a224318312ef`。 Agent自报阶段稿，仅阶段验收和入库，不计整书完工。
- 非自愿的不死冒险者（中译版）：59卡／13卷，package_id `eaacbfa3-9df1-543a-b878-d15755963757`，SHA-256 `9a7a9cc14e0f316dc47e24bf603d70efffeaf10631de762abc983f2112eb3b30`。
- 叹气的亡灵想隐退（中译版）：45卡／13卷，package_id `597768d8-2b25-552d-bc0f-c652542afd25`，SHA-256 `f6d97fe317a63bc86b872e20e69dbd9215c80fa70ef6937a8dcf8d9e6e784a71`。 Agent自报阶段稿，仅阶段验收和入库，不计整书完工。

- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1220/review.mjs`：全部卡片格式与标签通过、协议无警告，同版正文及结构资源一致；无内容深审。修复情况见上述逐包记录，原包和旧回执保留。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1220/import.mjs`：确认正式程序未运行，先一致备份和隔离演练，再正式导入。备份 `D:\Vibe Coding\Novel Studio\.local\dispatch-cycle-20261111-1220\before-import.zip`，SHA-256 `82db8ea32126b5de3831f5411f9893494d89aacbe1c07255a30a13e6f10ffda5`。各包重导duplicate，正文版本新增0，SQLite完整性与外键通过；原创、正文、结构、资源、封存状态与非本批现卡证据摘要不变。详见 `import-report.json`。
- `python -B -X utf8 .local/dispatch-cycle-20261111-1220/publish.py` 同步书目录验收状态、实际原文摘要及旁标记、共享原文目录、正式导入回执与队列；修改前副本在 `publish-before`。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1220/index.mjs`：新增本批向量，当前全部910卡向量就绪，见 `index-report.json`。并用 `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 补派空槽；本队列已完成10部58卷；剩余15部190卷，当前已补派的三路为骑士＆魔法（中译版）、叹气的亡灵想隐退（中译版）、转生成蜘蛛又怎样！（中译版）。
- 派工工具使用ACP流式UTF-8解码，防止中文路径被分块损坏；读写路径限定本书工作区。`node --check scripts/book-agent-worker.mjs` 通过。工作台代码、依赖和协议不变，应用仍0.1.19。
- `python -B -X utf8 scripts/finish-book-cycle.py .local/dispatch-cycle-20261111-1220 --next-check 2026-11-11T06:19:51.356Z` 更新交接记录、重做源码ZIP并核对CRC、文档内容和SHA-256；安装器摘要不变。常态两小时heartbeat继续，本轮结束后不持续监督。


## dispatch-cycle-20261111-1018 定时简验与接续

本轮只验受限Markdown、分组检索标签、协议与同版导入安全，不复核内容、全文质量或标签语义。

- Unnamed Memory 无名记忆 后日谈（中译版）：42卡／2卷，package_id `6e0bc1ed-1308-5b2a-878a-aeb851488d3d`，SHA-256 `737bfabab1777730bb98aea2467705be5a737db22834d74698343e9de96b0f1f`。
- 转生公主与天才千金的魔法革命（中译版）：76卡／9卷，package_id `59931c9a-51c8-5def-9b93-c0f5a8d4b9a5`，SHA-256 `66eb5a99e854699b568321955a90ec374532de8b87f704512951cec8518e5542`。
- Silent Witch 沉默魔女的秘密(沉默的魔女)（中译版）：64卡／10卷，package_id `e4c18763-b44e-53d9-a8d3-690ace48a2a3`，SHA-256 `afa6b6a621bb98b46a8368630da9f0cce13c1d34b063cf2683ad0dfe7ad19235`。

- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1018/review.mjs`：全部卡片格式与标签通过、协议无警告，同版正文及结构资源一致；无内容深审。修复情况见上述逐包记录，原包和旧回执保留。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1018/import.mjs`：确认正式程序未运行，先一致备份和隔离演练，再正式导入。备份 `D:\Vibe Coding\Novel Studio\.local\dispatch-cycle-20261111-1018\before-import.zip`，SHA-256 `8bdf8649fb22551acf54c46fc3846ecef49710db550946c265677c35c09cc39d`。各包重导duplicate，正文版本新增0，SQLite完整性与外键通过；原创、正文、结构、资源、封存状态与非本批现卡证据摘要不变。详见 `import-report.json`。
- `python -B -X utf8 .local/dispatch-cycle-20261111-1018/publish.py` 同步书目录验收状态、实际原文摘要及旁标记、共享原文目录、正式导入回执与队列；修改前副本在 `publish-before`。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1018/index.mjs`：新增本批向量，当前全部760卡向量就绪，见 `index-report.json`。并用 `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 补派空槽；本队列已完成9部45卷；剩余16部203卷，当前已补派的三路为骑士＆魔法（中译版）、非自愿的不死冒险者（中译版）、叹气的亡灵想隐退（中译版）。
- 派工工具使用ACP流式UTF-8解码，防止中文路径被分块损坏；读写路径限定本书工作区。`node --check scripts/book-agent-worker.mjs` 通过。工作台代码、依赖和协议不变，应用仍0.1.19。
- `python -B -X utf8 scripts/finish-book-cycle.py .local/dispatch-cycle-20261111-1018 --next-check 2026-11-11T04:17:53.167Z` 更新交接记录、重做源码ZIP并核对CRC、文档内容和SHA-256；安装器摘要不变。常态两小时heartbeat继续，本轮结束后不持续监督。


## dispatch-cycle-20261111-0815 定时简验与接续

本轮只验受限Markdown、分组检索标签、协议与同版导入安全，不复核内容、全文质量或标签语义。

- 里亚德录大地（中译版）：94卡／6卷，package_id `536b0487-f6f0-54a6-afeb-780d60e1baa5`，SHA-256 `bbb73b514e915cf0dde767a1b82f36da209d8acf339acee32898f852519057b8`。
- 异世界漫步（中译版）：96卡／6卷，package_id `20be32b8-9461-5410-ad33-8ad4ee4e186f`，SHA-256 `edb3b311c8b4eaa0c7c7cd4765adb89056dd3b6132d1d49e5947b23b02e32a18`。
- Unnamed Memory 无名记忆（中译版）：72卡／6卷，package_id `da7d34c6-08dc-5795-8dbf-882a3fa176ae`，SHA-256 `2de3ab9d433ed4f64566c531e8402f8f9c4b4fcfbd60f24af114436c8733ecd9`。
- 接收方交付修复（Unnamed Memory 无名记忆（中译版））：Agent拟将v4定稿，但相对路径命令被拒；接收方保留旧包并完成原样定稿，未改v4内容。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0815/review.mjs`：全部卡片格式与标签通过、协议无警告，同版正文及结构资源一致；无内容深审。修复情况见上述逐包记录，原包和旧回执保留。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0815/import.mjs`：确认正式程序未运行，先一致备份和隔离演练，再正式导入。备份 `D:\Vibe Coding\Novel Studio\.local\dispatch-cycle-20261111-0815\before-import.zip`，SHA-256 `34823d4b36a87983f334a5f17212dfc8def008df5995e235e29446f129569408`。各包重导duplicate，正文版本新增0，SQLite完整性与外键通过；原创、正文、结构、资源、封存状态与非本批现卡证据摘要不变。详见 `import-report.json`。
- `python -B -X utf8 .local/dispatch-cycle-20261111-0815/publish.py` 同步书目录验收状态、实际原文摘要及旁标记、共享原文目录、正式导入回执与队列；修改前副本在 `publish-before`。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0815/index.mjs`：新增本批向量，当前全部578卡向量就绪，见 `index-report.json`。并用 `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 补派空槽；本队列已完成6部24卷；剩余19部224卷，当前已补派的三路为Unnamed Memory 无名记忆 后日谈（中译版）、转生公主与天才千金的魔法革命（中译版）、Silent Witch 沉默魔女的秘密(沉默的魔女)（中译版）。
- 派工工具使用ACP流式UTF-8解码，防止中文路径被分块损坏；读写路径限定本书工作区。`node --check scripts/book-agent-worker.mjs` 通过。工作台代码、依赖和协议不变，应用仍0.1.19。
- `python -B -X utf8 scripts/finish-book-cycle.py .local/dispatch-cycle-20261111-0815 --next-check 2026-11-11T02:15:17.586Z` 更新交接记录、重做源码ZIP并核对CRC、文档内容和SHA-256；安装器摘要不变。常态两小时heartbeat继续，本轮结束后不持续监督。


## 2026-11-11 06:14 首轮定时简验与接续

- 本轮只做用户指定的格式、分组标签、协议及同版导入安全检查，不复核内容、标签语义或全文质量。先运行 `node scripts/book-dispatch-status.mjs` 和 `pwsh -File scripts/scan-book-reviews.ps1`；旧公女全量补核包继续保留、跳过，不重新验收。
- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0614/review.mjs`：魔女与佣兵43卡／1卷、玩乐关系29卡／2卷、谁杀了勇者50卡／3卷全部通过。122张均有可识别的Markdown分组标签，九类齐全，未使用不支持格式，协议无警告；包内正文、卷和版本、目录及资源与本次派工输入完全一致。无需格式返工。
- 三包SHA-256依次为 `86364d99f3a971e28b967ed497561c32b5bd310756874a7f71a5c9e9d5943781`、`bdd4a3376d9c9c5b3647f2046904b5a67ad86db02e9f619f47d82781586a19da`、`753af2c2dc9d36e622aac5b3d40f48cf0300aed86dbc4f9ac4d58c2edf41c538`。详情含包ID与派工输入摘要见 `format-review.json`。谁杀了勇者CLI在已有最终ZIP后因一条含错误路径的cd命令被拒而停止；接收方直接校验最终ZIP通过，未重跑或扩大权限。
- 确认正式程序未运行，执行 `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0614/import.mjs`，应用一致备份 `before-import.zip` 的SHA-256为 `32e6a7d43bff0793a82f7e9ca090878d9b6d54c06b6728dbdc7133e03c475da9`。隔离与正式导入各新增122卡，新增正文版本0，重导均duplicate，SQLite完整性与外键通过。全部原创、正文、卷册与版本、结构、资源、封存标记以及本批之外既有194卡与证据的摘要不变。正式库27部278卷、316卡。回执 `import-report.json`。
- `python -B -X utf8 .local/dispatch-cycle-20261111-0614/publish.py` 同步3书验收与正式导入回执、施工输入及共享同版原文旁状态、原文目录与队列；修改前副本在 `publish-before`。
- 无名记忆初次启动时在工具子目录用 `../输入` 解压，触发路径保护；接收方已在本书及后续待派书目录预解压可信交接工具，并提示始终从书目根目录用相对路径访问，再只恢复该书原会话。未放宽跨书或正式库权限，三并发上限不变。
- `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 补派里亚德录大地、异世界漫步、无名记忆主篇各6卷，DeepSeek-V4.1-Flash low，不派子代理、不主动压缩。首轮3部6卷已完成，剩余22部242卷（3在跑、19待派）。常态两小时heartbeat保留；本轮有界处理结束后不继续监督或轮询新任务。


- `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-0614/index.mjs` 新建122条本地Qwen3向量，现库316张卡当前修订向量全部就绪。报告 `index-report.json`。扫描回读首批三包均已验收、待打开false；文档更新后重做0.1.19源码包、校验CRC及文档内容并刷新SHA-256，安装器未变。

## 2026-11-11 CodeBuddy 三并发派工与目录整理

- 按用户授权迁移桌面派工素材、两书交付和两个辅助目录到项目内 `拆书工作区`。`scripts/organize-book-workspace.ps1` 记录路径与SHA-256；素材148文件、交接解压19文件、旧核验脚本报告10文件校验通过。本地知识库拆书内容已迁入，原空目录被其他程序占用，未强制结束进程。记录 `.local/dispatch-20261111/directory-migration.json`。
- 读取并核对独立交接包README、提示词、流程与九类制卡标准，发布ZIP、迁入副本及25个新书输入副本摘要一致，ZIP CRC通过。通用制卡标准不变。接收标准按用户最新指令仅检查格式、标签及导入安全；小问题自行修复，不做内容深审。
- `node --disable-warning=ExperimentalWarning scripts/prepare-book-dispatch.mjs` 只读导出现库25部248卷的同版正文并逐书打包，保留作品、卷、正文版本和段号，原文输入不含旧卡。跳过刚完成两书，先在用后封存，不解除封存。
- 本机CodeBuddy CLI 2.181.0。hy4free试运行被429限流，用户随后授权DeepSeek low、Hy3、GLM-5.3-Flash与均衡自动，额度耗尽改免费hy3。用ACP初始化并核验DeepSeek-V4.1-Flash low；实际CLI未暴露context_window预设选项，记录模型默认，不伪报1M已设置，不主动压缩。修正双向JSON-RPC请求编号碰撞后已从此前会话恢复，保留材料。
- `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3` 首批启动魔女与佣兵、玩乐关系、谁杀了勇者；单次状态确认3个会话running，22本queued，出现实际工具活动与施工进度。`node --check scripts/book-agent-worker.mjs` 和状态脚本通过。`scan-book-reviews.ps1` 默认改为新目录，两书标准升级包回读仍为已验收、待打开false。
- 创建当前聊天heartbeat「Novel Studio 拆书轮转」，automationId `novel-studio`，ACTIVE，两小时一次；提示规定临近完工调整20—30分钟，每次有界处理、验收后补派、完成或叫停后暂停。用户明确要求派发成功后结束持续监督以节省额度。规则已写入队列、HANDOFF、AGENTS和 `docs/book-dispatch.md`；更新源码包与SHA-256，应用仍0.1.19。


## 2026-11-11 两书标准升级简验与正式导入

用户明确只要求验收格式和是否有标签，随后正式入库；本次不复审内容真实性、原文覆盖、证据语义、标签准确性和检索质量。应用维持 0.1.19，代码、协议及依赖未改，不重跑应用全套测试。

- 先运行 `pwsh -File scripts/scan-book-reviews.ps1`，再用 `& ./scripts/scan-book-reviews.ps1 | ConvertTo-Json -Depth 7` 读取对象。只接收两份最新 `result-标准升级.zip`；历史包保留原判定。
- `node --disable-warning=ExperimentalWarning .local/standard-import-20261111/review.mjs`：应用包校验无警告。Markdown AST 逐卡核对，194/194 有二／三级标题和可识别的 `检索标签` 分组无序列表，标题保持纯文本，无 HTML、图片、代码或链接等不支持格式。两书九类齐全。报告 `format-review.json`。另执行 `node --disable-warning=ExperimentalWarning .local/standard-import-20261111/display.mjs`，在显式隔离 `NOVEL_STUDIO_DATA_DIR` 的正式 0.1.19 安装版打开两书各一张实际卡，DOM 确认标题与分组标签被渲染（分别 4／5 个标题、各 6 组标签），报告 `display-report.json`；未做逐卡目视或内容复审。
- 《公女》137 张、22 卷，package_id `c16e81bc-fba9-5420-8971-941f3ec932b0`，ZIP SHA-256 `dc4b2b3f28fc570ef2528dce75d82ba7cf4e15aedd1c8fa696172c2633340a57`；《暗杀者》57 张、8 卷，package_id `c4ce926d-a64f-596b-a191-79256f35b9dc`，SHA-256 `f2d1d2eab8d3c6c5552a18addd73b8eef6980b9f52e2f7ac6355b8a589baf83c`。
- 确认正式程序无运行进程后，执行 `node --disable-warning=ExperimentalWarning .local/standard-import-20261111/import.mjs`。按真实绝对路径访问正式资料，核对现卡与此前入库包一致、无额外手改；逐卷核对同版正文。用应用 BackupService 导出一致备份 `.local/standard-import-20261111/before-import.zip`，SHA-256 `db78c936aecc5d33d7fac51b4f126059c0821e35c2785d0227756cdb0c37ae06`。先在备份解出的隔离库导入，再执行正式导入，两次结果一致。
- 《公女》新增 92、更新 45；《暗杀者》新增 1、更新 56。两书均新增 0 个正文版本，重导均为 `duplicate`，卡片存储源文与包一致。现库 27 部、278 卷、194 张卡；15 部在用、12 部封存不变。全部原创表、正文、卷册身份、正文版本、目录结构、资源的逐行摘要不变；SQLite quick_check 和外键检查通过。详见 `.local/standard-import-20261111/import-report.json`。
- `python -B -X utf8 .local/standard-import-20261111/mark.py`：同步提交目录的验收状态与正式导入回执，补齐实际派工原文路径／摘要，更新原文旁标记和 `原文目录.md`，保留历史判定；状态文件修改前副本存于同目录 `status-before`。公女旧全量补核包未单独验收，本次标准升级已接续它；扫描仍可能列出该旧包，不据此自动开工。

- `node --disable-warning=ExperimentalWarning .local/standard-import-20261111/index.mjs`：沿用正式 Qwen3 模型更新语义索引，194 张卡的当前修订向量全部就绪，报告 `index-report.json`。扫描回读两份标准升级包均为已验收、待打开 false。更新 HANDOFF、维护地图、知识库档案和接管提示词后运行 `npm run package:source` 重做 0.1.19 源码包，核对 ZIP CRC、文档内容和 SHA-256；安装器不变。


## 2026-11-11 换对话文档核对

- 只读核对工作区仍无 Git，`package.json`、依赖锁和正式安装包内应用版本均为 0.1.19；桌面「小说工作台」仍指向 `%LOCALAPPDATA%\Programs\Novel Studio\Novel Studio.exe`。`DatabaseSync` 使用 `readOnly: true` 查询确认 27 部（15 部在用、12 部封存）、278 卷及正文版本、1,110,178 个正文块和 101 张卡；两书分别为 45 与 56 张。
- 同步 HANDOFF、维护地图、知识库档案、最近验收索引和接管提示词，修正 0.1.15、现库清空、14 部在用及当前原文 256 卷等过期表述。AGENTS、CONTEXT 和现行制卡标准保持原有边界；`docs/spec` 四份早期施工资料新增历史标识，正文保留。发布清单补列 AI 检索配置摘要。
- 在本机 PowerShell 运行 `& './scripts/scan-book-reviews.ps1' | ConvertTo-Json -Depth 6`，只读保存队列：公女全量补核包为待复验，旧阶段包仍保留原判定，暗杀者此前返工版已验收。未打开交付包内容、未更新其验收标记、未正式导入。用户说明的补核完成和接收方待复验分别登记，未把旧稿约 5.9 万段待核当作新包事实。
- Python 检查 13 份入口及历史标识文档的本机相对链接，全部存在；桌面原文副本仍为 99 份 EPUB、16 份 TXT 和 26 份同版 ZIP。发布 SHA-256、交接 ZIP 的 CRC／内容、嵌入规范与桌面副本一致，拆书交接包和提示词本轮不改。
- 本轮仅更新文档，未改应用代码、安装程序或正式资料，沿用 0.1.19 已记录的功能测试结果。执行 `npm run package:source` 重做 0.1.19 源码包，并核对 CRC、版本及逐文件内容，刷新 `release/NovelStudio-0.1.19-SHA256.txt`。修改前副本、扫描队列和核对回执保存在 `.local/handover-audit-20261111-023210`。

## 0.1.19 知识卡 Markdown 与配色

2026-11-11，Windows x64。卡片详情、参考书架、导入审核和检索结果共用 `CardContent.jsx`，新增锁定的 `react-markdown@10.1.0`。支持二／三级标题、段落、粗体、列表和短引用，证据编号保留。九类标记和粗体强调使用固定类别色，标准检索标签按分组着色，未知分组及旧式标签使用中性色；普通正文不自动推断标签。编辑、存储、索引及 `draft-0.1` 继续使用原始字符串。检索摘要实际溢出时渐隐，完整卡片显示全部内容。

- `npm run build` 通过，`npm test` 42／42 通过。新增 `node --disable-warning=ExperimentalWarning scripts/qa-card-markdown.mjs [安装版EXE]`，在独立 `NOVEL_STUDIO_DATA_DIR` 中导入随源码公版《西遊記》，编辑格式探针卡。源码最终报告 `.local/card-markdown-qa-CTVISh/report.json`；最终隔离安装报告 `.local/card-markdown-qa-kCjmlI/report.json`。1460×1000 和 900×760 截图已目视检查，标题、列表、强调、短引用、分组标签及摘要无横向溢出。九类色值逐项检查，普通列表未误识别为标签，未知分组保持中性。
- 用 `node scripts/qa-card-markdown.mjs "$env:LOCALAPPDATA/Programs/Novel Studio/Novel Studio.exe" --before` 在仍为 0.1.18 的正式目标程序上显式设置隔离资料，复现 `**`、`##` 原样显示。证据 `.local/card-markdown-qa-8Lqeu6`。新版通过原始 Markdown 编辑回读、取消不写入、保存后再打开、证据首条定位与返回；只读展示不增加卡片修订。HTML 探针不执行，卡内外部链接不产生可点击链接，图片不加载且未发出外部请求。
- `node scripts/qa-card-viewer.mjs` 源码和最终隔离安装均通过，继续验证纯文本、默认阅读、折叠证据和按需编辑。最终安装报告 `.local/card-viewer-qa-1AVVj4/report.json`。`node scripts/qa-desktop.mjs` 源码 13／13 通过，报告 `.local/desktop-qa-7dAdGs/report.json`；摘要渐隐调整前的隔离安装也通过 13／13，报告 `.local/desktop-qa-lVccHL/report.json`。
- 外部交接 README 已注明 0.1.19 的实际显示能力，通用制卡要求及协议不变。运行 `python -B -X utf8 .local/markdown-release-0119/update-handoff.py`，核对交接 ZIP 19 个文件及嵌入规范，仅 README 变化。发布和桌面派工副本一致，提示词摘要不变，`来源与校验.json` 的原文条目完整保留。回执 `.local/markdown-release-0119/handoff.json`，旧派工件保存在同目录 `dispatch-before`。
- 正式升级前无正式工作台进程。运行 `node --disable-warning=ExperimentalWarning .local/markdown-release-0119/backup.mjs` 导出一致备份 `before-upgrade.zip`，SHA-256 为 `db78c936aecc5d33d7fac51b4f126059c0821e35c2785d0227756cdb0c37ae06`。只读核对当时正式库为 27 部（15 部在用、12 部封存）、278 卷及正文版本、1,110,178 个正文块、101 张卡。统计记录 `.local/markdown-release-0119/backup.json`。
- 最终安装器安装到 `.local/install-qa-0.1.19-markdown-final`，通过 `qa-installed-smoke.mjs`、上述 Markdown 专项及卡片编辑回归，再运行 `node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs '.local/install-qa-0.1.19-markdown-final/Novel Studio.exe'`，13／13 通过且无页面错误。报告 `.local/desktop-qa-sfEZ4r/report.json`。
- 执行 `scripts/upgrade-windows.ps1 -Version 0.1.19 -IsolatedInstall .local/install-qa-0.1.19-markdown-final -RecordFile .local/markdown-release-0119/upgrade.json -GracefulClose`，正式程序从 0.1.18 升到 0.1.19。正式程序与隔离安装的关键文件摘要一致，SQLite、扩写、本地模型及 AI 检索配置的安装前后摘要一致；桌面「小说工作台」仍指向正式安装的 EXE，目标通过显式隔离资料的启动验证。安装器 SHA-256 为 `c7e83c666a2638ce14881496a0f645fcf6d002e2a91f5ee9b6ff8ebefe21b319`。文档更新后运行 `npm run package:source`，源码 ZIP 核对版本、CRC、关键文件和资料排除，交付摘要见 `release/NovelStudio-0.1.19-SHA256.txt`。
- 源码 ZIP 解压至 `.local/markdown-release-0119/source-check`，设置 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 后实际执行 `npm ci --prefer-offline`、`npm run setup:electron -- 'D:/Vibe Coding/Novel Studio/release/electron-v43.2.0-win32-x64.zip'`、`npm run build` 及 `node --disable-warning=ExperimentalWarning scripts/qa-card-markdown.mjs`，全部通过。运行时 ZIP 经脚本摘要校验，专项回执在该解压目录的 `.local/card-markdown-qa-uMAQUT/report.json`。补记文档后重做源码 ZIP。

## 接手时先看这些记录

下表记录最近一次相关实测。各版本的验收和升级结果在文末按版本记录。复跑入口、所需样本和隔离安装步骤见[发布检查清单](release-checklist.md)。

| 范围 | 最近确认的结果 | 本机证据 |
| --- | --- | --- |
| 服务层和转换器 | 0.1.19 Node 42/42。外部转换器最近一次为 0.1.15 的 10/10。覆盖 SQLite、参考包校验、版本定位、恢复、扩写、检索接口与密钥配置 | `npm test` 和 `python -X utf8 -m unittest discover -s "拆书规范包/tools/tests" -p "test_*.py"` |
| 源码桌面和写作 | 0.1.19 源码桌面 13/13；写作工作流 13/13 和定向回归 4/4 保留此前各自实测版本。验证书架进书、正常重启和保存故障后的草稿恢复 | `.local/desktop-qa-7dAdGs/report.json`、`.local/writing-workflow-jCQ2b6/report.json`、`.local/writing-regressions-dFT0UD` |
| 扩写 | 0.1.11 源码 12/12，使用本机模拟接口。0.1.8 曾单独完成安装版 12/12 | `.local/expansion-qa-g3m1zY/report.json`、`.local/expansion-qa-tRlMPF/report.json` |
| Windows 隔离安装和正式升级 | 0.1.19 隔离安装、格式专项及桌面 13/13 通过。正式升级前后 SQLite、扩写、语义模型及检索配置摘要一致，快捷方式目标通过隔离启动 | `.local/install-qa-0.1.19-markdown-final`、`.local/desktop-qa-sfEZ4r/report.json`、`.local/markdown-release-0119/upgrade.json` |
| 知识卡格式与配色 | 0.1.19 受限 Markdown、九类与分组配色、宽窄窗口、原始内容保存、纯文本兼容及证据返回通过 | `.local/card-markdown-qa-kCjmlI/report.json`、`.local/card-viewer-qa-1AVVj4/report.json` |
| 随源码的公开样本 | 0.1.12 源码按默认路径复跑《西遊記》31 张卡和 Qwen3。可答题 34/35 进前五、无答案题 9/11 返回空，筛选、取消、故障降级及恢复通过 | `.local/search-qa/retrieval-0.56.json` |
| 真实语料、模型和整库恢复 | 256 卷快照含 26 个书目、9,564 张卡、17,701 处证据，隔离恢复逐类摘要一致。实际 Qwen3 全库抽测 26/26、作品限定 26/27 进前五。这组模型实测使用 0.1.5 | `.local/knowledge-library/snapshot-qa-n4StWc/report.json`、`release/NovelStudio-0.1.5-256卷验收记录.zip` |
| 知识卡整改及封存 | 已核 3,211 张旧卡，11 部覆盖全在库卷。正式封存 12 部，50 道仍在用的卡用 Qwen3 复验，48 道第 1，2 道第 2 | `.local/card-remediation-next/archive-final-20261110/installed-final.json`、`.local/card-remediation-next/archive-final-20261110/search-final.json` |
| 知识卡归档与清空 | 归档 9,575 张卡，清空时为 0 张，后续已重新导入两书共 101 张。安装版隔离演练清空和恢复，保留 256 卷原文 | `.local/reference-card-reset-20261110` |
| 当前参考库与外部交付 | 2026-11-11 两书标准升级按格式与标签简验通过并正式导入，27 部、278 卷、194 张卡（公女 137、暗杀者 57）；未复审内容。旧全量补核包保留，由标准升级接续 | [当前交接](../HANDOFF.md#换对话接手状态2026-11-11) |

`.local` 报告是本机运行证据。换机器后使用源码包和检查清单复跑，公版《西遊記》测试包和查询集随源码提供。256 卷恢复报告记录的文件名为 `NovelStudio-知识库-20261110-第三轮-更新.zip`。与 `NovelStudio-知识库-20261110-256卷.zip` 的实际 SHA-256 相同，后者是按卷数标记的交付名。

### 仍需区分的验证范围

- 中文输入检查覆盖 Chromium 合成输入事件，第三方 Windows 输入法的实体键盘实测待补。安装验证在本机同一 Windows 用户完成。
- Qwen3 检索样本含已记录的漏召回和误召回。50 部、5 万卡的满量真实模型索引仍待验证，现有数字以报告中的语料和应用版本为准。
- 正式 DeepSeek 账户通过余额与模型列表的只读认证检查。生成行为的回归使用本机模拟接口，真实生成曾在本地 Qwen 模型验证，原创扩写的正式账户远程生成尚未实测；参考检索的真实外部 API 已在 0.1.16 单独实测，见对应记录。
- 旧知识卡及整改快照已归档，当前库和外部交付状态见 HANDOFF。全部现存原文纳入重拆，由用户指定范围和外部 Agent；[旧整改记录](knowledge-card-remediation.md)不作为自动续审清单。

## 首份外部拆书验收

2026-11-10，《公女殿下的家庭教师》。审的是桌面 `本地知识库拆书\公爵小姐的家庭教师\施工输出\交付\result.zip`，SHA-256 为 `028f4ba3cdfa3c8995be4a9c9eac1b5df8ab28047611662c4e4cec637f4a68e7`，包 ID 为 `fdb238eb-43dd-5952-a2c7-8952b5d44172`。原文是桌面派工目录中的同名 EPUB，SHA-256 为 `85ef6cfda626839409b0ab28d6121495386f88f7569f9dbc327184974a0946a0`。

- **正文与导入。** 用项目转换器的 `read_epub` 对照最终 ZIP 的有序正文块，75,991 段一致。含正篇 1–20、前传和含两篇短篇的附卷，共 22 个逻辑卷、199 个结构节点、九类 45 张卡。原 EPUB 未提供图片资源。第 18 卷原档到第 1 章，第 20 卷到第 3 章，前传有中略。
- **核读与引用。** 最终 ZIP 为 107 个登记区间、16,564 段（21.8%）。交付记录写了 108 个区间。204 处引用中有 32 处（涉及 22 张卡）未完全落在登记的核读范围内，如蒂娜卡第一条引用 `v01 p000339`。61 处超过 30 段，最长是东都卡的 96 段，应按主张精简或说明连续场景与关键段。以「贯穿全书」为题的复活故事线只引了第 1、4、8、12 卷，应按可证阶段表述。此轮逐条核对位置和区间，对卡面语义按代表项抽查。
- **范围与来源。** 第 9–11 卷已有「艾伦／莉迪亚／林斯特」等用字，且有混用。包内报告和外部记录分别写第 12 卷和第 9 卷切换，需以卷段例证统一，译名本身不足以确认来源。研究表登记了社区资料与动画信息，未登记出版社查询。角川系列页提供人物介绍和分卷梗概，可供核对范围内的阶段，并以本地正文落证。[角川系列页](https://promo.kadokawa.co.jp/fantasiabunko/special/201812koujodenka/)
- **实际检索。** 安装版 0.1.15 用本地 Qwen3 建立 45 卡索引，复跑 14 道交付题与 3 道独立题。按题单原标注，12 道直接目标题有 11 道全部目标进前五。长问句「男主角是个什么样的家庭教师，为什么总被卷进麻烦」亚连第 1，原问「有哪些男主人设？」无类别限制和人物限定都漏掉亚连。原问「有哪些大小姐人设？」返回莉莉和题单列的四人，莉莉排名第 1。第 9 卷 `p000195` 明确给出莉莉兼为副公爵家大小姐，题单应把她列入适用范围。交付长问句则把公爵夫人排第 1，丽狄雅排第 6。交付题单漏了地点类，补问东都地点卡排第 1。「圣女到底想复活的是谁」命中的是线索卡。「蒂娜最后当上霍华德公爵了吗」返回 10 张卡，抽查的相关卡未回答结局。

从项目根目录使用下列命令。安装版以 Playwright `_electron.launch` 启动本机已安装的 `Novel Studio.exe`，显式设置 `NOVEL_STUDIO_DATA_DIR` 为 `.local/book-review-home-tutor-20261110/profile` 的绝对路径。经参考库界面诊断、确认入库，检查书架、逐条读证据窗口、检索与打开引用，再检查重导为 `duplicate`。204 条证据的首尾定位通过，抽测界面高亮通过。实测结果在 `.local/book-review-home-tutor-20261110/installed-search.json`。本次只在隔离库导入。

```powershell
$result = Join-Path ([Environment]::GetFolderPath('Desktop')) '本地知识库拆书/公爵小姐的家庭教师/施工输出/交付/result.zip'
node '待拆书交接/工具/校验器/validate-result.mjs' $result
python -X utf8 '待拆书交接/拆书规范包/tools/review-cards.py' $result
```

此稿可作为分卷、人物档案写法和打包的样例，按阶段交付处理。下一稿先对齐核读范围、关键主张和题单，再跑安装版原问。漏召回时分别记录卡面是否已经作答和软件的实际排名。独立交接包、回执模板与派工提示词已补这些验收要求。[更新后的拆书流程](../待拆书交接/新版拆书流程.md#4-验收和交付)

更新后的交接 ZIP 核对了 19 个文件的 CRC、相对链接和嵌入规范摘要。解压后运行包内校验器，标准样例和此次外部 ZIP 均通过。项目 `release` 和桌面「Novel Studio 拆书派工」的 ZIP 与提示词摘要一致，旧派工文件备份在 `.local/book-review-home-tutor-20261110/dispatch-before`。[当前派工件 SHA-256](../release/NovelStudio-拆书交接包-v1.0-SHA256.txt)

## 人物检索标签与外部交付状态

- 0.1.15 用卡片标题、别名和正文做关键词与本地语义检索。此次选用正文首段附近的 `检索标签｜…`，继续使用现有正文与别名字段。在内存 SQLite 用现有 `ImportService`、`ReferenceService` 和 `SearchService` 复跑《公女殿下的家庭教师》。原问「有哪些男主人设？」在关键词检索中漏掉亚连。仅在该内存副本给亚连卡加「男主、男性主角、男主人设、魔法家庭教师」一行后，亚连进入第 3。近义词也需实际跑题验证。
- 《世界顶尖的暗杀者转生为异世界贵族》结果包 ID `c9a7a116-3bf8-5833-8353-3edf1c97c652`，ZIP SHA-256 `056aa1f2d81dc3937d88d1e07b0909d30ef5ceb408fad15b8203447a1da76bc7`。离线校验通过，与派工同版正文的 `work`、`volumes`、`structures`、`resources` 一致，共 8 卷、25,941 段。已安装的 0.1.15 用 Playwright 在隔离 `NOVEL_STUDIO_DATA_DIR` 下导入 55 张卡，490 处证据首尾定位通过，重导返回 `duplicate`，界面证据高亮通过。详见 `.local/external-book-qa/assassin-BD6slg/report.json`。
- 该包 55 张卡的 `content` 均有 `**`，在安装版卡片中原样显示。复跑交付表 21 个问句和 4 个独立问句。「有哪些男主人设？」无类别限制时只回学园设定，人物限定时返回空。法丽娜公主有第 4、6 卷的委托与行动证据，现有包只有王室等关联卡，可单独补人物卡。研究记录说明「肇端」是话名，女神卡却收入 `aliases`，须对照第 5 卷 `p002114` 清理。独立验收结论为待返工，正式库未导入。
- 用 `pwsh -File scripts/scan-book-reviews.ps1` 扫描桌面。两份结果均按实际摘要标记待返工，派工原文旁及目录已标对应版本和范围。旧包按原判定跳过，替换 ZIP 则重新列为待复验。[扫描和标记约定](maintenance.md#扫描外部交付与标记原文)
- 用 `scripts/scan-book-reviews.ps1 -Root .local/dispatch-tags-20261110/scan-fixture` 验证三种队列行为。已验收同摘要跳过，替换 ZIP 列待复验，无记录列待验收，探路稿未被拾取。交接包 19 个文件的 CRC、相对链接和嵌入规范摘要通过。解压后用随包校验器校验标准样例和两本实际交付均通过。桌面和项目派工文件摘要一致。[当前派工件 SHA-256](../release/NovelStudio-拆书交接包-v1.0-SHA256.txt)

## 两部外部交付返工

两部只返工已定位的问题。保留原交付，设置 `NS_REWORK_DESKTOP` 为桌面路径，使用 `python -B -X utf8 .local/rework-books-20261110/build.py` 生成工作副本，通过 `待拆书交接/工具/pack-result.py` 生成新包。对比新旧包的作品身份、正文块、卷章结构、资源和既有卡 ID，通过 `validate-result.mjs` 与 `review-cards.py` 核对新包。两包均无越界引用编号，卡片标题及正文清除用于排版的粗体符号。

- 《公女殿下的家庭教师》45 张卡。补核原来 32 处引用缺口对应的 178 个原文段，累计登记 16,742／75,991 段。核读区间覆盖所有现有引用。收窄《深紫》和王室卡的局部证据，调整「贯穿全书」等超出范围的表述，按原档用字统一译名说明。阶段稿仍有 59,249 段未登记核读，第 18、20 卷原档缺章，筛查仍有长引用等复查线索。
- 《世界顶尖的暗杀者转生为异世界贵族》由 55 张增至 56 张卡。补法丽娜公主档案，将替身妮曼、委托名义和实际参与人区分。女神卡删除话名「肇端」这一别名。所附同版正文范围仍为第 1–8 卷。
- 设置隔离 `NOVEL_STUDIO_DATA_DIR`，以 `node .local/rework-books-20261110/verify.mjs` 在已安装 0.1.15 复跑 22 与 30 组问句及筛选，核验 204 与 495 处证据首尾和重导。第二本先导入同版原文，返工包新增 56 张卡、0 个正文版本。两本的男主在原样短问中分别第 3、2，人物限定后第 2、1。公主人设和王女人设均命中实际公主第 1。第一本的长句大小姐题仍有公爵夫人排在前五，丽狄雅未进前五。界面抽测无粗体符号外露，证据高亮通过。实测日志为 `.local/rework-books-20261110/variant/qa-vgnbNK/report.json`。
- 用 `python -B -X utf8 .local/rework-books-20261110/publish.py` 将新包及回执置于各书 `施工输出/交付`，同步书目录和派工原文状态。用 `scripts/scan-book-reviews.ps1` 回读，第一本阶段稿为待返工，第二本返工版为已验收。正式库未写入。
- 派工流程增加从最终 ZIP 检查实际卡面、区分章节名和有效别名、核对替身或代传委托，以及检索只命中关联卡时补查人物档案的要求。记录「王女」与「王女人设」的实测差异，要求补词后复跑原问。新交接 ZIP 核对 CRC 和相对链接，解压后的校验器通过标准样例和两本返工包，桌面和 `release` 副本摘要一致。[派工文件摘要](../release/NovelStudio-拆书交接包-v1.0-SHA256.txt)

## 两份返工包正式导入

用户授权把两份返工包导入正式资料库。先核对正式库，发现《公女殿下的家庭教师》已手动导入初稿 45 张卡，内容与原交付一致，卡片修订号均为 1。该书 22 卷与《暗杀者》8 卷的卷 ID、正文版本和每个正文块均与返工包一致。

使用 0.1.15 源码的 `BackupService`、`ImportService` 操作正式 SQLite。执行 `node .local/formal-import-two-20261110/run.mjs`，生成一致备份 `.local/formal-import-two-20261110/before-import.zip`，从备份解压到隔离库演练，再正式导入。核对每张卡及证据数量、重复导入判定、SQLite 完整性、原创表及参考正文和结构的摘要。实际结果见 `.local/formal-import-two-20261110/report.json`。

演练与正式结果一致。《公女》更新 45 张，新增正文版本 0；《暗杀者》新增 56 张，新增正文版本 0。正式库共 101 张卡，两包重导均判重复。全部原创表、既有正文块、版本、目录结构和资源的前后摘要一致。提交目录的验收标记增加正式导入记录，《公女》的待补核状态继续保留。

执行 `node .local/formal-import-two-20261110/index.mjs`，沿用正式 `embedding.json` 的 Qwen3，建立 101 张卡的向量索引。按作品及人物类别复跑男主、大小姐、公主三类短问句，均能命中对应人物。男主题亚连第 2、卢各第 1，两本的实际公主均第 1。实际结果在 `.local/formal-import-two-20261110/search.json`，备份文件摘要在同目录的 `backup-SHA256.txt`。

## 0.1.16 外部 AI 辅助检索

2026-11-11，Windows x64。使用独立 `retrieval-api.json` 保存 OpenAI 兼容接口的多模型配置，复用现有系统密钥加密、接口验证和受限网络请求实现。前端勾选「外部 AI 辅助」才发送问题和最多 36 张候选卡摘录。每张摘录最多 2,400 字。两阶段分别返回搜索计划和已有候选编号，最终展示既有知识卡及证据。

- `npm test` 42／42 通过。新增三项集成测试覆盖限书限类别、分页不重发 API 请求、无效编号回退、无答案返回空、纯本地模式不调用 API、取消与库变更失效。原本地检索保持既有默认门槛，AI 候选阶段单独放宽向量门槛。
- `node scripts/qa-expansion.mjs` 12／12 通过，证据在 `.local/expansion-qa-Ikftg8`。`node scripts/qa-desktop.mjs` 13／13 通过，证据在 `.local/desktop-qa-lnm8wj`。两项均使用独立资料目录。
- 0.1.16 隔离安装的 `qa-installed-smoke.mjs` 和 `qa-retrieval.mjs` 通过。测试实际设置表单、密钥加密且不回填、配置与扩写独立、两阶段 HTTP 请求、错误回退、本地模式不联网和原文高亮。已目视宽窄设置页截图，证据在 `.local/retrieval-qa-OHSnOl`。首次隐藏窗口截图未完成，改为截图前显示隔离窗口后通过。
- 收紧模型筛选提示后的最终安装器另装在 `.local/install-qa-0.1.16-retrieval-final`，再次通过隔离启动和完整 `qa-retrieval.mjs`，回执及截图在 `.local/retrieval-qa-QSCtPj`。
- 真实 API 测试使用正式已保存模型配置的隔离副本，保留原配置。复制同一 Windows 用户的 Chromium `Local State` 到隔离目录，使系统能够解开该资料目录的加密密钥。只复制配置本身时不能解密，故正式迁机仍需重新输入密钥。真实样本为目前两本共 101 张卡，核对本地 Qwen3 与外部模型流程。日志在 `.local/retrieval-live-20261111/report.json`。
- 原问「有哪些装逼（打脸）的情节？」本地为 0。首次外部筛选过宽，收紧关于轻视与事实反转、公开展示及他人反应的条件后，复测返回「王宫魔法士测验落榜」「蒂娜的入学考与放榜」「穆尔铎决斗」三张候选。无据题「主角因为做饭太难吃，被全村人赶出村子的情节」返回空。「有哪些男主人设？」的真实外部复测只选出亚连和卢各。结果为样本表现，模型筛选仍需通过卡片和原文核对。复测记录在 `.local/retrieval-live-20261111/recheck.json`。
- 最终安装版在相同隔离库不限定类别，原样打脸问句返回「猎巫审判」「王宫魔法士测验落榜」「打破前提的转折写法」「穆尔铎决斗」四张候选，其中一张为手法卡。需要只看事件时可限定类别，模型筛选具有变动性。记录在 `.local/retrieval-live-20261111/all-types.json`。
- 正式升级前正常关闭工作台，生成一致备份 `.local/retrieval-release-0116/before-upgrade.zip`。正式 `retrieval-api.json` 单独沿用已有模型接口及加密密钥，默认关闭思考以缩短检索等待。执行 `scripts/upgrade-windows.ps1 -Version 0.1.16 -IsolatedInstall .local/install-qa-0.1.16-retrieval-final -RecordFile .local/retrieval-release-0116/upgrade.json`，确认正式安装和隔离程序文件摘要一致，资料库、扩写、本地模型和新检索配置的前后摘要一致，桌面快捷方式目标及隔离启动通过。

## 0.1.17 参考库与设置界面整理

2026-11-11，沿用灰白桌面风格，通过实际 0.1.16 隔离窗口复现参考页多排控件和设置长页的问题，再按截图自查新布局。参考检索收紧内容宽度与卡片阅读宽度，合并输入区的外部 AI 开关、接口入口和数据发送说明。三条示例只填入草稿。设置提供外观与阅读、写作、AI 辅助检索、AI 扩写、本机资料五组导航，切换分类保留未保存的字段。窄窗口改用横向分类入口。

- `npm test` 42／42 通过，`npm run build` 通过。后端与协议沿用。
- `node scripts/qa-workspace-ui.mjs` 通过。覆盖示例不自动请求、AI 模式告知、检索页直达接口设置、两类接口独立、切组保留未保存字段、检索草稿保留、导入、检索、证据阅读返回和书架。1460×930、900×930 的五个设置组均无横向溢出。记录与截图在 `.local/workspace-ui-Otwm2X`。
- `node scripts/qa-retrieval.mjs` 在新版分组设置页验证保存、加密、连接、检索和错误回退通过，证据为 `.local/retrieval-qa-apUw06`。
- 源码 `qa-desktop.mjs` 13／13、`qa-expansion.mjs` 12／12 通过，证据分别在 `.local/desktop-qa-On7AIN` 和 `.local/expansion-qa-o3cKWe`。导航相关脚本已改为从设置分类进入对应功能。
- 生成安装器并在 `.local/install-qa-0.1.17-ui` 独立安装，显式使用隔离资料运行启动、`qa-workspace-ui.mjs` 和 `qa-retrieval.mjs` 均通过。回执分别为 `.local/workspace-ui-RH9maY`、`.local/retrieval-qa-Dqg6Db`。
- 原布局与真实书架的前后截图在 `.local/ui-polish-0117`。实际查看了检索空态、有结果、设置外观及接口表单的宽窄截图，采用自查评审，调整输入区与导航间距。
- 正式升级前生成一致备份 `.local/ui-release-0117/before-upgrade.zip`。执行 `scripts/upgrade-windows.ps1 -Version 0.1.17 -IsolatedInstall .local/install-qa-0.1.17-ui -RecordFile .local/ui-release-0117/upgrade.json`，正式从 0.1.16 升级到 0.1.17。资料库、扩写、本地模型、外部检索配置的摘要一致，程序与隔离安装文件一致，桌面快捷方式及目标启动核对通过。

## 0.1.18 知识卡默认阅读

2026-11-11，实际 0.1.17 隔离安装中复现知识卡正文和编辑表单同时显示。默认详情改为单份内容的阅读视图，右上角提供编辑按钮，证据列表默认折叠。编辑模式只显示表单，支持取消编辑。导入时的手工合并继续使用既有表单。

- `npm test` 42／42、`npm run build` 通过。
- `node scripts/qa-card-viewer.mjs <0.1.17安装程序> --before` 确认内容重复，截图在 `.local/card-viewer-qa-tYhtmm`。
- `node scripts/qa-card-viewer.mjs` 从参考库正常导入并打开卡片，确认默认无编辑控件、内容一次、证据折叠。展开证据后可跳原文并返回；编辑时无重复预览；取消丢弃修改，保存后重开能看到修改且仍为阅读模式。1460／900 窗口截图及回执在 `.local/card-viewer-qa-7SnJce`。
- `qa-workspace-ui.mjs` 源码回归通过，证据为 `.local/workspace-ui-1nIc8b`。0.1.18 独立安装在 `.local/install-qa-0.1.18-card`，显式隔离资料后通过启动、知识卡阅读编辑和工作台 UI 验收，回执为 `.local/card-viewer-qa-CEJYW1`、`.local/workspace-ui-Wi4gFW`。
- 源码 `qa-desktop.mjs` 13／13 通过，覆盖共享弹窗涉及的创建、导入和备份恢复，证据为 `.local/desktop-qa-KTqSHY`。
- 正式程序正常退出后生成一致备份 `.local/card-release-0118/before-upgrade.zip`。执行 `scripts/upgrade-windows.ps1 -Version 0.1.18 -IsolatedInstall .local/install-qa-0.1.18-card -RecordFile .local/card-release-0118/upgrade.json`，从 0.1.17 升级到 0.1.18。正式程序与隔离程序摘要一致，资料库及各模型配置摘要一致，桌面快捷方式和隔离启动核对通过。

## 交接包轻量格式与九类标签标准

2026-11-11，用户确认按轻量格式和语义颜色方向更新派工规范，并要求区分通用制卡要求与专书返工。此次同步交接包、派工提示词、制卡标准、回执模板与自创示例。现有参考库的格式和标签整理列为下次用户指定返工时的待办。

- 通用标准覆盖九类卡的分组标签、近义问法、同版依据和自然语言检索验收。事件重点检查冲突、反差、转折和结果，口语情节标签需有实际过程与反应支持。既有卡按内容充分、概括过粗、缺卡三种情况处理，核读、补卡、标签及排版分别记进度。具体书目和剩余核读量在 HANDOFF 的专书待办中登记。
- `title` 保持纯文本，`content` 允许小标题、短段落、列表、少量粗体和带证据的短引文。检索标签用同一字符串内的 Markdown 小节及分组列表表示，颜色由软件处理。Schema 与正文身份规则沿用。交接包明确 0.1.18 仍按纯文本显示，富格式渲染和配色待软件实现，显示实测另行登记。
- 根目录规范与交接包嵌入规范三份文档摘要一致。重新生成 `release/通用拆书规范包_v0.4.zip` 和 19 文件的独立交接 ZIP，校验 CRC、相对链接、嵌入文件和独立提示词一致性，桌面与 `release` 副本及 `来源与校验.json` 摘要一致。
- 从新包解压后的校验器验证原纯文本标准样例，通过；用自创灯塔样例生成带标签分组和粗体的 Markdown `content`，经随包打包器与校验器通过。内存 SQLite 经 `ImportService` 真实导入，格式字符串与证据保留，重导为 `duplicate`。记录和样例在 `.local/handoff-format-tags-20261111`。

本轮只更新规范与交付文档。原派工包和源码交付件保存在上述目录的 `before` 中，当前交接文件摘要见 `release/NovelStudio-拆书交接包-v1.0-SHA256.txt`。

## 0.1.0 初版验收

2026-11-09，Windows x64 本机。应用资料、试验安装和样本放在项目隔离目录。v0.3 的 NTS／NKS draft-0.1 字段契约沿用原 Schema。

### 服务层

`npm test` 执行真实 SQLite 和 ZIP 集成测试。

- 原创保存、暂存恢复、UTF-16 标记变换与失效、近期历史、回收和恢复通过。使用 SQLite 触发器制造写入失败，验证旧正文和暂存稿同时保留。
- 拦截未知协议版本、错误正文和资源 SHA、非法段落号和逆序区间、跨作品或错误版本引用、兄弟章节重叠、正文漏归属、缺图和恶意 ZIP 越界路径。
- 审核前参考库为空。重复包不会增加卡片。修改过的卡片保留，未解决冲突导致整批回滚。后续正文版本可与旧版本并存，既有证据仍定位原版本。
- 合成 3,024,000 中文字符和 12,006 个块，定位第 10,000 段时只读取 120 段窗口。样例插图和双向注释入口正常。
- 从实写数据库导出、改动、再恢复，核对原创正文、标记、手改卡、证据、导入计数和保留快照。

### 原文转换和试拆

- 公版《西遊記》来自 Project Gutenberg #23962。原 EPUB SHA-256 为 `23527709a28a2ef8578dc7ee97b833ff04565e2d814a64f2a5ebabbb15b30c57`。最终工具 0.2.0 按 OPF 阅读顺序提取 100 回、3,035 段，两次共用身份重跑的摘要相同。试拆产物保留早期转换的 2,981 段版本与前三回的 31 张有据卡，处理区间与未拆范围一同记录。检索查询集和产物在 `.local/acceptance/xiyou`。[原书来源](https://www.gutenberg.org/ebooks/23962)
- 公版《Alice's Adventures in Wonderland》来自 Project Gutenberg #11。本次实际 EPUB 的图片为 SVG 包装页中引用的 JPEG 封面。转换、应用审核、SQLite 入库与图像读取已实跑，读取出的图片 SHA 与声明一致。内文图片和带锚点的注释另由合成 EPUB 覆盖。[原书来源](https://www.gutenberg.org/ebooks/11)
- 检查并执行了 wenku8 5.1.0 的发布版 EPUB 生成器，使用本地机制样书验证目录、spine、注释类和图片。同一身份清单及 `--volume-key builder-series` 下，两卷版、三卷版的前两卷 ID 和正文哈希一致。导入时分别新增 2、1 个正文版本。榜单与联网下载需要站点登录态。实际下载验收仍需一份有权处理的多卷 EPUB 成品。[下载器上游](https://github.com/Messiahhh/wenku8-downloader)

### 模型与检索

用从模型发布 ZIP 解压的 Qwen3-Embedding-0.6B Q8_0 和 llama.cpp b12224 CPU x64，执行 `node --disable-warning=ExperimentalWarning scripts/qa-search.mjs .local/acceptance/xiyou .local/release-model-probe-full/model`。实测维数为 1,024，向量由模型进程返回。

| 指标 | FTS5 关键词 | FTS5 与本地语义融合 |
| --- | --- | --- |
| 可回答问题前五命中 | 26/35 | 34/35 |
| 无答案问题正确返回空 | 10/11 | 9/11 |
| 46 条混合查询的降级次数 | 关键词基线 | 0 |
| 混合热查询 P50／P95 | — | 109／124 ms |

离线包解压后 31 卡首次索引约 10.0 秒，推理进程工作集约 974 MiB。实际验证作品与类别筛选、请求取消、杀死正在工作的模型进程后返回关键词结果、下一次检索重新启动模型。查询集来自同一部作品的试拆，0.56 阈值在该集上校准。两条无答案问题仍返回了相似但无关的卡。50 部／5 万卡实际模型满量索引待测。

### 桌面与视觉

实际 Electron 窗口的 Playwright 测试经 Chromium 组合输入事件输入中文，检查数据库中的实际正文及标记。桌面回收、TXT、导入确认、消息侧栏、同一会话折叠恢复、插图解码、注释跳转及备份恢复均运行过。测试程序为文件对话框注入路径。第三方 Windows 输入法的实体键盘覆盖待补充。

用户要求参考 Codex 桌面布局后，改为灰白导航轨、单一文稿画布和按需侧栏。两轮独立截图评审后，收起次级树菜单，修正搜索定位和正文裁切。宽窗侧栏停靠，窄窗以可关闭的覆盖层呈现。最终截图在 `.local/visual-qa-SUS6dI`，由安装版实际运行捕获。[Codex 设计参考](https://openai.com/index/introducing-the-codex-app/)

### Windows 安装复验

NSIS 3.13 使用 `npm run package:windows` 生成安装器。静默安装到新的项目隔离目录，首次实际窗口启动约 3.4 秒。安装版从隔离资料库启动并使用内置 SQLite。桌面验收报告为 `.local/desktop-qa-IBnqIq/report.json`。SQLite 保存失败后结束整个进程树，重启约 0.75 秒并读回暂存正文。

安装版从资料目录检测离线模型，导入《西遊記》试拆包。检索“瀑布後面的洞府叫什麼？”时，两路候选分别为 4、1，首项为“水簾洞”，证据入口定位至入库版本。报告在 `.local/installed-model-qa-0SKkfP/report.json`。此次验证使用本机同一 Windows 用户和全新应用资料目录。

### 交付文件核对

Node 测试 11 项通过。转换器回归 10 项通过。规范 ZIP 解压后直接运行其中的转换器，成功读取 UTF-16 BOM TXT 并生成草稿结果包。

| 文件 | 大小（字节） | SHA-256 |
| --- | ---: | --- |
| NovelStudio-0.1.0-x64-Setup.exe | 144849644 | `0ccaf53f8c9450185d1b120555edc3cef2c127221265d1ec477a0f63d266c080` |
| NovelStudio-LocalModel-Qwen3-Q8_0.zip | 660406068 | `6b1a5777ad9c36977e68a5eea255c0263de03ea96bfe0801d5b504ccd74cefcd` |
| 通用拆书规范包_v0.3.zip | 24184 | `b722d2a9ecfe013918e76a79c23c92444bafc828963cb25b686061dea218c618` |

## 0.1.1 写作改进复验

2026-11-10，在隔离安装目录和全新的应用资料目录中复验。

- 安装版以按钮和 Esc 退出专注，退出后原章保留。中文组合输入、800 毫秒自动保存及写入失败后的强退恢复通过。
- 确认稿纸底纹、宋体、20 px 字号、39 px 实际行高和视觉缩进作用到 CodeMirror。数据库正文一致。主题色、纸色、底纹重启后恢复。
- 分别创建并编辑大纲、角色、设定，验证列表隔离。同屏预览大纲时正文仍在原章。已有文档无数据库迁移。
- `npm test` 13 项通过。新增测试验证当前版本暂存稿可被预览或导出而不提交，以及同类资料独立排序。桌面记录在 `.local/desktop-qa-wBdfug/report.json`。
- 安装版定向复验确认查找替换只改匹配内容，延迟请求下双击只创建一章，切章期间旧编辑器锁定，以及整书导出不会与正常保存冲突。记录在 `.local/writing-regressions-G4j6Qe`。
- 用隔离的 0.1.0 程序先写入三类资料，再用 0.1.1 读取同一目录，标题和正文逐项一致。最终稿纸、侧栏及专注退出截图在 `.local/visual-qa-pC3Ne3`。
- 安装包 `release/NovelStudio-0.1.1-x64-Setup.exe` 大小 144853570 字节。SHA-256 为 `f2ea0e11f4a36d98b7bace569b4dee1a5af9d4805c4507236c76e3af19bd5176`。

## 0.1.2 写作工作流复验

2026-11-10，使用实际 Electron 窗口、隔离资料目录和测试正文。

- `npm test` 19 项通过。新增用例覆盖正文搜索的卷章顺序、暂存优先、类型隔离、UTF-16 偏移和结果上限，以及续写元数据损坏、容量与版本失配。
- 最终安装版工作流通过 10 项。160 段中文正文跨卷切章和正常重启后，实际光标为 2407，编辑器滚动位置为 4170 px。真实选择范围验证了全文搜索和自动保存期间的标记跳转。章节对照不切换主章，一键整理可撤销和重做。报告及截图在 `.local/writing-workflow-2j3EGw`。
- 安装版回归通过查找替换、延迟请求下单次建章、切章期间冻结旧编辑器、读暂存稿导出。另用上版验收用的 SQLite 副本打开正文、大纲、角色和设定共四条，类型、标题和正文完全一致。
- 最终安装器在 Windows 最小外框 880×600（内容区 864×561）复验。打开含 30 条记录的回收站后目录仍有 49 px 可用高度。末条能滚动访问并写入 SQLite 恢复，保持展开时可搜索、切章和新建卷章。最终安装版截图位于 `.local/visual-qa-HqOvNl`。
- 桌面回归通过中文组合输入、专注退出、主题与稿纸、标记失效、TXT、回收、标准结果包幂等、参考侧栏隔离、证据版本、图片和注释、备份恢复，以及保存故障后强退恢复。真实 Qwen3 检索以公版《西遊記》试拆包测试，命中 4 条关键词候选、1 条语义候选，首项为“水簾洞”，可以打开证据。记录在 `.local/desktop-qa-0aTZN6/report.json` 与 `.local/installed-model-qa-w4RLJZ/report.json`。
- 桌面「小说工作台」快捷方式指向当前用户安装目录。升级后从该目标程序启动隔离窗口，界面和 IPC 均报告 `0.1.2`，正式与隔离安装的程序和前后端文件哈希一致。记录在 `.local/shortcut-qa-0.1.2.json`。
- 最终安装器 `release/NovelStudio-0.1.2-x64-Setup.exe` 为 144861454 字节，SHA-256 为 `2271b25abf108492c7d8cbd3a6969f113902480695a4046fee0160520916a5fa`。

## 0.1.3 侧栏整理复验

- `npm test` 19 项通过。最终安装版 `qa-writing-workflow.mjs` 12 项通过。验证了左栏仅显示卷章、右侧资料与参考互斥、资料预览与编辑、参考会话和未提交输入保留，以及空作品时用键盘打开参考并通过 Esc 返回入口。报告在 `.local/writing-workflow-jmm2oo/report.json`。
- 最终安装版实拍复核了宽窗停靠和窄窗抽屉，截图在 `.local/visual-qa-qzy19Z`。
- 安装版原有写作回归四项通过，记录在 `.local/writing-regressions-oSjU8X`。实测本地 Qwen3 返回关键词候选 4 条、语义候选 1 条，首项“水簾洞”可跳原文。记录在 `.local/installed-model-qa-xHO5sj/report.json`。
- 最终安装版完整桌面回归 12 项通过，含资料重命名、回收和恢复、备份恢复、写入故障后强退恢复。报告在 `.local/desktop-qa-MAl6pi/report.json`。
- 正式工作台走应用正常保存退出流程后升级。从桌面快捷方式目标程序启动的隔离窗口报告 `0.1.3`，且前后端及程序文件哈希与隔离安装一致。记录在 `.local/shortcut-qa-0.1.3.json`。
- 安装器 `release/NovelStudio-0.1.3-x64-Setup.exe` 为 144861236 字节，SHA-256 为 `581b488658b00f6cdf7ec98ec500ecdc8afe6f9a5b8dd70e5583cd28e8eda789`。

## 0.1.4 参考卷序与真实语料复验

- 0.1.3 的真实五卷合并包中复现卷序错位。0.1.4 使「第…卷」按卷号排序，同时保留正文标题、版本与证据段号。回归覆盖乱序导入、中文数字、阿拉伯数字、全角数字与番外。
- `npm test` 20 项通过。Windows 实际隔离安装复验中文组合输入、自动保存、故障重启、右侧资料、参考跳转、插图、注释、重导和备份恢复。原始运行记录位于 `.local/desktop-qa-8SeQZc` 和 `.local/writing-workflow-zwA80j`。
- 《乙女游戏世界对路人角色很不友好》前六卷合并包在 0.1.4 的新资料目录确认导入 333 卡，Qwen3 实际建索引后每卷抽题命中，两个侧栏跳转定位到准确正文版本，按卷号排列，恢复快照后卷、卡与证据抽查一致。日志位于 `.local/knowledge-library/mobuseka/accepted-v01-v06/installed-library-qa.json`。
- 安装器 `release/NovelStudio-0.1.4-x64-Setup.exe` 共 144861626 字节，SHA-256 为 `fd2012d7f34ab2cea87363ee48cdbe10c72ae823542a05230c197276e6a6d415`。已升级当前用户安装，并从桌面快捷方式的目标程序实测正式资料目录，启动版本、卷序及正文版本见 `.local/knowledge-library/mobuseka/formal-app-qa.json`。
- 修订后的主线 13 卷合并包在隔离安装导入 706 卡，实际 Qwen3 建索引后 13 卷均有抽题前五命中，14 次试题检索中命中 13 次。无关题 2/2 返回空，分类和作品筛选返回正确范围，首尾卷的侧栏消息定位各自正文版本。备份恢复后卷序、卡片 ID 和每卷抽样原文一致。报告位于 `.local/knowledge-library/mobuseka/accepted-v01-v13/installed-library-qa.json`。
- 《玩乐关系》归档两卷共 91 卡和 117 条证据。合并包完成隔离导入、真实模型、两卷侧栏跳转和备份恢复复验。三部中译 EPUB 归档经外部转换得到 27 卷标准正文，重跑文件哈希一致。原文件缺少图片，图片和注释由另外的真实 EPUB 与桌面样本覆盖。
- 《恋人不行》归档八卷共 384 卡、765 条证据。实机验收包括八卷合并导入、真实模型、无关题、筛选、两次侧栏跳转和备份恢复。报告位于 `.local/knowledge-library/queued/watanare/accepted-v01-v08/installed-library-qa.json`。
- 0.1.4 检索服务以实际 Qwen3 进程复验取消和故障降级。46 道测试中，可答题 34/35 前五命中，无关题 9/11 返回空。强制退出模型后降级为关键词检索，重启后恢复。报告位于 `.local/acceptance/search-0.1.4/retrieval-0.56.json`。
- 《怕痛的我》十七卷合并包 727 卡、1,237 条证据。在实际 0.1.4 和 Qwen3 进程中，17 卷各有一道自然题前五命中，两道无关题均返回空。两次侧栏跳转命中正确卷和版本，恢复后卷序、卡 ID 与抽样原文一致。报告位于 `.local/knowledge-library/queued/bofuri/accepted-v01-v17/installed-library-qa.json`。
- 新资料目录通过外层快照恢复演练。四部 40 卷、1,908 卡按应用审核流程逐本入库并重复导入检查，另实际输入测试原稿。应用备份后改变原创与参考状态再恢复，数据表逐行摘要一致。报告位于 `.local/knowledge-library/snapshot-qa-VveuLk/report.json`。
- 《谁杀了勇者》三卷 141 卡、197 条证据通过分卷和联合复验。实际安装版验证三卷正确顺序、Qwen3 混合检索、两道无关题、首尾卷跳转和快照恢复。报告位于 `.local/knowledge-library/queued/hero/accepted-v01-v03/installed-library-qa.json`。
- 首部主线新增四张跨卷汇总卡。实际安装版逐一读回 14 个证据范围并核对原文、版本及细节卡 ID，四道问题均在前五命中。从同一张汇总卡分别打开第一、十三卷，复验正确高亮。报告位于 `.local/knowledge-library/mobuseka/cross-review-v01-v13/installed-library-qa.json`。
- 《无名记忆》六卷通过合并包安装复验。六卷各一道题前五命中，两道无关题返回空，首尾卷侧栏跳转及还原一致。正式快捷方式所用资料库也以 Qwen3 复验当时六部作品的限定和全库检索。报告分别位于 `.local/knowledge-library/queued/unnamed/accepted-v01-v06/installed-library-qa.json` 与 `.local/knowledge-library/mobuseka/formal-app-qa.json`。
- 六部、49 卷的快照复跑整库恢复通过。单独验收记录包核对快照 SHA-256 后收录该次逐表结果、安装和各卷运行报告。该次恢复报告位于 `.local/knowledge-library/snapshot-qa-Gkudee/report.json`。
- 《沉默魔女》九卷 454 卡、650 条证据通过整本安装复验。原文按卷号和正确版本排列，检索、筛选、侧栏证据跳转和备份还原实跑通过。报告位于 `.local/knowledge-library/queued/silent-witch/accepted-v01-v09/installed-library-qa.json`。正式库随后复验当时八部、60 卷的全库和作品限定搜索。
- 《败北女角太多了！》八卷 413 卡、633 条证据通过整本安装复验。报告位于 `.local/knowledge-library/queued/makeine/accepted-v01-v08/installed-library-qa.json`。
- 《食锈末世录》六卷 331 卡、560 条证据通过整本安装复验。实际 Qwen3 在六卷各有一道题前五命中，两道无关题返回空。侧栏证据定位和备份还原通过。报告位于 `.local/knowledge-library/queued/bisco/accepted-v01-v06/installed-library-qa.json`。
- 《弱角友崎同学》十一卷 495 卡、672 条证据通过分卷及联合安装复验。12 道抽题有 11 道前五命中，覆盖十一卷。两道无关题返回空，首尾卷侧栏跳转及备份还原通过。报告位于 `.local/knowledge-library/queued/tomozaki/accepted-v01-v11/installed-library-qa.json`。
- 最终回归 `npm test` 为 20/20，外部转换器 Python 回归为 10/10。当前用户桌面快捷方式所用的 0.1.4 程序载入 10 部、83 卷、4,012 张卡，使用实际 Qwen3 完成增量索引。限定作品检索 11 道抽题有 10 道前五命中，覆盖每部。再用这 10 道题检索全库，全部前五命中。正式程序运行记录位于 `.local/knowledge-library/mobuseka/formal-app-qa.json`。
- 最终知识库快照的十个内层包均通过 ZIP 完整性和 SHA-256 核对。在全新的 0.1.4 资料目录用审核界面逐本入库，重导均命中幂等。新写测试原稿的唯一词未进入参考检索。应用备份后改变原创与参考状态再还原，逐表摘要一致。按稳定 ID 核对恢复库与正式库的 83 个正文版本、347,895 个正文块、4,012 张卡和 7,177 条证据，摘要完全一致。报告位于 `.local/knowledge-library/snapshot-qa-YjBLHb/report.json`。快照 SHA-256 为 `712b5e58bff042f3355f7fcdb87990443707545757e1cd13ff81c60ca1080dd9`。

## 第二轮知识库扩充复验

- 《沉默魔女》第 10 卷新增 53 卡、95 处证据，《怕痛的我》第 18 卷新增 51 卡、85 处证据。两部的旧卷正文版本与首批快照一致。安装版 0.1.4 用实际 Qwen3 复验合并包，分别 10/10 和 18/18 卷的正例进入前五。每部两道无关题均返回空，两处侧栏证据跳转及备份还原通过。
- 《魔女与佣兵》归档第一卷新增 54 卡、111 处证据。分卷包和合并包均已运行实际安装版导入、重复导入、检索和原文跳转。
- 《叹气的亡灵想隐退》四卷 214 卡、595 处证据和《里亚德录大地》六卷 316 卡、654 处证据均通过安装版联合复验。4/4 和 6/6 道卷内抽题进入前五，各自两道无关题返回空。首尾卷原文跳转和恢复后各卷抽样一致。
- 《无名记忆》后日谈两卷 110 卡、283 处证据已作为独立书目入库，分卷及联合实测通过。实际界面检索和跳转覆盖首尾卷，恢复后两卷抽查一致。
- 扩充快照的 14 个内层包均通过 ZIP 完整性和 SHA-256 检查。首批 83 卷、4,012 张卡及其章节对象逐项相同。全新资料目录导入、重复导入、原创隔离、备份恢复均通过。恢复出的 98 个正文版本、413,529 个正文块、4,810 张卡和 9,000 处证据与正式库一致。报告位于 `.local/knowledge-library/snapshot-qa-BDaTC7/report.json`。扩充快照 SHA-256 为 `47f1f32744193329544eee2a6d0805336b5f948a32ce8c698e595a50396567c6`。
- 桌面快捷方式所用正式安装版以本地 Qwen3 为 798 张新卡建立语义索引。限定作品 14/15 进入前五，覆盖全部 14 个书目，并对有追加内容的作品抽测了各自的最新入库卷。复用 14 道命中题做全库查询，全部进入前五。运行报告位于 `.local/knowledge-library/mobuseka/formal-app-expansion-qa.json`。

## 第三轮第一个检查点

- 《叹气的亡灵想隐退》新增第 5–7 卷；《没有信徒》1–3、《魔法革命》1–4、《佐佐木与文鸟小哔》1–5 正式入库。合计新增 15 卷、622 张卡和 1,244 处证据。分卷均以实际安装版和真实 Qwen3 检索；整书联合检查复用同版本、同卡面内容的实测向量，并用运行中的本地模型编码查询。
- 《没有信徒》第 2 卷首测及第一次修订均误召回无关题，实际测量显示是关键词把「太阳」和「需要」算作两次命中。按原文准确表述角色希望尽量网罗人才；保留太阳之国事实和同一道测试题，复验通过。这是一处卡片修订，未修改通用检索器。
- 桌面快捷方式目标的正式安装版第一次索引期间窗口退出，已提交向量保留。重启从剩余 78 张恢复并完成。17 个书目全部有作品限定查询进前五，18 道抽测命中 17 道；17 道对应全库查询全部前五命中。
- 快照 `5b3f710ef403d9100377e4ef61e4a2b5c2c85b6e07cc9b83b25d0a407841f7dd` 在空白资料目录恢复为 17 个书目、113 卷、5,432 张卡和 10,244 处证据。逐表核对通过；旧快照的 98 卷、4,810 张卡及其目录逐项相同。报告位于 `.local/knowledge-library/snapshot-qa-gFAXx6/report.json`。

## 0.1.5 检索修复与分卷结果

- 0.1.4 把「需要」「多少」计入关键词支持，造成两份真实卷的无关问题误召回。0.1.5 排除这两个通用问句词，同时保留长句的匹配门槛和正常短语查询。同一题在两份原失败库副本中复跑，关键词、语义均返回 0；各库两道正常题仍命中。本地 Qwen3 基准与 0.1.4 一致：34/35 正题进前五、9/11 无答案题返回空，仍有两道无答案题误召回；筛选、取消、故障降级和恢复通过。
- `npm test` 20/20，外部转换器 10/10，0.1.5 安装版桌面测试 12/12。覆盖中文输入、自动保存、专注退出、稿纸、创作资料、标记、TXT、重复包、参考与原创隔离、证据/图/注释、恢复与重启。正式快捷方式实际启动新版本，资料目录继续使用原库。
- 新增的第 5–13 卷《叹气》保留各自机器翻译来源和原目录。每卷逐一读取已引用图像并对照 SHA-256；原 EPUB 未引用的资源和无法定位的字形记录在分卷诊断。第 1–13 卷及四张跨卷卡合并实测通过。
- 两批六部新书按实际中译归档入库：12 卷《没有信徒》、9 卷《魔法革命》、10 卷《佐佐木》、6 卷《异世界漫步》、13 卷《不死冒险者》、8 卷《暗杀者》。每部含 4 张跨卷卡，已实际核对跨卷证据、检索和跳转；分卷报告说明哪些原档只有插图占位。
- 正式 0.1.5 对 20 个书目做作品限定和全库检索。限定 21 次抽测中 20 次进前五，覆盖 20 个书目；全库 20/20 进前五。正式索引补建 273 张卡的向量，另有 1,395 张卡核对同一模型、导入包摘要、修订和卡面后复用隔离安装版的真实向量。`formal-app-round3-v015-qa.json` 记录各书目结果。
- 将 165 卷快照与上一个 113 卷快照按稳定 ID 比较：既有 17 个作品、113 个正文版本、5,432 张卡、1,746 个结构项和 82 项资源逐项相同。新快照总计 20 个书目、165 卷、7,100 张卡、13,358 处证据，SHA-256 `86142f49455c6b958ce27d03220a16192fe13eb590b21a44f649458ce4cf87a3`。
- 165 卷快照在空白 0.1.5 资料目录通过逐本审核导入、重导幂等、原创索引隔离和应用备份恢复；恢复内容与正式库摘要相同。原始记录 `.local/knowledge-library/snapshot-qa-JAnt0y/report.json`。

- E17 的《转生成蜘蛛又怎样！》16 卷、《骑士＆魔法》11 卷、《Only Sense Online 绝对神境》16 卷，逐卷在安装后的 0.1.5 用本地 Qwen3 实测，并各做合卷、作品/卷筛选、无答案、引用与备份复验。每作四条跨卷问题均进入前五，按相关卷回读全部跨卷证据；三作各实际验证两次跨卷侧栏跳转。卷内个别自然问句未命中保留在逐卷报告。
- 《绝对神境》第 9 卷有一条卡的「租用或购置」按来源 p001559 更正为「购置」。先保留旧包、核对新旧仅这一项差异并重跑安装版，再由导入审核确认正式卡仍是未手改的原始版本。回执为更新 1、跳过 24、增加正文版本 0；其他卡、正文与引用边界均未改变。
- 208 卷快照包含 23 书目、8,287 卡、15,550 处证据，SHA-256 `c6759588ba18a910cd379ea5c4e9cbb19d1b59c8f93f91c96aa538e618b15e22`。正式 0.1.5 书目限定查询 23/24、全库查询 23/23 进入前五。另以空白 0.1.5 资料目录逐本审核导入、重导、创建独立测试原稿、备份、故意更改数据后还原；恢复后的 855,736 个正文块、3,265 个目录结构、240 个资源及卡片/引用与捕获时的正式库摘要相同。实测报告 `.local/knowledge-library/snapshot-qa-MOtjZQ/report.json`；单独快照及配套验收 ZIP 保存在 `release/`。

- E18 的 218 卷及 236 卷检查点也通过空库导入、重导、原创索引隔离、备份还原和正式库八类内容摘要核对。236 卷为 26 书目、9,030 卡、16,796 处证据；报告 `.local/knowledge-library/snapshot-qa-XqvFbL/report.json`。对比 208 卷检查点，旧作品、卷、正文、卡、目录和资源保留不变。
- E18《天才王子》中文归档 1–12 卷逐卷和整书实机通过，另验 4 张跨卷卡、22 处跨卷证据和两次跨卷侧栏跳转；正式 298 卡、477 处证据。独立源档第 12 卷完整性已核，早期两章残卷未导入。
- E18《无尽连锁》中文归档 1–22 卷逐卷和整书实机通过，4 张跨卷卡前五 4/4、回读 29 处证据和两次跨卷跳转通过；正式 581 卡、863 处证据。第 5 卷保留失败报告，修订后原 14 个正题和 2 个无答案题均通过。第 8 卷原档一章重复 268 块，保留目录和段号，引用只落第一次。第 12 卷的导航误列并回章节，段落不变。
- E18《边境慢活人生》中文归档 1–14 卷逐卷和整书实机通过，卷内正题 171/173 进前五，无答案 28/28；4 张跨卷卡全部进前五，回读 25 处跨卷证据和两次跨卷跳转。正式 398 卡、811 处证据；卷 14 婚礼和日版卷 15 完结范围分别记录。现有归档无完整中文第 15 卷。
- E18 这三部共有 48 卷、1,277 卡、2,151 处证据。逐卷 624/636 正题进前五、96/96 无答案通过，12 张跨卷卡前五 12/12，跨卷证据 76 处、实机侧栏跳转 6 次。单书跨卷包重导时既有分卷卡按摘要跳过，未添加正文版本。
- 正式 0.1.5 的 26 个书目全库抽测 26/26 进前五，限定作品 26/27 进前五；未命中的是《恋人不行》楼顶场景的原问，仍留在正式检索报告。正式安装索引复用并核对 473 条同模型向量，补建 61 条，再以实际本地模型运行两组查询。
- 256 卷最终快照空库审核导入、逐本重导幂等、原创词隔离、混合备份后故意改动再恢复均通过。作品、卷、正文版本、正文块、目录、资源、卡和证据八类签名与捕获时正式库一致：26 书目、256 卷、1,034,187 块、3,943 项目录、240 项资源、9,564 卡、17,701 证据。相对本轮开始的 98 卷及 E17 的 208 卷，既有数据逐项不变。原始记录 `.local/knowledge-library/snapshot-qa-n4StWc/report.json`；快照 SHA-256 `3322cdfd25df1494f07d26a612742a802404d19d0d57cb37e59e1621d7b12d84`。

## 0.1.6 原创选区扩写

- `npm test` 32/32。验证中英文括号、UTF-16、长章截取、真实 SQLite 的资料范围、回收站排除、版本锁、密钥换址和密文绑定、响应/超时/取消、相邻复述保护。原参考入库和检索测试继续通过。
- 安装版以本机模拟接口验了 6 组编辑及设置流程：保留括号内外选法，预览不落稿，确认替换可撤销且自动保存，取消真正断开 HTTP，重启保留已保存内容，启动和保存配置不会请求模型。测试连接仅发送固定句子；实际请求排除了别的作品、章节、回收站与参考卡。系统加密写入 Key 且不回显。实机原写作/参考/备份回归 12/12，报告 `.local/desktop-qa-len4Sw/report.json`。
- 最终安装版在隔离资料目录通过本机 Qwen2.5-3B-Instruct（Q4_K_M）的真实中文生成、预览和保存。测试稿使用虚构学院设定，响应写到了资料里的墨蓝制服、银线和校徽，最后一次未复述现有上文或下一句的铃声；耗时约 5.5 秒为本机这一次模型推理记录。小模型仍可能偏离细节，例如这次在裙摆也用了银线，所以仍由作者检查预览再应用。实机报告 `.local/expansion-qa-GigUbD/report.json`；较早两次复现的相邻句复述在 `.local/expansion-qa-G39B9K`、`.local/expansion-qa-wAs6iU`。用户的远程 API 尚未配置或测试。
- 正式安装从 0.1.5 更新到 0.1.6。快捷方式指向实际更新后的程序，同一可执行文件用隔离资料目录成功启动到扩写设置页；安装前后正式 `library.sqlite` 的大小及 SHA-256 一致。安装包 SHA-256 `881058f9f62688da1b10f88ca98468bbb76fb77e589c9d6981505f6e71281819`，本机升级回执 `.local/expansion-model/formal-upgrade.json`。

## 0.1.7 DeepSeek 和多套模型配置

- `npm test` 38/38。覆盖旧版密文只读加载、首次变更原子迁移、模型切换与删除、同接口明确沿用 Key、跨接口拒绝复用、思考开关持久化和损坏文件显式重置。用模拟响应验证 DeepSeek 连接测试发送短非思考请求，正式扩写可使用轻度思考并获得更长等待时间和输出额度。参考库回归也通过。
- 设置页隔离实测确认 401/402 失败提示可以与「已保存」状态同时显示。Key 输入用于录入新值，留空表示保留。启用配置选择独立于改稿和参考库。
- Windows 安装版扩写实机 8/8，报告 `.local/expansion-qa-nPsZ5U/report.json`。正式升级时核对 SQLite 和扩写配置文件哈希均一致，实际快捷方式目标隔离启动到 0.1.7。安装包 SHA-256 `9500daa98fe3b824817530ffaaafa6f535408e1e368e45081d8fb429b1705718`，升级回执 `.local/expansion-model/formal-upgrade-0.1.7.json`。
- 正式安装版使用已加密保存的 Key 通过 DeepSeek 官方余额与模型列表的只读检查。原模型 ID 未获确认，新增并启用官方返回的 `deepseek-flash`，磁盘检查确认两套配置均保留且密文一致。正式账号的文本生成未实测。

## 0.1.8 正文原位扩写预览

- `npm test` 38/38。源码版 Electron 扩写回归 12/12，检查了两段候选与完整上下文、等待自动保存后原稿及修订号不变、确认后保存和撤销、恢复原文、重新生成保留资料选择、专注模式 Esc、跨章和正常关窗重启。报告 `.local/expansion-qa-SjcEkl/report.json`。
- 用 450 段合成长章复查自动定位至第 411 段。白纸及夜写纸的方格保留，原本跨过选区的正文标记只在候选两侧显示，候选以独立虚线标出。夜写模式按钮对比度调整后截图复查通过。扩写实测使用本机模拟接口。
- 最终 Windows 隔离安装版的扩写回归 12/12，报告 `.local/expansion-qa-tRlMPF/report.json`。普通写作回归 4/4，覆盖查找替换、并发建章、慢切章和暂存稿导出，记录 `.local/writing-regressions-1KvN8m`。最终安装版长章截图位于 `.local/inline-expansion-visual-IiuY9M`。安装包 SHA-256 `2537ea9b0e7e0a8f69fcfc79ac01e9d43f8206926809b115e53b64d28171e1a8`。
- 正式升级从 0.1.7 到 0.1.8，正常关闭旧版后核对正式 SQLite 和扩写配置文件安装前后哈希一致。桌面快捷方式目标与验收版应用文件哈希一致，隔离启动成功。回执 `.local/expansion-model/formal-upgrade-0.1.8.json`。

## 0.1.9 全局主题、文稿宽度和封面书架

- `npm test` 38/38，源码 Electron 桌面回归 12/12，记录 `.local/desktop-qa-OxInol/report.json`。五套主题分别实点检查主导航、写作工具、设置、参考检索和原文阅读，稿纸选择仍独立，记录 `.local/theme-polish-qa-3Awhyl/theme-validation.json`。
- Windows 最终安装版书架实测通过。原创创建第二部作品、按书名筛选、键盘切回第一部及正文保存正常。参考书架实测原封面解码、无图书名封面、打开指定卷和版本。截图和记录 `.local/polish-bookshelves-fJkbFQ`。另一组参考书架实机覆盖书名筛选、卷册多版本、卡片分页、原文证据跳转、隐藏恢复和返回书架的焦点、滚动位置，记录 `.local/reference-bookshelf-qa-6OJ5GG`。
- 正式库只读盘点 26 部作品，明确标为封面的资源覆盖《叹气的亡灵想隐退》1 部。对 50 份本地非候选 EPUB 的封面元数据另行复核，报告 `.local/reference-cover-audit.json`。
- 最终安装版稿宽和滚动实测 6/6。在窗口内宽 904、1164、1444 像素时，正文宽度依次为 594、806、1069 像素。空章向下滚动 123 像素，滚动条隐藏，专注模式、AI 预览、560 像素上限和旧 800 像素偏好也通过。记录 `.local/manuscript-surface-mTFDJp/report.json`。
- 正式升级期间 SQLite 及 AI 扩写配置文件哈希一致，原桌面快捷方式所指应用文件与验收版一致并通过隔离启动。回执 `.local/expansion-model/formal-upgrade-0.1.9.json`。安装包 SHA-256 `ecbda9cfc8b89e7387d988d01e9bb8b87a12c73dd1056f7103f858f96fff99bb`。

## 0.1.10 独立原文阅读页

- `npm test` 38/38。最终 Windows 隔离安装版确认阅读区占用整个工作区，书架和阅读页默认没有技术段号或版本哈希，正文可调字号、可切换历史版本、Esc 返回原阅读按钮。同时复验真实原封面解码和缺图的简化书名封面。记录 `.local/polish-bookshelves-rwIkaf/report.json`。
- Electron 视觉验证用《西游记》参考包从写作侧栏点击证据，核对整页正文、证据高亮、目录收起与展开样式。截图 `.local/visual-qa-BnrJeh/reader.png` 和 `.local/visual-qa-BnrJeh/reader-toc.png`。安装包 SHA-256 `de5616693b869d835b3de8e00400ec5fac56e6060fce9e26c004cb80e90fe639`。
- 源码桌面验收 13/13，页面错误为 0。验证插图实际解码、注释往返、跨页目录、证据高亮、返回原写作选区和侧栏会话。测试包含独立技术标识，默认正文隐藏，内部段落锚点仍能定位。记录 `.local/desktop-qa-JhRXX4/report.json`。
- 正式安装由 0.1.9 升级到 0.1.10，升级期间正式 SQLite 及 AI 扩写配置文件哈希一致。原桌面快捷方式所指应用文件与验收版相同并通过隔离启动。回执 `.local/expansion-model/formal-upgrade-0.1.10.json`。

## 0.1.11 独立原创书架和宽版参考检索

- 自动测试 38/38。源码写作工作流 13/13，验证启动先见书架、两书切换、返回前保存、同书再开及重启后光标和滚动复原。源码桌面 13/13，含保存故障强退后从书架恢复暂存稿。记录 `.local/writing-workflow-jCQ2b6/report.json` 与 `.local/desktop-qa-g8Ncyt/report.json`。常规写作回归 4/4，原位扩写 12/12，记录 `.local/writing-regressions-dFT0UD` 与 `.local/expansion-qa-g3m1zY/report.json`。
- 参考区隔离 Electron 对照中，宽窗对话区由 810×713 增至 1149×772 像素，消息区多 68 像素，窄窗消息区多 60 像素。检索和书架控件置于同一顶栏，切换后消息保留。记录 `.local/reference-room-2eqaHs/report.json`。实机截图见 `.local/visual-qa-tZamlf`。
- 最终 Windows 隔离安装版确认返回书架后的键盘焦点、同书撤销记录和正文均保留，470 像素宽的写作区顶部按钮未溢出。独立参考对话宽窗 1168 像素、窄窗 655 像素，输入完整可见，书架切换后保留未提交问题。报告 `.local/shelf-layout-qa-dfaQLs/report.json`。安装包 SHA-256 `729e58ceda552fef05cdf57a054d9d2ff0c0f170617bcce660b753f2ec86553b`。
- 正式安装由 0.1.10 升级到 0.1.11，SQLite 与扩写配置文件安装前后哈希一致，原快捷方式目标与验收版相同并通过隔离启动。回执 `.local/expansion-model/formal-upgrade-0.1.11.json`。

## 0.1.12 书架比例和交接

- 原创书架封面由 2:3 改为 5:6。底部书名支持两行，完整标题可悬停查看。隔离 Electron 测试 1420 与 900 像素宽窗，覆盖中英书名、筛选、键盘开书、返回及继续写作。报告和截图 `.local/shelf-proportion-zQKh4x`。最终安装版通过冒烟与完整视觉流程，截图 `.local/visual-qa-4lTOBj`。
- 正式程序由 0.1.11 升级到 0.1.12，SQLite、扩写配置和语义模型配置的安装前后摘要一致。桌面快捷方式目标通过隔离启动，随后正式窗口重新打开。回执 `.local/formal-upgrade-0.1.12.json`。安装器 SHA-256 `ce9158d1213ea73bcac30b464eb74691b95b5c7ff35c8026d8bbc2f324da9a46`。
- 从源码 ZIP 解压到干净目录，验证 `npm ci --prefer-offline`、使用带摘要的 Electron ZIP 执行 `npm run setup:electron`、`npm run build`、`npm start` 和 `qa-visual.mjs`。开发入口生成独立的 `.local/dev-profile/library.sqlite`，视觉验收使用随包公版《西遊記》。实测目录 `.local/takeover-qa-577b606eec`。
- 0.1.12 隔离安装实际使用本地 Qwen3，在公版样例命中水簾洞并打开证据。查询记录为关键词通道 4、语义通道 1，单次 125 毫秒。报告 `.local/installed-model-qa-NAeeFi/report.json`。依赖审计的两项告警列在 [当前交接](../HANDOFF.md)。

## 0.1.13 待拆书交接和 Windows 图标

- 从已下载的项目档案复制 63 个原文件。长度与 SHA-256 核验 63/63，EPUB 容器 CRC 核验、相对文档链接核验均通过。附 256 条正式库卷版本对照，42 份历史空卡草稿用交接工具重打包后均通过独立规则校验。实际本机目录为 `待拆书交接`。
- `npm test` 38/38。隔离安装和冒烟成功。Windows 从安装器、应用 EXE 和卸载器提取的 32 像素图标 SHA-256 均为 `8d48a41ae24c3e83b03ac8d3854ed08fc1cdc4942446f26e6a9f93d6af3da198`。
- 正式从 0.1.12 升级至 0.1.13，资料文件摘要核对通过。快捷方式使用正式目录中的新 ICO，目标启动验证通过。回执 `.local/formal-upgrade-0.1.13.json`。安装器 SHA-256 `24a159312abf58e3cd85ed0eb1553054e9f1f20eac57be3dee1df2312059ee37`。

## 0.1.14 黑白笔尖与知识卡首批整改

- `npm test` 通过 38 项。`npm run package:windows` 生成 Windows 安装器。使用隔离安装和真实 Electron 运行 `qa-installed-smoke.mjs`、`qa-desktop.mjs`，通过写作、资料、导入、原文定位、备份和重启回归。桌面验收目录为 `.local/desktop-qa-DCJ9Fe`。
- 16–256 像素共九帧 ICO。检查安装器、应用 EXE、卸载器提取的 32 像素图标，三者摘要相同。正式从 0.1.13 升级到 0.1.14，安装过程中资料校验一致，快捷方式目标通过隔离启动。回执 `.local/formal-upgrade-0.1.14.json`。
- 全库机器盘点 26 部、256 卷、9,564 张旧卡和 17,701 条证据，九类各抽查了实际原文。基线见[原状审计](knowledge-card-baseline-20261110.md)。标题、类型、信息密度和证据支持关系按[新标准](../拆书规范包/知识卡质检与返工.md)复查。
- 首批 156 张，包括修订旧卡 145 张、新增 11 张，共 980 处新旧证据落点，覆盖 26 部及九类。整卷返工《魔女与佣兵》和《谁杀了勇者》各自第一卷的全部旧卡，其余卷册按重点卡返工。《谁杀了勇者》后两卷仍在待办。
- 隔离库使用正式安装版和实际本地 Qwen3。30 道问题的目标卡均进前三，验证九类卡、完整卡片、编号和阅读高亮。初测「友崎文也的成长」未命中主线卡，补充全名与检索别名后原题复测第 1。隔离复跑 156 张均幂等。修订号大于 1 的真实旧卡反例被拒。报告 `.local/card-remediation-0114/release-targeted-qa.json`。
- 规范包、源码和待拆交接的质检说明及筛查脚本逐字节一致。样例可读，越界的正文证据编号被筛查工具拒绝。NKS draft-0.1 Schema 保持兼容。
- 正式库应用 156 张，复跑全数无变化。Qwen3 重建 156 条向量，四道抽查题均排第 1 并通过证据定位。正式库完整性与外键检查通过，1,034,187 个正文块、240 个资源、原创与 11 张受保护旧卡一致。当前 9,575 张卡、18,367 条证据、9,575 条向量。报告及整改前备份在 `.local/card-remediation-0114`。

## 0.1.14 既有知识卡续审

- `checkpoint-005` 实读复查 676 张旧卡，631 张写入正式库，34 张核对后保留，11 张受保护的旧卡完成核证并保持现有版本。原卡 ID 沿用。六张修订同时改正类别。此次没有新书或新卡。逐卡台账、批次补丁和正式库写入前备份在 `.local/card-remediation-next`。
- `npm test` 通过 38/38。隔离应用和正式库完整性、外键、正文、资源、原创、未选中旧卡及引用范围逐项对照通过。正式 631 条改稿的关键字索引存在，重跑补丁 631 条均跳过。Qwen3 在隔离库生成 631 条新向量，按模型、版本、正文、别名和索引文本核对后复用，正式库复验需重建 0 条。
- 正式安装版在隔离资料目录完成九类共 15 道题，14 道排第一、1 道排第二，59 处证据打开正确版本并高亮。界面实测从参考筛选打开完整地点卡，再点击证据进入阅读页。正式库再跑同题，排名一致。应用已由桌面快捷方式重新启动。结果见 `.local/card-remediation-next/stage-002/installed-005.json` 及同批 `formal-search`、`formal-compare` 报告。
- `checkpoint-008` 续写 417 张。写入前后对照 9,158 张未选中卡及其引用，其中 787 张为已有较高修订，正文、资源和原创表一致。应用后累计 1,048 张补丁全数幂等，正式复验需重建 0 条向量。
- `checkpoint-008` 的安装版和正式库分别复跑九类共 19 道题，18 道排第一，1 道排第二。安装版打开 71 个正确版本的证据范围并高亮，从参考界面打开完整地点卡再进入阅读页。报告在 `.local/card-remediation-next/stage-008/installed.json` 和 `checkpoint-008-formal-search.json`，正式应用已从快捷方式启动。
- 此检查点正式库为 9,575 张卡、19,602 条证据、9,575 条向量，余 8,320 张旧卡待逐卡验收。待处置的后记署名卡计入待验收。[整改记录与续做范围](knowledge-card-remediation.md#续批正式记录)

### 续批 checkpoint-015 与 checkpoint-017

- `checkpoint-015` 写入 648 张增量修订。累计补丁 1,696 张复跑均幂等。正式与安装版 23 道题目标均在前二，安装版检查 84 个证据范围。此时正式库有 20,259 条证据。
- `checkpoint-017` 再写入 265 张修订。累计补丁 1,961 张复跑均幂等。实际安装版和正式库分别运行 29 道跨九类查询，28 道目标卡第 1，1 道第 2。安装版验证 98 个原文跳转范围、完整卡与高亮。对照写入前备份，9,310 张未选中卡及其引用、原创表、1,034,187 个正文块、240 个资源和 256 个正文版本一致。
- `checkpoint-017` 正式库有 9,575 张卡、20,467 条证据和 9,575 条向量。计入首批共完成 2,162 张旧卡，余 7,402 张待处理，其中一张后记已核出证据不足，待归档。安装版已由桌面快捷方式重新启动。回归 `npm test` 38/38。报告位于 `.local/card-remediation-next` 的 `checkpoint-017-formal-compare.json`、`checkpoint-017-formal-search.json` 和 `stage-014/checkpoint-017-installed.json`。[逐卡与卷次记录](knowledge-card-remediation.md#续批正式记录)

### 续批 checkpoint-018

- 新写入 226 张，累计补丁 2,187 张复跑均幂等。正式与实际安装版各跑 34 道真实 Qwen3 查询，33 道目标卡第 1，1 道第 2，安装版检查 113 个证据范围。9,349 张未选中卡和证据、原创表、1,034,187 个正文块、240 个资源、256 个版本与写入前快照一致。
- 《转生公主》全九卷和《暗杀者》全八卷完成。《暗杀者》原待处置的 #6294 以卷首、卷末正文补足证据并归写作技巧。正式库 9,575 张卡、20,633 条证据和 9,575 条向量，余 7,176 张旧卡待处理。报告位于 `.local/card-remediation-next` 的 `checkpoint-018-formal-compare.json`、`checkpoint-018-formal-search.json` 和 `stage-014/checkpoint-018-installed.json`。

### 续批 checkpoint-021

- 写入 250 张新改稿及 3 张纯改类，共触及 253 张。与正式写入前备份对照，三张已有改稿只改变类别和修订号，9,322 张未选中卡及其引用、原创表、正文和资源一致。累计补丁 2,437 张复跑均幂等。
- 隔离早稿被修订保护拦截后，从正式检查点对应的隔离备份重新构建，并核验复用 2,293 条与当前卡面匹配的向量。剩余 144 张用 Qwen3 生成向量。正式与安装版各跑 40 道查询，39 道目标卡第 1，1 道第 2，安装版检查 134 个原文范围。正式库 9,575 张卡、20,841 条证据和 9,575 条向量，余 6,926 张旧卡。
- 回归 `npm test` 39/39。新增保护测试覆盖标题、证据、别名差异和第三版手改，拒绝不符合已核卡面的改类。报告位于 `.local/card-remediation-next` 的 `checkpoint-021-formal-compare.json`、`checkpoint-021-formal-search.json` 和 `stage-021/checkpoint-021-installed.json`。

## 0.1.15 参考书目封存与批次收尾

- 安装器隔离安装并实际启动，正式升级后核对桌面快捷方式、程序版本和资料摘要。隔离演练封存、恢复一部并搜回原卡，再次封存后检索为零。完整演练报告为 `.local/card-remediation-next/archive-qa-022/installed.json`。
- `checkpoint-025` 以实装 0.1.15、隔离资料库和真实 Qwen3 复验 50 道查询及 171 处原文证据，另点开完整卡与正文高亮。正式写入 435 张，重跑无变化，非本批卡、原创、版本、资源与正文逐项比较通过。
- 正式封存 12 部、150 卷、5,796 张卡。备份通过 SQLite 完整性检查，正式库复验中只有目标书目的封存标记变化，1,034,187 个正文块、240 个资源、256 个版本、9,575 张卡、21,391 条证据及 9,575 条语义向量一致，原创表与关键词索引一致。
- 用最终正式资料的只读备份在安装版逐部检查，12 个封存书目在限书及全库检索中均被过滤。日常书架显示 14 部，封存入口显示 12 部。继续对仍在用的作品验证 50 道，48 道第 1，2 道第 2，均可跳回原文。报告见 `.local/card-remediation-next/archive-final-20261110/formal-compare.json`、`.local/card-remediation-next/archive-final-20261110/installed-final.json` 和 `.local/card-remediation-next/archive-final-20261110/search-final.json`。

### 接管材料复验

- 从封存后隔离副本只读提取 26 部的参考卡对照。对照 `checkpoint-025` 逐卡核对 ID、修订号、类别和标题，覆盖 9,575 张参考卡与 21,391 处证据。包内仅包含按作品拆分的参考卡 JSON。对照 256 卷历史快照内包的 SHA-256、在库卷 ID、正文版本和段落数，256 卷全部一致。
- 从交接目录实际运行 `python -X utf8 工具/prepare-reference-input.py`，分别准备《绝对神境》重拆及《叹气的亡灵想隐退》续审输入。两份基线 ZIP 经交接校验器通过，续审对照仍列 45 张待核。后者解包再打包后，13 卷、621 张基线卡和 240 项资源通过校验。重复指定已有输出目录时拒绝覆盖。
- `python -X utf8 工具/check-sources.py` 核对 63 份原文通过，标准样例离线校验通过，`npm test` 通过 39/39。本次更新交接资料和源码包，正式安装器及正式库未写入。

## 知识卡归档与清空

2026-11-10，应用 0.1.15。用户要求为重构清空知识库，保留 EPUB／TXT 和已入库原文。归档位于 `D:\Vibe Coding\Novel Studio 知识库归档\2026-11-10-清空前`，`knowledge-cards.sqlite` 的 SHA-256 为 `26e3c678eb44714935cd4eff68451d376320b0151077c9f1a5d8dbb1579a4793`。归档包含 9,575 张卡、21,391 条证据坐标、9,575 条关键词索引和 9,575 条向量。

- 使用 Node.js 24.16.0 运行 `node --disable-warning=ExperimentalWarning $helper snapshot $live $testLibrary` 制作一致的隔离副本。随后执行 `node --disable-warning=ExperimentalWarning $helper archive $testLibrary $archiveFile`，逐表比对所有归档记录。
- 在隔离副本上使用同一脚本执行 `clear` 和 `restore`。两次均通过 SQLite `quick_check`、外键校验和原文及原创表的逐行摘要比对。`node --disable-warning=ExperimentalWarning $qa $exe $testDir $archiveFile empty` 在安装版确认 26 部均无卡、全库和限书检索无结果、书架可打开原文。用 `restored` 重跑，验证恢复的卡可检索且证据指向原段落。隔离启动显式设置 `NOVEL_STUDIO_DATA_DIR`，检索验证使用关键词，向量逐行比对。
- 正式应用正常保存退出后执行 `node --disable-warning=ExperimentalWarning $helper clear $live $archiveFile`。事务内核对归档与正式旧卡逐行一致，再清空四张卡片及索引表。原文及原创表逐行摘要一致，保留 26 部、256 卷、1,034,187 个正文块、240 项资源和 273 条导入记录。扩写及语义模型配置摘要一致。应用从桌面快捷方式重新打开后，只读查询确认四张表仍为 0 行。
- `$helper` 为归档目录中的 `reference-cards.mjs`。`$qa` 和各步回执保存在 `.local/reference-card-reset-20261110`。恢复旧卡先按归档目录的 `README.md` 在隔离副本执行 `restore`。重构范围及新卡结构待用户指定。

## 独立拆书交接包 v1.0

2026-11-10，归档原 `拆书规范包`、`待拆书交接` 及 v0.3 规范 ZIP 到旧知识库同层的 `拆书交接旧版`。12 个规范目录文件和 198 个交接目录文件迁移前后逐项核对 SHA-256，旧交接内 63 份 EPUB／TXT 副本随目录保留。候选区可见 53 份原始文件。正式库只读 `list` 返回 26 部、256 卷。

- 交付 `release/NovelStudio-拆书交接包-v1.0.zip` 与独立提示词 `release/拆书Agent提示词-v1.0.md`。交接 ZIP 校验 CRC、包内相对链接和嵌入规范文件摘要。用 `node scripts/package-spec.mjs` 生成 v0.4 规范 ZIP。各交付件摘要见 `release/NovelStudio-拆书交接包-v1.0-SHA256.txt`。
- 在项目外临时目录解压，用 `python -B -X utf8 拆书规范包/tools/convert.py` 转换自创 TXT，`node 工具/校验器/validate-result.mjs` 校验草稿和样例，`python -B -X utf8 工具/pack-result.py` 重打包样例，再用校验器和 `python -B -X utf8 拆书规范包/tools/review-cards.py` 核对。结构校验通过，内容筛查给出样例的短卡、证据编号和单处证据提示。
- 在合成 SQLite 库运行 `node --disable-warning=ExperimentalWarning scripts/export-reference-input.mjs export $library $workId $out $volumeIdAtRevision`。导出保持作品、卷、正文版本、6 段内容、目录、插图与注释，结果包通过应用端校验。导出测试覆盖源库含原创与参考卡的情形，产物仅含选定的参考正文与资源。
- `npm test` 39/39，`python -B -X utf8 -m unittest discover -s 拆书规范包/tools/tests -v` 10/10。Schema 仍为 `draft-0.1`。本轮验证使用自创材料，真实作品拆书由用户指派的 Agent 完成。报告见 `.local/handoff-refresh-20261110`。

## 桌面全量原文派工目录

2026-11-10，按全部现有原文重拆的范围，将交接 ZIP、提示词和原文副本集中到 `C:\Users\78828\Desktop\Novel Studio 拆书派工`。用 `python -B -X utf8 .local/dispatch-all-20261110/prepare.py $desktop` 从项目参考原文目录、旧交接归档和公版来源整理 185 个来源路径。按文件 SHA-256 合并完全相同的副本，得到 99 份 EPUB 和 16 份 TXT。不同内容均保留，逐份比对摘要并对 EPUB 检查 CRC。

通过 `scripts/export-reference-input.mjs` 对正式资料库只读导出，配合 `工具/pack-result.py` 按书打包 26 部、256 卷及 1,034,187 个正文块。每卷复核卷 ID、正文版本及段数，所有同版原文 ZIP 通过 `工具/校验器/validate-result.mjs` 并确认卡片为空。交接 ZIP 和提示词的桌面副本摘要与发布文件一致。桌面目录附 `先看这里.md`、`原文目录.md` 和 `来源与校验.json`。过程回执见 `.local/dispatch-all-20261110`。

## 原封面保留与新书导入

- 只读核对当前 26 部正式参考作品和派工目录中的 99 份 EPUB，已入库作品中仅《叹气的亡灵想隐退》带封面。为后续原档补充[封面保留要求](../待拆书交接/工具/README.md#保留原封面)。桌面和发布目录的交接 ZIP、提示词及对应摘要已同步更新。
- 用带卷首封面节点的自创标准结果 ZIP 在空的内存库走导入校验与确认。新增一部、一卷和一张卡，书架查询返回 PNG 封面。封存后以相同作品 ID 再导入，合并到原作品并保留封存状态。独立 `validate-result.mjs` 校验通过。回执在 `.local/cover-handoff-20261110`。



## 完整交付提示词加强（2026-11-11 用户最新要求）

已入库内容本轮暂不修改。生产端执行 [完整交付与内容自检](../拆书规范包/完整交付与内容自检.md)：逐项回读主张与同版证据，核对主语、时间、动机、条件和例外，防止信息拼接、过度概括及引用错位。全部派工范围连续完成后一次提交最终包，不交阶段稿；内部检查点可保留，真实阻碍如实登记。接收端仍只验格式、标签和导入安全，不因此自动扩大内容验收。

通用提示词、独立交接包、通用规范包、共享派工副本及15本未完成任务提示词已更新，已完成10本提示词不变。在跑3路不强制重启或替换正在读取的输入；队列以pendingBundleSha256登记新版，启动脚本在下次安全启动/接续前同步交接ZIP与工具文档。保留已接收卡ID、基线包及cardRevisions，不以本轮提示词更新覆写正式卡片。

`book-agent-prompt.mjs`按实际模型注入用户指定DeepSeek原句，其他模型及免费Hy3回退不注入。真实额度、用户叫停、目录权限与三并发规则继续有效。worker自动接续reading/writing/validating/partial等未完状态；最多20回合的异常保护仍保留，达到保护或真实阻碍时标needs_attention，不能把未完稿当成待验收最终稿。定时接续沿用原任务，不重派同书。已有阶段接收记录仅作历史，此后未完成稿不再阶段入库。

既有heartbeat novel-studio已更新上述要求，保留30分钟首检和原通知设置。本轮不启动新CodeBuddy请求、不持续监督。


验证命令：`node --test tests/book-agent-prompt.test.mjs`（3项通过）；`node --check scripts/book-agent-worker.mjs`；`node --check scripts/prepare-book-dispatch.mjs`；PowerShell Parser静态解析start-book-agents.ps1无错误。覆盖DeepSeek原句只注入一次、免费Hy3不携带专属段落及未完成状态不进入验收。未为提示词测试调用真实模型或读写正式库。执行 `node scripts/package-spec.mjs`、`node scripts/package-source.mjs` 重打规范/源码；交接ZIP及摘要重建并做CRC、镜像内容和SHA-256一致性检查，报告 `.local/prompt-strengthening-20261111/verification.json`。应用与协议仍为0.1.19及draft-0.1，安装器保持原摘要。


## 2026-11-11 13:10 定时处理：两书通过简验，正式导入延后

《骑士＆魔法》62卡、《转生成蜘蛛又怎样！》54卡通过格式、分组标签及同版正文/目录/资源身份核对，无协议警告；未深审内容。骑士保留已入库46卡的原状，撤回交付包对其中1卡的改动，仅待新增16卡；蜘蛛只给现有标签补列表前缀，不改变标签词。原包、修订包ID和SHA-256见 `.local/dispatch-cycle-20261111-1310/receiver-fixes.json` 与 `format-review.json`，已在书目录和共享派工原文旁标明验收通过、待正式导入。

实际运行 `pwsh -NoProfile -File scripts/scan-book-reviews.ps1`、`node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1310/review.mjs`。运行 `node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/dispatch-cycle-20261111-1310` 时，外部进程检查发现正式程序4个进程，在打开数据库和备份前主动停止，未强退、未导入、未改现卡；不能把本轮标为已入库。下次程序空闲时复核包SHA，执行备份、隔离演练、正式导入及索引。队列 awaiting_import 及 reviewReport 保存此断点，同SHA不重复简验；当前正式库计数仍沿用上次910卡，本次未读取数据库重计。

亡灵仍为partial，未验收入库；保留原会话和所有施工成果，使用最新完整交付要求继续。运行 `pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3`：恢复亡灵，并新派食锈末世录、败北女角太多了；三路均已核实worker及CLI存活、状态running，已加载新版输入与提示词。全局仍三并发，无子代理。heartbeat novel-studio保持30分钟，补充awaiting_import接收断点；派发后结束本轮，不持续监督。

整书正式完成仍10部，另2部已交最终包且通过简验待导入；3部施工中，10部未派发。应用仍0.1.19，正式资料未修改。文档更新后执行 `node scripts/package-source.mjs` 并重做源码摘要，安装器及规范包摘要保持不变。


## 2026-11-11 13:40 定时处理

`node scripts/book-dispatch-status.mjs`、`pwsh -NoProfile -File scripts/scan-book-reviews.ps1` 后，对新包运行 `node --disable-warning=ExperimentalWarning .local/dispatch-cycle-20261111-1340/review.mjs`：《食锈末世录》66卡／6卷通过受限Markdown、分组标签、协议及同版正文/结构/资源核对，无警告；未审内容语义。package_id `cc95fb11-2269-5430-8865-1fa746357f03`，SHA-256 `cf61de9091566fa0676cd7063ce3b1534385546ec465eb9d54ff58df68c9b546`。既有两份已验收同SHA包未重复验收。正式程序仍4个进程，三书均awaiting_import；未打开或写正式库，当前沿用910卡历史计数。待空闲后按各job.reviewReport汇总未导入包，再备份、隔离、正式提交、索引及publish。

亡灵旧会话实际usage约915900/1000000，上次20回合保护结束仍partial；败北旧会话约916896/1000000，停在读取本会话CLI工具返回缓存（目录越界被权限门拒绝，并非用户叫停）。只复制该会话tool-results具体文件到本书施工输出/工作，未扩大目录权限或访问其他会话/凭证。保留旧状态及previousSessionId，两路旧worker结束后在本书现有笔记/进度/检查点上串行换新CLI会话继续，不手动压缩、不派子代理、不交阶段稿；追加分块读取约200段说明，避免整套文本塞入上下文。新派《我们不可能成为恋人》，使用新版三件套，`pwsh -NoProfile -File scripts/start-book-agents.ps1 -Count 3`仍只三路。实际启动后状态见本轮dispatched-status.json。定时维持30分钟，派发后结束本轮，不持续监督。

累计本队列正式完成10部，3部已通过简验待导入，3部施工中，9部未派发。同步各书验收状态、原文旁标记和共享原文目录，资料原状不变；本轮审计在 `.local/dispatch-cycle-20261111-1340`。更新文档后执行 `node scripts/package-source.mjs`，重做源码SHA-256及CRC验证；应用仍0.1.19，安装器、规范包不变。


## 2026-11-11 16:04 用户主动验收（不派工）

用户授权本次验收，明确验收后不自动派工；定时轮转保持PAUSED，queue.automationPaused=true。本次未调用start-book-agents.ps1、未恢复/新建任何CodeBuddy会话。

- 骑士＆魔法（中译版）：62卡／11卷，package_id `3f524d51-effd-46e1-83d8-46aa1492080d`，SHA-256 `3db9b99ac9201abf27e4752fc8e98da605c5623316a7527d12078a712e3c89ec`。
- 转生成蜘蛛又怎样！（中译版）：54卡／16卷，package_id `e825fd49-1f39-49e0-af77-a98db04e9273`，SHA-256 `170a76fc90c517b40da2ca4e631d497c4d842d15440aebe38addd13f728d1d77`。
- 食锈末世录（中译版）：66卡／6卷，package_id `cc95fb11-2269-5430-8865-1fa746357f03`，SHA-256 `cf61de9091566fa0676cd7063ce3b1534385546ec465eb9d54ff58df68c9b546`。
- 我们不可能成为恋人！绝对不行。(※似乎可行？)（我怎么可能成为你的恋人，不行不行！）（中译版）：47卡／8卷，package_id `4ad84b5f-d033-5e8a-9fcd-d6e4cccd87b6`，SHA-256 `bfa15d5e1e320030b850034bf5a10993131359541edf7571f5ce4ccb921acb9a`。

前三份历史已验收包以SHA-256跳过重复格式审查；新《我们不可能成为恋人》47卡受限Markdown与分组标签通过，无协议警告，正文/目录/资源与同版输入完全一致；power_system按交付声明absent。原Agent研究回执包含旧摘要，接收方回执绑定现有最终ZIP实际摘要，不改卡片或正文。验收范围未扩大到内容、标签语义、证据语义或全文质量。

《亡灵》新138卡包格式与分组标签通过，但phase仍partial且ZIP为66,921,188字节，超过32MiB，不作为完整交付入库；保留原包，登记待返工，不自动接续或派工。《败北》没有结果包，无法验收。接收判定及SHA-256见 `.local/manual-review-20261111-1604/incomplete-deliveries.json`。

实际命令：`pwsh -NoProfile -File scripts/scan-book-reviews.ps1`、`node --disable-warning=ExperimentalWarning .local/manual-review-20261111-1604/review.mjs`、`node .local/manual-review-20261111-1604/check-partial.mjs`。四包汇总format-review.json核对历史SHA后运行 `node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/manual-review-20261111-1604`：正式程序0进程，先一致备份、隔离导入演练与重复包验证，再正式提交。新增183卡、更新0卡，正文版本新增0；既有卡内容保持接收基线原状，原创、正文、目录、资源、封存与非本批卡证据摘要不变，SQLite完整性与外键通过。备份 `D:\Vibe Coding\Novel Studio\.local\manual-review-20261111-1604\before-import.zip`，SHA-256 `13e74ac231d80cb22dd0d49523cde17421b8543786fe8f4f2058bf9daa4aecf4`。

`node --disable-warning=ExperimentalWarning .local/manual-review-20261111-1604/index.mjs`：当前1093卡向量就绪。首轮生产检索默认排除封存作品，只新增70条向量，计数断言发现尚缺113条；保存首轮报告后，本次离线脚本使用生产索引实现的副本，仅放宽封存筛选，补齐封存卡索引并核对封存状态与导入前完全一致，没有解除封存或修改应用源码。`python -B -X utf8 .local/manual-review-20261111-1604/publish.py`同步四书验收状态、正式导入回执、派工原文旁标记、共享原文目录和队列，旧记录保留。当前队列整书完成14/25部，另两本未完成停顿、9本未派发；原先公女和暗杀者不重复计入25部队列。

本次工作完成即结束，不续派；待用户另行指定。更新HANDOFF及相关记录后运行 `node scripts/package-source.mjs` 并重做源码摘要、验证ZIP CRC与打包文档内容；应用仍0.1.19，安装器及规范包摘要不变。


## 2026-11-11 反重力两书派发（用户最新指令）

本次范围只含《叹气的亡灵想隐退》《败北女角太多了！》，其余9本不动。用户要求派发成功后结束，等其明确叫验收再验收；不恢复novel-studio定时轮转。已停止的CodeBuddy会话状态及旧提示词保存在 `.local/antigravity-two-books-20261111`，原文、已有核读笔记、138卡阶段包及已入库45卡基线保留。正式资料与已完成书目未修改。

本机CLI `C:/Users/78828/AppData/Local/agy/bin/agy.exe`，ACP版本1.5.5；`agy models`确有gemini-3.8-flash-low。两路通过ACP设置model为Gemini 3.8 Flash、thought_level为low并核对回执后发送任务。仅本书目录施工，输入只读，带CLI sandbox，按本次本书工具请求逐次授权，禁派子代理/团队、父项目/其他书/正式库与CLI凭证目录访问；不手动压缩。派发worker和日志/任务回执保存在上述审计目录及各书运行记录，不调用CodeBuddy启动脚本。

已核实两路state=running、sessionId与promptSha256就绪，见 `dispatch-receipt.json`；稍后结束/错误留存待用户下一次指示，不自行轮询验收或补派。实际命令：`agy --help`、`agy models`、`agy acp --help`、`agy --model gemini-3.8-flash-low --effort low --output-format json --print /usage`；后者为内置命令，num_turns=0、输入/输出tokens=0。通过Start-Process -WindowStyle Hidden启动本次两个Node ACP worker。

最终派发前额度基线保存 `quota-before.json`：Gemini五小时剩余98.993331%，周剩余99.415237%；重置时间分别2026-11-11T13:15:35Z、2026-11-18T08:15:35Z（UTC）。首次探测口头读数更早，不取代落盘的最终基线；两次零token查询间额度已变化，可能有共享账户其他使用或统计延迟，后续需区分账户额度变化与本批可归因消耗。等用户叫验收时再保存 /usage 结束值，以相同bucket与reset_time比较百分点；跨窗口重置不能简单相减。额度按Gemini模型组共享，不把token数冒充百分比，不伪称精确单任务归因。

更新文档后重做源码包及摘要。应用仍0.1.19，协议draft-0.1，安装器及通用规范包不变。定时任务继续PAUSED。


## 2026-11-11 17:26 反重力两书主动验收（不派工）

只处理用户指定的亡灵、败北两书。`node scripts/book-dispatch-status.mjs`及`pwsh -NoProfile -File scripts/scan-book-reviews.ps1`后，运行 `node --disable-warning=ExperimentalWarning .local/antigravity-review-20261111-1726/review.mjs`：《败北女角太多了》60卡／8卷受限Markdown、分组标签、协议及同版正文/目录/资源核对通过，无警告。power_system按absent声明，不强行补卡。package_id `aceb0c0a-09b5-54a6-ae8a-57ef09a48ec5`，SHA-256 `3e6e9600f7213fa0a66f17068fd5b908c7578e6a279b27c726cfec238edaabd2`。Agent旧摘要由接收方实际摘要回执接续，不改卡片内容。未深审内容、引用语义、全文质量或标签语义。

《亡灵》交付目录仍为旧138卡阶段包，SHA-256 `f9618c5b5bde5dfb911ffc3b06e46d24459c9cc0ce7ffabb65ec1789c7e7cde3`，与已判定包相同，未重复验收。反重力内部施工JSON现151卡，任务停在删除本书result-test.zip的权限拒绝，未更新根进度及正式交付；不能把内部稿直接标整书完成。用户追问是否剩得少、少量可由接收方收尾：统计最新processed_ranges合并区间，60215段中登记39094段，未登记21121段（35.1%），集中第8—13卷。台账仍声明未逐段覆盖，无法判定仅剩包装回执；这不是内容质量深审，不能虚填完成或代做大规模核读。范围统计见remaining-scope.json。本次保留新旧所有成果，未阶段入库、未自动补打包冒充完整交付、未启动返工或接续会话。详情 `unfinished.json`，内部JSON摘要 `74a45a73c8ca23ef710c749619f6d39fc7c0ab8087f7c8e5b6bea7d9ff2e2c0f`。

正式程序0进程后运行 `node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/antigravity-review-20261111-1726`：先一致备份与隔离演练，再正式导入败北，新增60卡、既有卡更新0、正文版本新增0，重复包duplicate，SQLite完整性及外键通过；原创、正文、目录、资源、封存及非本批卡证据摘要不变。备份 `D:\Vibe Coding\Novel Studio\.local\antigravity-review-20261111-1726\before-import.zip`，SHA-256 `c2d1b9953328c2803b026d1fdab9990d5c7d5c873097abf555e67f3f47494aa1`。`node --disable-warning=ExperimentalWarning .local/antigravity-review-20261111-1726/index.mjs`沿用上次离线全状态索引副本，不改封存，现1153卡与向量就绪。`python -B -X utf8 .local/antigravity-review-20261111-1726/publish.py`同步验收状态、正式回执、共享及实际派工原文标记和队列。

验收结束执行 `agy --model gemini-3.8-flash-low --effort low --output-format json --print /usage`，零模型turn查询保存在 `quota-after.json`。Gemini五小时额度剩余从98.993331%到94.938809%，下降4.054523个百分点；周额度从99.415237%到97.839659%，下降1.575577个百分点，两bucket重置时刻未变。额度按Gemini模型组共享，上述为账户变化，可能包含同期其他使用/延迟结算，不宣称精确单任务账单。两本ACP会话记录汇总inputTokens=607997, outputTokens=49249, cachedReadTokens=7133033, thoughtTokens=0, totalTokens=7790279；缓存token不能当作同价新输入或额度百分比。比较及逐会话原始用量见 `quota-comparison.json`。

本队列整书完成15/25部，剩亡灵1部待继续及9部未派发。定时任务保持PAUSED，queue.automationPaused=true；本次未新建模型会话、未调用启动脚本、未补派。应用仍0.1.19，协议draft-0.1；更新文档后执行 `node scripts/package-source.mjs`，重算源码摘要并核对CRC，安装器及规范包摘要不变。


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


## 2026-11-11 21:30 亡灵完整包简验与正式入库

用户主动要求验收，不自动补派或恢复定时。已运行 `node scripts/book-dispatch-status.mjs` 和 `pwsh -NoProfile -File scripts/scan-book-reviews.ps1`，旧138卡同SHA阶段包按历史判定跳过。新完整原包144卡、13卷、240资源，Agent进度completed、交付回执声明原任务完成，processed_ranges登记60215/60215段；接收方只核对登记一致性，不深审实际阅读全文、内容、证据语义或标签质量。

原包ID `1b6d0df6-65f1-5762-8fe8-732d196fbb9a`，SHA-256 `c0a74432c6735577cf3ca9bd809c79d7e0acc61f1ac9529fbb8a15b9585ff4ea`，仍含上一阶段report.issues的138卡/未通读旧说明，回执记录旧摘要。接收方保留原ZIP和原report问题清单，仅同步过时交付元数据，未改卡片、正文、结构和240项资源。修订包 `D:\Vibe Coding\Novel Studio\拆书工作区\本地知识库拆书\叹气的亡灵想隐退\施工输出\交付\result-完整版-接收修订-20261111-2130.zip`，package_id `580fc368-32bb-4d99-91e4-e01a0ecde683`，SHA-256 `71ae1bc36ca89f3d7980e1964b7893f534c2a8ba367880e99f04bbcf9784bd97`；对当前包执行 `node --disable-warning=ExperimentalWarning .local/antigravity-review-20261111-2130/review.mjs`：144卡受限Markdown、九类分组标签、协议及同版正文/结构/资源一致，无警告；基线45卡逐项保持原状（baseline-retention.json）。原包和修订包SHA及原问题清单留在审计目录，不拿接收简验冒充内容质量复核。

`node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs .local/antigravity-review-20261111-2130`：正式程序0进程时一致备份，隔离演练与重导duplicate通过后正式提交，新增99卡、更新0卡、跳过45张原卡、正文版本新增0；原创、正文、结构、资源、封存和非本书卡证据摘要不变，SQLite完整性及外键通过。备份 `D:\Vibe Coding\Novel Studio\.local\antigravity-review-20261111-2130\before-import.zip`，SHA-256 `a3c8a3ffac8bdee03e0710b9df1bf9e766918e9f86add9ed7a9a1d33f272ecc2`。`node --disable-warning=ExperimentalWarning .local/antigravity-review-20261111-2130/index.mjs`：沿用全状态离线索引脚本，不解除封存，当前1252卡向量全部就绪。

`python -B -X utf8 .local/antigravity-review-20261111-2130/publish.py`同步正式导入回执、验收状态、原文旁标记、共享原文目录和队列，记录实际新文件名；原包以已验收/被修订包接续记录，未单独导入，旧阶段判定继续留档。当前队列整书完成16/25部，剩9本未派。正式库27部、278卷、1252卡；应用仍0.1.19，协议draft-0.1。

本轮Gemini 3.8 Flash Low会话usage：inputTokens=298494，outputTokens=37753，cachedReadTokens=4181452，thoughtTokens=0，totalTokens=4517699。验收后零模型turn的内置/usage保存quota-after.json：五小时和周剩余额度均100%，但两个bucket的reset_time均已变化；不能用重置后的余额相减还原本轮消耗，不能把负差当退款或伪造消耗百分比。原始前后值和会话用量见quota-comparison.json。今后若还需跨窗口可靠核算，应在任务结束时留存内置usage读数，而不等跨重置后再查；本轮不追溯编造额度。

权限修复后的本轮真实执行共有82次工具权限请求，拒绝0次，正常end_turn结束，见session-completion.json；未再发生此前路径误拦。本次未新建或恢复任何模型会话，定时novel-studio保持PAUSED，queue.automationPaused=true。更新HANDOFF、验收和派工记录，运行 `node scripts/package-source.mjs` 重做源码包，重算SHA-256并核对CRC与打包文档，安装器及通用规范包摘要不变。


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


### 06:10正常关机请求失败，未强制关机

`pwsh -NoProfile -File scripts/finish-night-dispatch.ps1 -Shutdown`已调用不带/f的`shutdown /s /t 0`，Windows因电脑锁定返回1271（The machine is locked and cannot be shut down without the force option）。没有切换强制关机或重复请求。25部全部完成、1616卡及向量、最终一致备份均已保存；novel-studio自动化已删除。队列/关机回执纠正为shutdownStatus=failed_locked、shutdownAttemptedAt，移除易误解为成功的shutdownIssuedAt；保持停止派工/暂停，下一步等用户解锁后手动正常关机或另行指示。实际未关机，不能声称已断电。


## 2026-11-12 用户授权全部解封

用户明确要求拆书完成后全部解封。封存仅通过reference_works.deleted隐藏书架及检索，正文/知识卡保留。正式应用已退出，先`node --disable-warning=ExperimentalWarning scripts/backup-night-library.mjs .local/unarchive-20261112`做一致备份，ZIP SHA-256 `b7dd943efcbaecf645f35a174dabf89831675a8375651339466d0389061fc35f`，库内数据库摘要`cc9f0beac1a323f4e78907d8939b3f0bbc4320d5da90712ae325c8b7b91506bb`。从备份抽取隔离数据库，执行`.local/unarchive-20261112/unarchive.mjs`调用生产ReferenceService.setHidden逐书恢复，在事务内核对仅12部deleted变为null，保护表行数及原创/卡片/证据摘要相同，quick_check和外键通过，再对正式库执行同样流程通过。

结果27部全部在用、0部封存；278卷、1616卡、现有索引/正文/原创/证据未改。解除deleted过滤后全部书目可进入日常书架和参考检索，无需重导或重新拆书。旧封存时间及回退依据保存在unarchive-report.json.restored；如需回退，只按本次12部workId恢复previousDeleted，避免覆盖后续用户资料。完整隔离及正式回执在`.local/unarchive-20261112`。本轮未启动自动派工或关机。


## 2026-11-12「有哪些装逼打脸情节」零结果诊断

用户要求排查，未授权重拆或改卡；本轮没有改正式数据、API设置或应用代码。源码/依赖锁/正式安装均0.1.19，桌面快捷方式目标正式EXE；正式27部全部在用、1616卡，主题相关卡存在。安装bundle的planner/reviewer与源码文本相同。审计`.local/retrieval-diagnosis-20261112`。

在sqlite在线一致备份的隔离资料上使用生产SearchService、真实本地Qwen模型复现：原问分词为有/哪些/装/逼/打/脸/情节；停用词及单字过滤使keyword=0，1616张向量扫描正常但未过0.56门槛，semantic=0，非索引丢失。外部请求先被自动审批拒绝，本机只读检查继续；用户随后明确允许发送本次问题和原候选摘录后才重放。凭证只在本机使用，报告不含API Key；原稿不外传。

真实外部DeepSeek Flash开启thinking：计划正常返回3条改写，放宽召回合并36张候选，包括公女的谦虚青年术科反转、流星赐号等既有卡。第一次筛选报EXPAND_TRUNCATED（接口finish_reason=length），RetrievalService按现有catch规则回退原始本地结果，故显示零匹配。对同一候选有界重放：原thinking配置这次正常结束、选7张，completion2698中reasoning2680；仅本次请求禁用thinking而不改配置则正常结束选8张，completion19。证明不是本库无相关卡或提示词必然全拒；故障具有偶发性。当前retrieval沿用扩写默认900输出token，DeepSeek思考时实际4096预算，思考与最终JSON共用预算，长思考会截断；这是主要疑点与本次真实截断一致，但首个失败未捕获原始usage，不能伪造其精确reasoning用量。

诊断命令/脚本：隔离diagnose.cjs生产全链路、review-experiments.cjs同候选thinking true/false对照；diagnosis.json、review-experiments.json、summary.json保存真实返回/候选及用量；安装提示词对比见installed-prompt-comparison.json。正式应用旧DevToolsActivePort已失效，未读取当前用户界面的开关/范围，故不声称已确认其屏幕上的每个设置。

待修：本地检索应保留被分成单字的常用复合短语召回；AI检索应有独立输出/思考预算及截断处理，提供可见失败原因，不能让接口失败与确无匹配难以区分。不得用“AI空选择自动全放行”制造不相关结果，不降低内容证据约束或自动改卡。修复前用户可在AI辅助检索配置中关闭思考后重试，当前正式设置仍保留原状；本轮只完成诊断。


## 2026-11-12 主管换对话交接维护

本轮仅文档维护与只读核验，未变更应用代码、协议、正式数据/接口配置，未启动派工、模型、定时或关机。Node DatabaseSync只读复核27部全部在用、0封存、278卷及版本、1,110,178正文块、1616卡/当前向量1616；源码、锁文件、安装版均0.1.19，WScript.Shell核对桌面目标正式EXE。队列25/25completed、暂停/停止，提升权限检查无在跑拆书worker，novel-studio自动化文件不存在。证据`.local/handoff-20261112/read-only-verification.json`。

重写docs/开发与运维接管提示词.md并保存同字副本.local/handoff-20261112/转交提示词.txt；HANDOFF增加当前主管快照、修正旧阶段施工与hy3/定时现状混写；AGENTS、CONTEXT及派工入口同步当前停派边界。新增docs/知识库方向评估.md明确功能独立/共库耦合、用户目标未定、候选方向未获实施授权；检索截断/短语召回诊断未修复，7个结果不代表穷尽覆盖。

实际验证：Python文档断言通过，提示词副本与Markdown正文一致，当前节无旧hy3/恢复30分钟指令、新文档存在、自动化未恢复。回执documentation-check.json。仅文档变更未运行应用回归测试，不能宣称修复检索或完成解耦。随后`node scripts/package-source.mjs`重做0.1.19源码包，Python验证ZIP CRC、维护文档逐字一致及发布清单实际SHA；安装器和通用规范包原SHA不变，结果写release-check.json。

## 2026-11-12 用户授权大幅清理 .local

用户为后续知识库改革明确授权大胆删除历史产物，优先保留网上下载的小说原文；本次清理不代表授权启动重构。`.local` 从 78.14 GiB 降至 0.82 GiB，删除373个顶层文件/目录。另将其中450份EPUB/TXT按SHA-256去重保留为231份，位于 `原文保留/20261112-local清理`，清单保存原路径、现路径和摘要；派工目录115份原档清理前后均校验一致。扣除新增原文副本，净释放约 77.06 GiB。

保留 `.local/model`（正式embedding.json正在引用）、`.local/night-final-20261112-0606`（最终备份）和`.local/nsis-official`（发布工具）。正式资料库、安装程序、源码、依赖和拆书工作区未改。旧整改检查点、测试数据库、隔离安装/打包副本、旧模型副本、派工临时运行目录及旧审计临时文件已删除；文档中对应历史.local路径可能已不可访问，不再作为当前可用恢复依据。检索诊断结论保留在文档，本次未修检索。

实际操作：只读盘点；原文复制、SHA-256去重与复验；PowerShell检查所有绝对目标均为工作区.local直属项，先移除目录联接本身，再用Remove-Item -LiteralPath逐项删除；未跟随联接删除目标。清单与计数见 `docs/cleanup-20261112`。仅清理本机产物，未启动应用或外部请求，未运行应用回归测试。

## 2026-11-12 Git基线与KB v2 MVP环境准备

按用户新授权准备本地环境，不开展原型实验。完善.gitignore后检查152份基线文件约3.02MiB，无超过5MiB文件，无常见密钥格式命中；仅保留公版西游记ZIP测试样例。初始化main并提交371be17 chore: baseline v0.1.19，切换feat/kb-v2-mvp；更新MVP文档边界。隔离目录含空samples/data/reports，ENV_READY.md列出27部候选（278卷、1,110,178块、1616卡）、只读导出命令、1024维Qwen3模型入口和兼容接口副本复用办法。本次从最终一致备份的临时副本只读查询reference表，未读取原创正文、未复制凭证或发外部请求；临时数据库用后删除，保留脱敏元数据。Python本机SQLite不支持STRICT，改用项目Node.js24的DatabaseSync完成只读查询，不修改数据库格式。

实际检查：git init -b main、git add --all、git check-ignore、暂存文件大小及常见密钥格式扫描、git commit、git switch -c feat/kb-v2-mvp；保护资源334个文件SHA-256前后比对；核验样板目录为空与Git忽略，ENV命令PowerShell语法解析，Git状态清洁。无应用代码变化，未运行应用回归/模型推理。正式应用、资料、模型、最终备份、release交付不变，不重打0.1.19包。

## 正式上线完成（2026-11-13，0.2.0）

- 当前分支main；合并提交8eae11f，Gemini交付ac91913及上线修正42df224均已包含。源码、锁文件、正式安装resources/app/package.json均0.2.0；桌面“小说工作台”目标仍为真实Windows正式安装目录，不使用沙箱重定向的LOCALAPPDATA。
- 正式参考库已切换为 `%LOCALAPPDATA%/Novel Studio/reference-v2.sqlite`：27部/278卷/1,110,178块/676档案/1,575切面/9,077场次/80,917切片/91,569向量。源与正式数据库SHA-256一致（7975ce715ad91b3009f6ba4a1808986b233d7b8e9b8c7bf378ed193b4feeb1b2），无重拆、无向量重算。旧reference_*仅停用并保留于共库和备份，不再服务参考UI/检索；未清空原创共库。
- 正式Vulkan运行程序位于资料目录 `runtime/llama-cpp-vulkan/llama-server.exe`，Qwen3模型及CPU回退仍引用原.local/model；180秒闲置卸载。正式程序实际本地检索返回结果且embeddingMode=gpu。源码与正式库版本实测：原创library.sqlite user_version=1、reference-v2.sqlite user_version=2001。
- 原创作品/卷章/草稿/历史/标记逐表行数与摘要保持一致；retrieval-api.json、expansion.json及凭证文件摘要保持一致。embedding.json仅按显卡配置授权调整。旧0.1.19发布件不覆盖。
- 未配置检索API时，打包版可自动回退本机agy.exe Gemini Flash；已配置接口仍优先，接口失败时按既有规则回退本地。桥接按需启动，工作目录位于资料目录agy-retrieval-work，不授予工具执行权限。本次隔离无API实测：快速约28.5秒、深度约28.8秒，均非降级结果；深度2轮/6次查库/2次原文翻阅。不是全库穷尽统计或内容完备性证明。
- 68项自动测试、构建、隔离安装、原创工作流、模拟扩写、v2全库本地GPU检索、112段证据高亮、无API真实agy快/深检索、正式程序实际资料本地检索均通过。首轮测试因沙箱回环/进程权限失败，沙箱外复验通过；桌面脚本修正默认AI模式误用，并移除已通过证据定位后的可选阅读器截图等待（截图超时不作为成功截图证据）。正式程序最后验收后已正常关闭，方便用户自行打开。
- 上线前完整备份：`.local/release-kb-v2-020/before-formal-20261113-034021`，含data全目录、旧安装program及200个文件SHA-256清单。回退须先正常退出、备份上线后新写入内容，再按manifest恢复必要文件；不要盲目整库覆盖后续原创。
- 审计：`.local/release-kb-v2-020` 下backup-receipt/source-verification/upgrade-receipt/migration-receipt/formal-verification与installed-qa/installed-v2.json。运行数据、原文、密钥与备份不进Git；旧夜间自动化、重拆、关机不恢复。

实际命令与检查：npm test（沙箱外68/68）、npm run build、NOVEL_STUDIO_MAKENSIS指定现有NSIS后npm run package:windows；安装器 /S /NOSHORTCUT /D=<隔离路径>；node scripts/qa-installed-smoke.mjs <exe> 0.2.0；node scripts/kb-v2/qa-installed-v2.mjs <隔离安装exe> <资料副本> <报告目录> --ai；node scripts/qa-writing-workflow.mjs <exe>；node scripts/qa-expansion.mjs <exe>。保护资源先备份后逐文件核对，源库DatabaseSync readOnly运行quick_check/foreign_key_check/分层向量对齐检查；git merge --no-ff feat/kb-v2-mvp；scripts/upgrade-windows.ps1以真实用户LOCALAPPDATA执行并复核快捷方式、安装字节和正式资料；本轮migrate-formal.ps1复制成品库与运行库；verify-formal-installed.mjs验证正式程序、本地GPU、原创逐表摘要与配置摘要。授权真实Gemini测试前自动审批曾因参考摘录外传许可不明确拒绝，用户随后明确批准两项检索验收后才执行。

应用内BackupService新增双库ZIP格式novel-studio-backup-2；支持恢复两库并保留恢复前快照，第二库重开失败时回退两库；旧格式备份仍只恢复原创/旧共库，不替换v2。三项新增回归覆盖双库恢复、故障回退及API检索预算透传。v2模式同时隐藏并后端拦截旧ZIP导入，避免向停用旧参考表写入。

## 0.2.1 已上线：反重力模型手选（2026-11-13）

- 当前main，源码/锁文件/正式安装应用版本0.2.1，桌面“小说工作台”仍指向正式安装目录。参考库维持Gemini Batch 2成品86部/657卷/225,535向量，本次不重拆、不重算、不迁移数据库。
- “资料与设置 → AI辅助检索 → 检索模型来源”提供自动、兼容API、反重力账号额度三种来源。先刷新反重力模型，再选择家族和思考强度并保存；当前本机agy目录返回15个Gemini选项（Flash、Argon、Carbon、Hydrogen及Orchestrator变体）。模型列表来自账号CLI，不承诺每个条目已逐个推理实测。
- 来源选择独立保存在正式资料retrieval-provider.json，初次无文件时默认auto，保持原API优先/无API时反重力回退行为。手选agy可在API配置仍存在时直接使用CLI；手选api不会暗中消耗账号额度。现有API配置、Key及原创扩写不改。CLI复用本机登录，需Google账号登录；本应用移除子进程继承的API Key/ADC环境变量，不读取或导出CLI凭证、不改其持久登录设置、不另建HTTP反代。
- 客户端透传所选modelId及对应thought_level，没有强度后缀的模型使用默认。目录刷新和固定JSON测试句支持取消；模型、来源或书库变更后旧检索结果失效；调用失败显示原因并回退本地。启动或打开设置不自动发推理请求。
- 新增7项自动测试，总75项通过；构建、打包版动态目录刷新、Carbon/high选中后重启持久化、切回API时原配置/加密Key字节不变、Flash固定测试句真实连接及桌面截图通过。真实测试仅发固定合成句，无小说/原创外传。本次未逐一测试所有模型，也不重复进行全库内容审计。
- 升级前完整备份`.local/agy-model-release-021/before-formal-20261113-164400`，含正式data与旧0.2.0程序，254个文件校验一致。正式升级脚本指纹新增独立参考库和来源配置保护；安装字节与隔离版一致，快捷方式目标隔离资料冒烟通过。现有正式资料逐文件摘要复核见`.local/agy-model-release-021/formal-data-verification.json`。
- 审计`.local/agy-model-release-021`：tests-final.txt、ui-final/report.json、account-model-settings.png、backup-receipt.json、upgrade-receipt.json及发布校验。旧0.1.19/0.2.0发布件保留。用户升级后可直接打开桌面快捷方式自行选择，未代改其正式模型来源。

实际命令：node --test tests/agy-provider.test.mjs（7/7）；沙箱外npm test（75/75）及npm run build；NOVEL_STUDIO_MAKENSIS指定现有NSIS后npm run package:windows；安装器/S /NOSHORTCUT /D=<隔离目录>；node scripts/qa-agy-model-settings.mjs <隔离EXE> .local/agy-model-release-021/ui-final --real-test（15模型，保存Carbon/high，重启记忆，Flash固定句连接，原API字节保留）；全目录backup-formal.ps1及SHA核对；scripts/upgrade-windows.ps1 -Version 0.2.1 -IsolatedInstall <隔离目录>并核对实际版本、EXE/bundle/UI、桌面目标与资料指纹。初轮UI验收定位不到隐式label，补充明确aria-label后最终验收通过；完整测试初轮沙箱回环/子进程权限失败，沙箱外复验通过。未自动更新agy CLI。

## 0.2.2 已上线：反重力账号扩写（2026-11-13）

- 当前main，源码/锁文件/正式安装版本0.2.2。用户已授权把反重力账号模型接入AI扩写；现于“资料与设置 → AI扩写 → 扩写模型来源”刷新CLI模型，选择模型/思考强度并保存。参考库仍86部/657卷，本次不迁移、不重拆、不重建向量。
- 扩写选择独立保存为expansion-provider.json（初始api，保留旧API行为），检索仍用retrieval-provider.json，两者可各选不同模型。明确选agy后直接用账号CLI；选auto时优先API、未配置才用账号；API失败或额度不足不自动换模型重写。旧expansion.json/retrieval-api.json及加密Key不改。
- 客户端按用途区分：检索维持JSON，扩写使用纯正文指令；拒绝工具权限不变。ExpansionService沿用括号选区、有限上下文和资料勾选、预览采纳流程，只在用户主动生成时请求，不读取其他作品、不自动写回原稿。取消、选模中途变更、空/超长输出被拦截。
- 78项自动测试、构建、打包、扩写模拟API桌面回归均通过。安装版动态读取15模型选项，Carbon/high保存后重启保留，切回API时配置和加密Key字节不变。真实合成制服章节通过Carbon/low生成中文纯正文，原稿前后读取一致。Flash本轮固定测试句及合成扩写均遇到等待/90秒prompt超时，未宣称该模型本轮成功；另直接Carbon合成短句约16秒返回。无真实用户原创或参考正文外传。
- 升级前完整备份`.local/agy-expansion-release-022/before-formal-20261113-165659`（data+旧0.2.1程序，253个文件，摘要校验一致）。正式升级和既有数据逐文件摘要核验见本轮upgrade-receipt.json、formal-data-verification.json；桌面快捷方式目标仍正式EXE。不会代用户改变正式扩写来源，需在设置里自行选择。
- 审计`.local/agy-expansion-release-022`含tests.txt、ui-carbon/report.json与截图、expansion-regression.txt、备份和升级回执；ui.txt/ui-retry.txt保留Flash超时证据。旧发布件全部保留，0.2.2另交安装器/源码/SHA清单。

实际命令：沙箱外npm test（78/78），npm run build、npm run package:windows（指定现有NSIS）；隔离安装/S /NOSHORTCUT /D=...；node scripts/qa-agy-expansion-settings.mjs <隔离EXE> .local/agy-expansion-release-022/ui-carbon --real-test --carbon（模型目录、选模重启、合成章节真实生成、不写原稿、API摘要保留）；node scripts/qa-expansion.mjs <隔离EXE>（模拟接口取消/预览/资料勾选/原稿保护/重启/多配置）；backup-formal.ps1完整备份校验；scripts/upgrade-windows.ps1 -Version 0.2.2 -IsolatedInstall ... -GracefulClose，随后逐文件SHA核对既有正式资料。真实模型验收仅用新建的虚构制服合成章节，Flash超时如实留档，Carbon成功后才升级。

## 0.2.3 已上线：Flash超时诊断与容量错误处理（2026-11-13）

- 当前main，源码/锁文件/正式安装版本0.2.3。本次以固定合成句对照Flash ACP、Carbon ACP及CLI直接print：Flash上游明确返回UNAVAILABLE(code 503): No capacity available for model gemini-3.8-flash-low on the server；本机CLI日志同时记录attempt failed/retrying。Carbon同路径正常。不是参考库缺失、API Key设置或单字分词导致；不能把服务端容量不足说成已由本地代码消除。
- 本地问题：CLI状态警告混入agent_message_chunk，之前软件一直等到45/75/90秒通用截止，提示网络/代理；扩写还可能接收到混杂警告。现仅识别并分离明确CLI状态行，允许短暂恢复；首次503后约20秒无有效输出则AGY_CAPACITY，明确503与实际模型；额度限流AGY_RATE_LIMIT，其他超时AGY_TIMEOUT注明RPC阶段。已恢复并正常end_turn的请求返回干净结果；不完整输出拒绝，不把警告当正文或卡片。普通正文警告符号不剥除。
- 检索故障仍返回本地结果并显示具体原因；扩写失败保留原稿；不延长无限等待、不改用户模型、不自动切账号/模型，不更新agy。上游容量波动仍存在，可稍后重试或由用户手选Carbon。
- 83项自动测试通过。新增5项覆盖503恢复输出清理、持续容量不足提前终止、429及不完整输出拒绝、实际模型超时提示、普通警告正文保留。修复后真实Flash固定句约24.6秒返回干净JSON，Carbon也成功；一次完整合成快速检索遇持续503，约26.2秒明确容量原因并返回本地1条，未假称AI成功。安装版选模/重启/API字节保留与Flash真实固定句测试通过。所有外部请求仅固定或新建的虚构文本，无用户原创或真实小说外传。
- 升级前完整备份`.local/flash-diagnosis-023/before-formal-20261113-185714`（data+旧0.2.2程序，254文件，摘要核验）；正式升级与既有资料核验见upgrade-receipt.json/formal-data-verification.json。86部库、原创、模型选择、凭证不改。
- 本机证据`.local/flash-diagnosis-023`：修复前model-summary/trace、direct-print.json；修复后after/；synthetic-retrieval/result.json；tests.txt、ui/report.json及备份/升级/发布回执。CLI默认日志仅只读筛查No capacity等诊断行，未读取或导出凭证。网上同类报告仅旁证，根因以本机真实回执为准。

实际命令：本轮probe.mjs对照两种ACP及CLI --print（固定合成JSON句），只读筛查本机CLI日志No capacity/attempt failed；node --test tests/agy-status.test.mjs（5/5）；沙箱外npm test（83/83）；probe-after.mjs复验；synthetic-retrieval.mjs内存虚构两段正文完整快速检索；npm run package:windows及/S /NOSHORTCUT隔离安装；scripts/qa-agy-model-settings.mjs <隔离EXE> .local/flash-diagnosis-023/ui --real-test；backup-formal.ps1完整备份、scripts/upgrade-windows.ps1 -Version 0.2.3 -IsolatedInstall ... -GracefulClose；逐文件SHA复核。仅修桥接和诊断，不重建向量，不改生产模型配置。


## 2026-11-15：0.2.4 创作助手

用户授权按书工作区、AGENTS.md记忆与反重力持续会话方案。实现与边界见[创作助手](创作助手.md)。本轮没有读取/外传正式原创或真实参考小说作外部验收。

- `npm test`：87/87通过；首轮沙箱运行的模拟接口网络用例受限，按相同命令在允许本机端口的环境复验全部通过。
- `node scripts/qa-assistant.mjs <隔离EXE>`：助手导航、选择原创书、编辑/保存记忆、输入问题及截图通过。
- 完全合成的真实Carbon low ACP：资料读取、模拟参考搜索、AGENTS.md写入、连续两轮均通过。重启另进程，捕获的方法顺序initialize/session/load/session/set_model/session/set_config_option/session/prompt，返回正确测试口令。首次150秒中止样本仍保留，不以它冒充通过。
- `fetch`通用词Bing RSS：HTTP200，10条item。完整网页读取不在首版范围。
- `npm run package:windows`、隔离NSIS安装、`node scripts/qa-installed-smoke.mjs <EXE> 0.2.4`及安装版助手UI通过。`pwsh -NoProfile -File scripts/upgrade-windows.ps1 -Version 0.2.4 -IsolatedInstall .local/assistant-v024/install -RecordFile .local/assistant-v024/upgrade-receipt.json -GracefulClose`：正式升级与快捷方式目标隔离启动通过（显式使用真实LOCALAPPDATA）。
- 升级前全资料与旧程序备份254文件摘要一致；既有正式资料全文件摘要比较见.local/assistant-v024/formal-verification.json。测试和截图在.local/assistant-v024，首版未做真实书籍建议质量人工验收。


## 2026-11-15：0.2.5 助手发送后未响应修复

- 只读真实86部参考库，以合成向量复现原同步passage扫描49,500ms，事件循环0次响应、RSS998MiB。未读取或重发用户原消息，未将正文发送给外部AI。
- 修复为独立只读worker和流式向量读取/有限候选。用户澄清助手应委托检索AI，reference_search已接入现有RetrievalEngineV2 fast/deep；沿用检索来源/模型/凭证，助手负责结合本书资料汇总。AI及embedding请求通过消息异步交给既有客户端，SQLite读取计算不在Electron主线程进行。
- `npm test`：90/90通过，新增只读worker、无模型回退、事件循环响应/取消，以及检索AI规划改写参与召回的测试。
- 同库合成向量修复后检索12,411ms，485次心跳、最长间隔38.1ms、RSS102.5MiB；取消106.5ms。
- 首次打包worker缺createRequire导致依赖加载失败；已补齐banner重新打包并重新隔离安装。最终`node scripts/qa-assistant-responsiveness.mjs .local/assistant-freeze-025/install/Novel Studio.exe <正式参考库路径>`：本机模拟检索AI两次调用（规划/筛选）、返回1卡，20次IPC最慢46.61ms，页面切换正常。只读库中的文本仅在本机处理；此项不代表真实模型建议质量验收。
- 安装版启动与助手记忆编辑保存复验通过；升级前完整备份262文件摘要核验，目录.local/assistant-freeze-025/before-formal-20261115。最终升级及原有资料全文件核验以upgrade-receipt.json、formal-verification.json为准。证据及日志在.local/assistant-freeze-025。


## 2026-11-15：0.2.6 反重力调用稳定性

用户授权统查助手、AI扩写、知识库检索。CLI日志只读筛查发现trajectory schema init database is locked；原失败请求缺完整阶段记录，不能精确还原每次消耗或断言全部来自同一根因。首个合成助手真实调用模型返回“工具未注册”，0次检索；增加MCP握手门禁后真实Carbon出现tools/list及3次tools/call，其中检索1次，完成最终汇总。原始输出保留在.local/cli-stability-026/real（均合成资料）。

`npm test`：96项全通过。新增取消后新传输、助手无进展截止、无正文日志、检索并发排队/排队取消不外发、MCP就绪前不发送prompt，恢复会话历史回放不混入本轮流式输出。真实Flash JSON约6.3秒、Carbon正文14.2秒通过；既有扩写API/选区/取消/原稿保护回归全部通过。所有真实模型验收仅固定句/新建虚构大纲，没有发送正式小说或用户原创。

安装版启动、助手界面、检索与扩写选模/API字节保护分别验收；结果见.local/cli-stability-026/*ui/report.json与日志。正式升级前完整资料+旧程序备份259文件摘要通过，含助手记忆聊天。后续以upgrade-receipt.json、formal-verification.json为正式部署证据。

0.2.6正式发布结果：最终安装器隔离安装、启动、助手页面记忆保存通过；安装版真实Flash检索固定句、Carbon合成扩写100字且原稿未变、动态15模型、选模重启和API字节保护通过。`upgrade-windows.ps1 -Version 0.2.6 -IsolatedInstall .local/cli-stability-026/install -RecordFile .local/cli-stability-026/upgrade-receipt.json -GracefulClose`成功（显式使用真实LOCALAPPDATA）；快捷方式目标启动通过，169个既有资料文件摘要一致。原两次用户失败没有完整阶段轨迹，保留此诊断限制；上游503/429仍需明确报告，不能承诺服务永不超时。


## 2026-11-15：0.2.7 助手长检索任务、阅读界面与写作侧栏

- 用户授权修复再次检索超时并改善阅读/增加写作右侧助手。正式无正文诊断只显示外层324443ms complete，原内部失败缺阶段信息；不声称已完整复盘该次故障。改为reference_search提交、reference_result短轮询领取，任务360秒总预算、单次领取8秒，MCP调用不再挂完整长任务；正常AI路径lazyFallback不预扫备用全库。
- `npm test`：100/100通过，覆盖异步提交立即返回、同查询去重、跨书任务隔离、失败领取/可见、未领取禁止伪完成，以及不重复扫描/失败仍回退。`node scripts/qa-writing-workflow.mjs`通过，章节/大纲/资料/自动保存/光标/滚动/历史回归证据.local/writing-workflow-QrkCgT。
- 合成真实Carbon普通任务：检索人为延迟20秒，1次提交、领取后汇总，总42347ms。185秒延迟长任务：总210394ms，1次提交、领取done后汇总，未因MCP单次等待超时。报告.local/assistant-027/real/report.json、real-long/report.json；没有发送真实小说或用户原创。
- `node scripts/qa-assistant-experience.mjs <隔离EXE>`通过：长中文Markdown、标题/段落/列表/引用排版、主视图/写作右侧/窄窗截图、关闭重开和两入口草稿保留，无pageerror。最终截图.local/assistant-027/experience-1794681847262。视觉为自查，brief见assistant-ui-brief.md。隐藏窗口普通截图超时/旧帧未当作通过，采用既有原生刷新捕获后检查。
- `npm run package:windows`、隔离NSIS安装、`qa-installed-smoke.mjs <EXE> 0.2.7`、`qa-assistant.mjs <EXE>`及上述experience通过。`qa-assistant-responsiveness.mjs <EXE> <正式参考库只读路径>`：本机模拟AI两次规划/筛选，1卡，20次IPC最慢55.54ms且页面可切换；无正文外传。
- 全资料+旧程序备份261文件摘要通过；`upgrade-windows.ps1 -Version 0.2.7 -IsolatedInstall .local/assistant-027/install -RecordFile .local/assistant-027/upgrade-receipt.json -GracefulClose`（显式真实LOCALAPPDATA）成功。快捷方式目标启动与171个既有资料文件摘要核验通过；原稿、参考库、配置、聊天、记忆未变。安装器、源码ZIP及SHA清单在release/下单独发布。


## 2026-11-15：Claude方案/Gemini前端成果独立合并验收（源码未发布）


角色澄清：Claude负责审查与方案，Gemini完成B0～B11实现；本节为Codex实际独立验收，不把交付方报告当作独立通过。Gemini交付HEAD为254a23f，基线main为76e6f98；原交付16个提交保留，Codex补修单独提交c77a24c。

- 差异核对：原交付44文件，集中renderer、共享纯函数、测试及文档；无app/main、app/kb-v2、依赖版本、数据库、IPC、CLI调度、权限修改。补修同样没有后端改动。
- 补修1：refreshState的epoch比较由>=改为严格相等；reset返回也检查书籍与请求代次，避免旧异步返回覆盖新状态。
- 补修2：MessageList缓存不再只比较条数和末条，而比较全部消息；已实测两书条数/末句相同但前文不同时能正确切换，避免上一本书内容残留。
- 补修3：删除标记保存正文快照；5秒内若正文已变，不把旧偏移重新标到新内容，明确提示重新选择；新删除清理旧撤销条。
- 独立验证：构建通过；修正前后npm test均113/113通过；qa-writing-workflow、qa-writing-regressions、qa-workspace-ui、qa-assistant-experience、qa-expansion、qa-retrieval、qa-card-viewer、qa-card-markdown、qa-desktop共9项通过；qa-agy-model-settings及qa-agy-expansion-settings（无--real-test）2项通过，动态15模型及隔离API配置字节保护通过。
- 新增scripts/qa-ux-merge-review.mjs：旧响应晚到、同末句两书消息、正文变化后撤销标记的实际交互保护均通过，并检查深色窄窗无横向溢出。报告/截图在本worktree的.local/ux-acceptance-1794719901348。独立助手侧栏截图在.local/assistant-027/experience-1794719638119。视觉自查通过，不冒充全主题WCAG独立认证。
- 汇总日志位于原项目根.local/ux-merge-review。所有写入为隔离合成资料；未外发原稿或真实小说，未运行真实生成。单次真实CLI长任务、全库性能、安装器/安装版、全部主题对比度矩阵本轮独立NOT_RUN；后端未改，不重跑原模型验收。
- 本轮仅审查并合并代码，不改版本号、不重打release、不升级正式程序。源码package版本仍0.2.7但包含未发布前端；正式安装0.2.7仍为此前界面。后续发布须另做版本/打包/安装版检查与备份升级。
- 已知非阻断项：深色冷启动首帧可能闪白（主进程backgroundColor未改）；失效标记仍不支持删除撤销；有效标记删除后若正文变动则明确拒绝旧位置恢复。
- 合并方式：保留Gemini提交历史和Codex补修，main使用--no-ff合并feat/claude-frontend-ux；实际合并提交见git log。开发/测试进程已结束，不恢复后台任务或外部派工。


## 0.2.8 已上线：前端体验改版（2026-11-15）

- 用户在审查合并后明确要求升级试用。main合并基线09663c3，package.json和package-lock.json同步升0.2.8；Claude方案、Gemini实现及Codex三项补修随本版发布。当前源码/锁文件/正式安装resources/app/package.json均0.2.8，EXE文件版本不作为应用版本证据。
- 升级前正常退出，完整复制正式资料和旧程序至.local/ux-release-028/before-formal-20261115，261文件（资料171、程序90）逐一SHA256核对。随后隔离安装0.2.8，实际运行qa-installed-smoke、qa-assistant-experience、qa-writing-regressions通过；安装版侧栏截图已目视自查。qa-assistant-responsiveness使用备份参考库、合成向量/查询和本机模拟检索AI通过，返回1卡、AI模拟调用2次，20次IPC最慢63.55ms，无外部模型请求。
- 实际发布命令：NOVEL_STUDIO_MAKENSIS指向.local/nsis-official/nsis-3.13/makensis.exe后运行npm run package:windows；安装器/S /NOSHORTCUT /D=隔离目录；上述QA均显式传入隔离EXE；正式升级显式LOCALAPPDATA=C:\Users\78828\AppData\Local，pwsh -NoProfile -File scripts/upgrade-windows.ps1 -Version 0.2.8 -IsolatedInstall .local/ux-release-028/install -RecordFile .local/ux-release-028/upgrade-receipt.json -GracefulClose。正式程序与隔离安装主要文件摘要一致，桌面小说工作台快捷方式目标独立启动通过。
- 正式既有171个资料文件全部摘要不变（含原创/参考库/配置/聊天/记忆）。证据.local/ux-release-028/{package.log,smoke.log,experience.log,writing.log,responsiveness.log,upgrade.log,upgrade-receipt.json,formal-verification.json}；安装版截图.local/assistant-027/experience-1794724573945，写作回归.local/writing-regressions-mYTtT8。
- 交付release/NovelStudio-0.2.8-x64-Setup.exe、NovelStudio-0.2.8-source.zip、NovelStudio-0.2.8-SHA256.txt；完成文档后npm run package:source，校验ZIP完整性、版本与当前源码/文档字节一致。源码打包补入根目录两份前端专项文档，避免交接链接缺失。旧发布件、模型与原文保持不动。
- 先前main构建和113项单测及前端独立审查仍有效，见下方历史记录；本轮无功能代码新增，不重复外部真实生成。已知非阻断项：深色冷启动可能短暂闪白。当前无升级阻塞，下一步由用户试用并反馈；不启动后台任务。

## 0.2.9 已上线：自适应对话与可拖动写作侧栏（2026-11-15）

- 用户反馈创作助手文字挤在中间、写作右侧栏不可调宽。本轮从main55a968f调整并发布0.2.9：去除助手消息/参考/进度的74ch居中上限，助手回复使用可用宽度、用户气泡靠右，消息与输入区保留自适应边距。
- 写作右侧栏左缘新增可抓取分界线，适用于助手、参考及其他工具面板；支持指针捕获拖动、方向键10px微调（Shift为40px）、Home/End边界、双击恢复364px。宽度280～960px，停靠时按窗口限制并为正文保留至少320px；窄窗沿用覆盖侧栏。仅用户拖动/键盘操作保存layout.drawerWidth，临时缩窗不覆盖偏好，折叠主侧栏保留此值；旧布局与正文位置兼容，不作数据库迁移。
- 主要代码：app/renderer/{assistant.css,Writing.jsx,PanelResizer.jsx,writing.css,writing-session.mjs,App.jsx}。补充writing-session的可选宽度/非法值回归及scripts/qa-assistant-layout.mjs，实际覆盖1800/1200/900三种窗口、回复宽度/无溢出、364→604→494px拖动、键盘边界、缩窗与重载恢复、正文和草稿保护、侧栏折叠保留偏好。主窗口隐藏时ResizeObserver验收不能可靠反映可见交互，专项QA使用showInactive的隔离可见窗口，避免将后台节流误判为实际布局失败。
- 验证：npm run build通过，npm test在允许本机模拟HTTP的环境114/114通过；首次受限环境测试的网络失败不作产品失败结论。npm run package:windows后安装至.local/ux-layout-029/install；安装版qa-installed-smoke、qa-assistant-layout、qa-assistant-experience、qa-writing-regressions全部通过。宽窗助手回复实际1451px，1200/900窗口为875/625px；截图full-chat.png和resized-sidebar.png已目视自查，0页面错误。日志.local/ux-layout-029，安装版专项证据qa-1794726181263；助手原交互证据.local/assistant-027/experience-1794726191668，写作.local/writing-regressions-kxUpHk。无外部模型调用，真实生成/全库内容质量NOT_RUN（本轮仅布局及本地偏好）。
- 正常退出后完整备份正式资料和0.2.8旧程序至.local/ux-layout-029/before-formal-20261115，262文件SHA256逐一核验（资料172/程序90）。正式升级命令：显式LOCALAPPDATA=C:\Users\78828\AppData\Local后，pwsh -NoProfile -File scripts/upgrade-windows.ps1 -Version 0.2.9 -IsolatedInstall .local/ux-layout-029/install -RecordFile .local/ux-layout-029/upgrade-receipt.json -GracefulClose。安装文件与隔离安装摘要一致，桌面小说工作台快捷方式正式目标单独启动通过；全部172个既有资料文件摘要未变，含原稿、参考库、配置、聊天及记忆。详见upgrade-receipt.json、formal-verification.json。
- 当前main源码/锁文件/正式安装resources/app/package.json均0.2.9。release交付NovelStudio-0.2.9-x64-Setup.exe、源码ZIP及SHA256清单；最终文档完成后npm run package:source，ZIP完整性、全部打包文件与工作区字节一致及版本核验通过。保留旧发布件、原文和模型；未恢复后台任务。已知深色冷启动短暂闪白未涉及。下一步由用户试用本轮布局。

## 0.2.10 已上线：滚动条、助手排版与检索卡预览（2026-11-15）

- 用户要求简约滚动条、减少非必要注释小字、规范助手输出与改善检索卡阅读。本轮从main70c7fe0完成并发布0.2.10：统一原生6px扁平滚动条；常驻快捷键/发送说明改为悬停或说明面板，模型来源说明折叠，必要错误/未完成/未保存状态保留。
- 助手每轮增加阅读格式要求，分幕方案优先分节；接入官方推荐remark-gfm4.0.1（MIT，锁文件同步），短表正常渲染，长表按原列内容转为有标题的分段，简单<br>安全换行；对明确列数匹配的挤成单行表格补显示换行。未知HTML沿用文本显示，不执行；图片不加载。只改显示输入，不重写历史chat.json，不改本书AGENTS.md，不清会话。真实模型是否始终遵守排版要求NOT_RUN，不宣称任意破损格式都可修复。实现与开源参考见docs/阅读体验优化.md。
- 对话中的检索卡显示三行短摘录（最多160字加省略号），优先已返回的参考看点；宽窗网格并排，窄栏自动单列，全文与原文证据按需打开。原卡/证据身份、检索召回/排序/候选上限与实际cursor分页不改；仍由用户加载后续批次，不自动追加外部请求。详情弹窗保留完整Markdown。
- 验证：npm run build和117项单测通过（新增长/短表、代码/转义、不丢未知HTML原句、卡预览不改原数据、每轮输出格式要求）；源程序qa-readability、qa-card-markdown、qa-card-viewer、qa-retrieval、qa-desktop通过。后四项既有全文/编辑/证据断言保留，结果页断言同步短预览。所有调用为本机模拟或合成/公版隔离资料，没有重发真实小说/原创或真实模型请求。
- npm run package:windows生成最终包，隔离/S /NOSHORTCUT /D=.local/ux-readability-0210/install后，qa-installed-smoke、qa-readability、qa-assistant-experience、qa-assistant-layout全部通过。12张长卡宽窗三列，完整末尾可从弹窗读到；四幕长表分成4节、短表保留表格；滚动条6px，原聊天字节未变，0外部HTTP请求、0页面错误，深色窄窗和截图已目视自查。专项证据.local/ux-readability-0210/qa-jX1RWY；助手.local/assistant-027/experience-1794728051608，调宽.local/ux-layout-029/qa-1794728059677。
- 正常退出后完整备份正式资料及0.2.9程序至.local/ux-readability-0210/before-formal-20261115，262文件（资料172/程序90）逐一SHA256核验。正式升级显式LOCALAPPDATA=C:\Users\78828\AppData\Local，pwsh -NoProfile -File scripts/upgrade-windows.ps1 -Version 0.2.10 -IsolatedInstall .local/ux-readability-0210/install -RecordFile .local/ux-readability-0210/upgrade-receipt.json -GracefulClose。正式与隔离安装摘要一致，桌面小说工作台目标独立启动通过；全部172个既有资料文件摘要不变，原稿/参考库/配置/聊天/记忆保持原状。证据upgrade-receipt.json、formal-verification.json及同目录日志。
- 当前main源码/锁文件/正式安装resources/app/package.json均0.2.10；release交付安装器、源码ZIP和SHA256清单，最终文档完成后npm run package:source，验证ZIP完整、版本一致、全部打包文件与工作区字节一致。旧release、原文、模型及备份保留。已知深色冷启动短暂闪白仍未涉及；无运行中的后台任务，下一步由用户试用阅读体验。
