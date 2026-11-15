# 维护地图

2026-11-15整理，正式0.2.11，已按用户后续授权从0.2.10升级。当前版本、证据与待办以[HANDOFF](../HANDOFF.md)顶部为准；产品术语在[CONTEXT](../CONTEXT.md)，操作在[README](../README.md)，构建部署在[发布清单](release-checklist.md)。旧版流程与夜间日志已[原文归档](history/maintenance-20261115-整理前.md)，不是当前任务。

## 代码入口

| 任务 | 入口与责任 |
| --- | --- |
| 桌面壳/IPC | app/main/index.mjs、preload.cjs：资料目录、启动、IPC白名单、备份和服务装配。 |
| 应用导航/主题 | app/renderer/App.jsx、app.css、preferences-model.mjs：导航、共享controller、主题、滚动条与短卡网格。 |
| 原创写作 | Writing.jsx、ManuscriptDirectory.jsx、WritingResources.jsx、writing.css；app/main/writing.mjs管理正文/版本/恢复稿/资料/标记。 |
| 编辑布局/恢复位置 | writing-session.mjs、PanelResizer.jsx：正文位置、折叠状态、侧栏宽度；保留同一layout中的其他字段。 |
| KB v2存储/召回 | app/kb-v2/store-v2.mjs、search-v2.mjs、text-index.mjs：独立参考库、三层实体、全文/语义召回和游标分页。 |
| 检索AI | app/kb-v2/retrieval-v2.mjs：fast/deep；Conversation.jsx显示问题、筛选、结果和分页。 |
| CLI来源/传输 | app/kb-v2/agy-provider.mjs、agy-client.mjs；RetrievalPreferences.jsx配置检索/扩写用途各自来源。 |
| 创作助手 | app/main/assistant.mjs管理按书会话/MCP/记忆/检索任务，Assistant.jsx提供共享controller与两个入口。 |
| 三入口只读检索worker | assistant-search.mjs、assistant-search-worker.mjs：普通参考页/写作侧栏/助手共用一个有界FIFO，最多一个重扫描；只读查库、精确向量评分、异步桥接embedding/AI。长期worker保留游标，取消/库或配置变化后旧游标显式失效。 |
| 阅读格式/卡片 | assistant-presentation.mjs为每轮提示格式指导，assistant-markdown.mjs只转显示；ui.jsx、card-preview.mjs、CardContent.jsx保留短预览/完整卡分工，Reference.jsx负责详情与原文阅读。 |
| AI扩写 | ExpansionDialog.jsx、app/main/expansion.mjs、expansion-provider.mjs：选区、有限上下文、预览与采纳；来源独立。 |
| 数据库备份/昂贵读取 | app/main/store.mjs、backup.mjs：原创库与双库一致备份恢复、失败回退；sqlite-tasks.mjs/sqlite-worker.mjs执行快照/校验/原创查找/索引读取，主进程保留独占换库与单写者。不含配置或助手文件。 |
| Windows发布 | scripts/build.mjs、release.mjs、setup.nsi、package-source.mjs、upgrade-windows.ps1；图标用app/assets及embed-windows-icon.ps1。 |
| 旧版兼容 | app/main/protocol.mjs、reference.mjs、search.mjs、retrieval.mjs及拆书规范包；不能当当前v2导入/检索实现。 |

## 资料和迁移

- 本机正式资料C:\Users\78828\AppData\Local\Novel Studio；程序C:\Users\78828\AppData\Local\Programs\Novel Studio。升级脚本依赖LOCALAPPDATA，沙箱可能重定向，正式处理须显式核对实际路径。应用版本以resources/app/package.json为证，快捷方式目标独立检查。
- 原创library.sqlite，正式参考reference-v2.sqlite；旧共库reference_*表停用保留，不为清理重写原创库。retrieval-api.json/expansion.json为既有配置与加密凭证，retrieval-provider.json/expansion-provider.json各自保存来源与模型。
- assistant-books/<work_id hex>/包含AGENTS.md、chat.json、session.json及无正文诊断日志；反重力自身CLI历史不在此复制。记忆写入保留.previous，作者确认与模型建议须区分。
- 应用导出ZIP为数据库一致备份，v2支持双库；旧格式只代表旧共库。配置/凭证、模型、助手文件和Chromium本地布局偏好需另行保留。完整资料目录备份需正常退出后复制并核验；原地拷贝运行中的SQLite不能当一致快照。
- 恢复先核验时点和资料范围，保护当前全目录与WAL/SHM；不单独覆盖library.sqlite而忽略参考库及后续新稿。正式改动按本次授权，先隔离验证，再备份与处理。
- 正式embedding.json引用.local/model；Vulkan运行库在正式runtime/llama-cpp-vulkan，CPU回退和180秒闲置卸载保留。npm start默认.local/dev-profile，所有QA和实验显式隔离NOVEL_STUDIO_DATA_DIR。
- .local存有模型、MVP成果、多个版本的备份/截图/测试/NSIS等；2026-11-12“清理后仅三目录”只是当时快照。原文保留/、拆书工作区/的原档与关键备份仍受保护；先确认真实引用，不整目录清理。

## 协议和知识库

现行三层为档案切面、全书顺序Scene Ledger、原文段落窗口。知识卡是查询结果的阅读形态，content仍为字符串；引用绑定作品、正文版本与稳定段落。KB v2卡只读，旧标准ZIP导入在v2隐藏且IPC拒绝，新增数据需在专用建库流程按新授权隔离验证。

历史86部入库结论限已有结构/一致性检查，不能当全文内容完备或任何查询穷尽证明。结果页短预览/网格不改原卡、召回、排序、候选上限或分页，不自动增加外部请求。建库方向历史见[方向评估](知识库方向评估.md)，现行实现入口以本表为准。

## AI来源与调用边界

检索source为auto/api/agy，扩写使用独立来源配置；检索本地模式不生成。auto优先已配置接口，无配置可使用本机反重力；API模式不会静默切换账号。模型通过CLI动态枚举，刷新不发送小说；固定句测试不等于所有模型可用。子进程不导出登录凭证，不提供对外HTTP反代。

传输只回收本客户端拥有的进程树，取消/异常后清理再建会话；仅未发送prompt的会话初始化数据库锁允许一次重建，生成/工具/记忆写入不自动重放或换模型。排队取消不得外发；不能因插件告警擅自改登录、CLI或全局MCP。

## 按书创作助手

助手读取本书资料并委托既有检索AI，不在Electron主线程同步扫全库向量。先MCP tools/list握手，再发送提示；本书资料和记忆工具隔离，参考只读。reference_search立即提交jobId，reference_result单次最多8秒领取；running继续领，done才能汇总，未领取不能伪完成。任务按书/回合隔离、去重串行、最多20条，取消联动worker及内部请求，不跨进程续跑。

当前期限：助手生成600秒、模型无进展150秒；含检索AI的worker任务360秒，纯本地60秒。受控工具进行中保持活动。旧“同步检索工具150秒”描述属于0.2.6历史，不应用作当前任务总期限。网络辅助只搜索词，当前Bing RSS摘要不等于网页全文读取。

worker须单独打包ESM bundle并带createRequire banner；仅源代码单测不能代替安装版检查。qa-assistant-responsiveness.mjs <隔离EXE> <只读库>使用本机模拟检索AI及合成向量，不能误写成真实模型测试。

每工作区cli-events.jsonl仅含时间、模型、状态/错误码/耗时，256KiB轮换，不含正文/密钥。诊断应区分上游容量、传输、工具与检索，不把单次成功说成永久恢复。

## UI与验收

- [当前UI约定](assistant-ui-brief.md)与[阅读体验](阅读体验优化.md)说明自适应对话、按需记忆面板、侧栏拖动、GFM/长表、短卡与6px滚动条。
- qa-readability、qa-assistant-experience、qa-assistant-layout支持隔离EXE；qa-card-markdown/card-viewer/retrieval验证完整卡及证据，qa-writing-regressions验证正文保存。按改动选，不因文档维护重跑外部模型。
- 可见不抢焦点showInactive窗口/native capture用于有效截图与测量；隐藏窗口的旧帧不能作为当前视觉证据。截图自查不是全主题对比度认证。真实小说外发需对应范围授权，优先合成验收。

## 给外部 Agent 准备原文

此标题保留供旧链接定位。原九类拆书包、派工目录及27部阶段说明见[历史维护地图](history/maintenance-20261115-整理前.md)。不自动执行旧派工，新增v2交付先确定本次协议、路径、work_id和SHA，再独立验收与正式导入。

### 扫描外部交付与标记原文

旧九类ZIP流程使用scripts/scan-book-reviews.ps1按ZIP SHA跳过已判定包；仅在用户通知对应兼容交付时适用。接收、验收、导入和索引分别记录，不将脚本存在或外部Agent报告写成独立验收通过。

## 0.2.11稳定性维护入口

- agy-client.mjs提供异步EXE/系统代理发现；operation.mjs统一操作ID、总截止与可取消启动FIFO，启动槽只覆盖初始化/建会话，不跨生成和工具等待持有。provider提交时固定配置，出队与prompt发送前校验，已发出的生成不自动重放。旧同步发现导出仅留兼容，不用于正常发送路径。
- 普通与助手查询均用AssistantSearch的有界队列（20项），worker保留24个分页状态；库/模型配置变动或线程退出使旧游标过期。不静默退回主线程全量扫描。备份维护窗口暂停新操作，abort后await检索/SQLite任务句柄退出再换库。应用退出也先完成持有资源的回收。
- assistant-jobs.mjs分离本轮queued/running任务，入队前检查容量，book/turn/job同时约束领取。sourceVersion/messageVersion及partial尾部减少忙时轮询；单飞完成后再延迟1秒，闲置不轮询，活动视图处理重Markdown。
- writing.checkpoint仅传id和expectedRevision，服务端建立原有历史边界；有脏稿仍走stage/save全文与版本/标记保护。主题首帧用appearance.js读取既有偏好，window-appearance.json只保存light/dark/system供原生窗口背景使用。
- 复跑命令与真实范围见[本轮记录](audits/20261115/实施与验收记录.md)。0.2.11候选验收后，用户已另行授权并完成正式升级；发布与安装前后保护证据见HANDOFF顶部。真实模型抽验只使用新造合成作品/固定句，不扩大旧正文外发许可。
