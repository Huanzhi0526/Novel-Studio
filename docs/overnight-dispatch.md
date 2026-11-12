# 2026-11-11 夜间反重力轮转

> 2026-11-12当前状态：本轮25本全部完成，27部全部在用，自动化novel-studio已删除、队列暂停/停止。本页以下轮转、模型/定时/关机内容保留为历史操作说明，不自动续做；用户现在仅讨论方向，不实施。关机曾因锁定失败，不能自动重试。


最新用户授权：恢复佐佐木、弱角，再补女神攻略异世界，三本并发；整批验收后轮转，先90分钟检查，未完成按真实进度调20/30/60/90/120分钟。成功派发后不持续监督。Gemini 3.8 Flash low，上下文CLI预设，不主动压缩，不派子代理。旧暂停与CodeBuddy轮转指令由本条接续。

北京时间截止为 **2026-11-12 06:00:00+08:00**。截止前可开始新批；截止后仅允许继续当前批已有书的断点，不开下一批。当前批全部验收、正式接收和保存完毕后，如已到截止，就停止补派、做最终备份并正常关机。这不是06:00强制中断正在施工的书。若队列提前全部完成，停止补派，保留一次06:00之后的保存/验收复核与关机检查。

## 每次定时处理

1. 读本页、HANDOFF最新节、`拆书工作区/派工队列.json`，遵从用户之后的新指令。`overnight`含授权、cutoffAt、batchId和batchWorkIds。先 `node scripts/book-dispatch-status.mjs`，结合各书运行状态、进度、真实进程和最终交付确认。不得把旧PID复用当作会话存活。
2. 全局最多3个本项目反重力拆书任务。活跃批次三书未全部正式completed，不补其他新书；已完成书可先简验入库，继续等同批剩余任务。对needs_attention/worker_error先核对实际原因，少量工具/格式问题自行修复，保留断点；`pwsh -NoProfile -File scripts/start-antigravity-book-agents.ps1 -Count 3`只恢复同批空槽，整批完成且未到截止时才建立下一批。不调用旧CodeBuddy启动器。
3. 原文/交接ZIP/提示词校验由准备脚本完成。新书使用 `.local/antigravity-run/book-<order>`真实短目录，旧目录保留、队列记originalWorkspace，书目根下有当前扫描入口。弱角使用已有Tomozaki-work。以work_id、输入SHA和卷/正文身份确认同书，不按目录名重复派工。worker使用修复后的权限模块，正常与转义路径/URL/日志标签不误判；只允许本书工具请求。
4. 验收先 `pwsh -NoProfile -File scripts/scan-book-reviews.ps1`，按SHA跳过已判同包，旧公女等历史包不续审。只看受限Markdown、适用分组标签、协议、同版正文/目录/资源与导入安全；不深审内容、阅读质量、标签/证据语义。`partial`只作内部断点，不阶段入库。`completed`也须有真实完整包和回执，不能只按自报放行。JSON≤32MiB、整包解压≤512MiB，ZIP本身不是32MiB限制。少量格式/交付元数据问题接收方修，保留原包和修订SHA，不改已入库内容。
5. 为本次接收创建项目内唯一`.local`审计目录，执行 `node --disable-warning=ExperimentalWarning scripts/review-book-batch.mjs <审计目录>`。它只检查当前batch、排除已正式completed书，选择完整交付最新ZIP，生成format-review.json；人工核对选中的具体文件、SHA、进度/回执，必要时修改本轮审计脚本/JSON绑定修订包。已有awaiting_import的同SHA结果沿用reviewReport，避免重复审。warnings/errors需在导入前实际处理，不能改报告伪造通过。
6. 正式应用在用时延后正式入库，不强退或覆盖用户编辑，记awaiting_import及reviewReport。空闲时执行 `node --disable-warning=ExperimentalWarning scripts/import-reviewed-books.mjs <审计目录>`：一致备份、隔离演练、基线/手改/正文身份检查，再正式导入。已有卡须保留原内容；需要改旧卡则本轮先保留基线，不盲目接受覆盖。随后 `node --disable-warning=ExperimentalWarning scripts/index-reviewed-books.mjs <审计目录>`（含封存卡、不解除封存），`python -B -X utf8 scripts/publish-reviewed-books.py <审计目录>`同步状态/基线/原文标记/回执/队列，保留夜间automationPaused=false。泛化publish脚本禁止partial接收。
7. 实际命令、各包ID/SHA、修复、备份、统计、索引写入HANDOFF和docs/acceptance.md，重做 `node scripts/package-source.mjs` 及release/NovelStudio-0.1.19-SHA256.txt，安装器和规范包摘要不得变化。不得用旧finish脚本写回“两小时/CodeBuddy/解除暂停”等过时状态。
8. 读取每会话状态的quotaAtEndFile，比对当前批派发前基线与最后一条结束快照。内置/usage不消耗模型turn，每个worker结束自动采一次。统计包含失败重试；共享额度和reset_time变化须如实说明，不伪称单书精确账单，不把缓存token当同价新输入。保存比较文件，不为查额度频繁开模型。

## 截止与保存关机

若已到06:00，当前批完整成品已交齐且格式通过，只因正式应用在用而awaiting_import，用户的保存关机授权允许先正常CloseMainWindow并等待保存退出，再完成pending导入/索引；不强退，不能跳过手改冲突或伪标完成。

整批三书的队列state全部completed后，在`overnight.lastBatchAcceptedAt`写当前绝对时间。若当前已≥cutoffAt，**不能调用下一批派工**。先正常关闭Novel Studio（如在用，CloseMainWindow并等正常退出；不能强退或丢编辑），完成仍待入库的验收/索引，再 `node --disable-warning=ExperimentalWarning scripts/backup-night-library.mjs <关机审计目录>` 导出最终一致备份。保存项目文档、源码ZIP及校验清单，将`finalBackup`、`finalBackupSha256`绑定这份最终备份，`shutdownReady=true`。如果有正在运行的本批任务、未接收成品、用户手改冲突或应用不能正常保存退出，不得把准备状态伪设为true，保留并处理实际阻碍。

调用Automations工具停止/删除本夜间自动化，防止下次开机误补派；记录该操作。先 `pwsh -NoProfile -File scripts/finish-night-dispatch.ps1` 查看条件（仅检查）。条件齐全后，用户已明确授权，无需再询问，执行 `pwsh -NoProfile -File scripts/finish-night-dispatch.ps1 -Shutdown`。脚本核对截止、整批正式完成、无在跑任务、正式应用关闭、最终备份SHA与发布摘要，再落盘shutdown-receipt.json并使用`shutdown /s /t 0`。不带/f，不用/t>0（Windows会隐含强制关闭）。若系统被其他未保存窗口挡住，不能改成强制关机。

若整批完成时尚<06:00且仍有队列，正常派下一批，再90分钟；若仍在跑按进度调间隔，通常90或120分钟，快收尾20/30。06:00后未完成的当前批可断点续作，完成后即保存关机；不开始新书。用户后续叫停/撤销关机时优先遵从并更新队列授权和自动化。


## 23:45最新额度回退授权

正常使用Gemini 3.8 Flash low；遇额度限制先查询内置/usage，按真正阻断的bucket（若周与五小时都用尽，取较晚刷新）判断。刷新在30分钟内时保存断点和retryNotBefore，调整下一次heartbeat到刷新后，不在Codex里阻塞等待、不连续重试。更久、额度不可用或无可靠短期刷新时，转CodeBuddy，先hy4free（用户说的hy4按本机已提供的免费档优先），hy4额度不可用再deepseek-v4.1-flash low（此前默认DeepSeek）。不再按旧规则自动转hy3。

先确认原书会话停止、保留所有施工文件和ID，再 `node scripts/apply-book-quota-policy.mjs <work_id> [Gemini额度快照JSON]`，它记录quotaHistory、engine/model、等待时间及新批次默认提供方；之后仍用 `pwsh -NoProfile -File scripts/start-antigravity-book-agents.ps1 -Count 3`，启动器按job.engine选择反重力或CodeBuddy worker，共享同一全局三槽与批次截止。CodeBuddy不能加载Gemini会话，切换从文件断点续作；同CLI才尝试会话恢复。已知Gemini刷新时刻到达后新派可恢复Gemini；不打断健康活跃会话。

DeepSeek也无额度时保存断点，按它真实刷新时刻等待（未知则下次定时复核），不要偷偷使用hy3或无限付费重试。CodeBuddy限额状态同步已阻止旧hy3自动分支；权限路径采用同一已修复解析器，DeepSeek调用才添加用户专属完整任务原句。两种provider的用量/额度分别记录，不把Gemini共享五小时/周余额当作CodeBuddy账单。06:00批次截止和保存关机条件保持不变。


## 02:49额度信号识别修复

提供方额度限制只从RPC错误/异常或提供方结构化errorMessage字段识别；原文、工具返回和制卡规范里出现“额度耗尽”是普通资料，不是配额信号。原worker扫描整个日志尾部导致真正伙伴假限额停止，已修复；真实账户余额仍有时不应用回退策略。当前批两本已接收，真正伙伴只恢复原任务收尾，临时30分钟检查，不派其他新书，等整批完成再按截止规则处理。


## 2026-11-12 06:10 最终保存及正常关机准备

截止后`node scripts/book-dispatch-status.mjs`确认25/25部completed、active为空；提升权限实际进程检查无正式程序或拆书worker。25份正式接收包SHA一致，正式1616张卡/当前向量1616、278卷、1,110,178正文块及封存状态复核通过，quick_check=ok、foreign_key_check零行。没有派新任务或重复导入。审计`.local/night-final-20261112-0606`。

`node --disable-warning=ExperimentalWarning scripts/backup-night-library.mjs .local/night-final-20261112-0606`已导出最终一致备份`D:\Vibe Coding\Novel Studio\.local\night-final-20261112-0606\final-library.zip`。ZIP SHA-256 `f096ef93aa8d202afbef5e1b76716949b6e36954995c9ffcfa31718f8798c935`；其中数据库SHA-256 `cc9f0beac1a323f4e78907d8939b3f0bbc4320d5da90712ae325c8b7b91506bb`。ZIP CRC及manifest/database摘要验证通过。修正了该维护脚本回执原先将BackupService返回的数据库摘要误作ZIP摘要的问题：现在分存databaseSha256和sha256；备份内容未改，真实ZIP摘要用于关机保护。

Automations工具已成功删除novel-studio，deleteStatus=deleted，不再自动派工。队列绑定真实最终备份、截止后复核时间、shutdownReady=true。保存文档后执行`node scripts/package-source.mjs`、重算发布清单，核对源码CRC/文档字节、安装器和规范包SHA不变。随后`pwsh -NoProfile -File scripts/finish-night-dispatch.ps1`检查，再以`-Shutdown`执行已授权`shutdown /s /t 0`，不强退。实际请求以`.local/overnight-dispatch/shutdown-receipt.json`为准，本文不声称已观察到断电。下次开机等待用户新指令。


### 06:10正常关机请求失败，未强制关机

`pwsh -NoProfile -File scripts/finish-night-dispatch.ps1 -Shutdown`已调用不带/f的`shutdown /s /t 0`，Windows因电脑锁定返回1271（The machine is locked and cannot be shut down without the force option）。没有切换强制关机或重复请求。25部全部完成、1616卡及向量、最终一致备份均已保存；novel-studio自动化已删除。队列/关机回执纠正为shutdownStatus=failed_locked、shutdownAttemptedAt，移除易误解为成功的shutdownIssuedAt；保持停止派工/暂停，下一步等用户解锁后手动正常关机或另行指示。实际未关机，不能声称已断电。
