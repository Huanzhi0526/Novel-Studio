# Novel Studio 协作规则

## 接手入口与当前基线

- 工作区`D:\Vibe Coding\Novel Studio`；先读[HANDOFF当前快照](HANDOFF.md)、[产品术语](CONTEXT.md)、[维护地图](docs/maintenance.md)、[发布清单](docs/release-checklist.md)及[最新验收](docs/acceptance.md)。接手提示词在[这里](docs/开发与运维接管提示词.md)。
- 2026-11-15已发布0.2.10，当前main包含Claude方案、Gemini前端实现及Codex复核补修；源码/锁文件/正式安装应用版本一致。实际仍须核对package.json、package-lock.json、正式resources/app/package.json，快捷方式目标另记，不能用Electron EXE版本代替应用版本。
- 原创、参考检索、主动AI扩写、按书创作助手职责分开。正式参考为独立KB v2；旧九类卡/ZIP流程为兼容历史，不能套用到v2生产流程。历史书库统计和覆盖结论以HANDOFF注明的时点与检查范围为准。

## 数据与执行边界

- 正式资料`C:\Users\78828\AppData\Local\Novel Studio`，正式程序`C:\Users\78828\AppData\Local\Programs\Novel Studio`。原创library.sqlite、参考reference-v2.sqlite、配置与凭证、assistant-books聊天/记忆均需保护；Git分支不隔离数据库。
- npm start默认.local/dev-profile；测试显式指定隔离NOVEL_STUDIO_DATA_DIR。正式处理先复现、正常退出/一致备份、隔离验证，再按当次用户授权操作；不得整库覆盖、清原创、重编号正文证据或自动重算现有向量。
- .local/model、正式embedding.json引用的资源、原文保留、拆书工作区原档和关键备份不随意清理。.local内包含历史与活跃资料，不能依据旧“已清理”快照整目录删除。旧发布件保留；时点备份不能无条件恢复覆盖新稿。
- 旧夜间轮转、定时自动化及关机授权已结束；旧MVP“main只读”和只讨论边界已被后续具体任务接续，不能当永久禁令，也不能把一次实施/发布授权扩大为未来任意迁移或外传许可。用户说“只讨论”时只读，另有具体实施任务按新范围执行。
- 不主动派工、恢复自动化、升级CLI、改全局登录/MCP或强制关机。外部交付先确认当前协议、work_id/路径/SHA；九类结果扫描是历史流程，只在对应授权交付适用时使用。

## AI与交互维护

- 模型来源按用途隔离：retrieval-provider.json、expansion-provider.json与原API配置/凭证分别保存。模型动态枚举；失败不自动换模型或重放已发出的生成。连接验收优先合成文本；历史两项真实小说重放许可不自动扩大。
- 创作助手只在用户主动聊天时提供本书相关资料，不自动发送章节全文；按书工作区assistant-books/<work_id hex>/使用AGENTS.md、chat.json、session.json，不新建记忆数据库。CLI会话仍由反重力维护，专用MCP限制本书与只读参考。程序全目录备份含助手目录，应用数据库ZIP不含它。
- 助手reference_search委托现有检索AI并立即提交任务，reference_result领取done后再汇总；未领取不能伪完成。取消传播内部任务/worker，失败/本地回退明确显示，不用空选择全部放行。检索扫描在独立只读worker，禁止主线程同步全库向量扫描。
- 只回收本客户端拥有的CLI进程树；MCP tools/list就绪再发送提示，工具/无进展/总回合期限分开。无正文诊断日志不写密钥、提示或原文。具体期限与代码入口见维护地图。
- 独立助手与写作侧栏共享App controller，按书隔离草稿/会话；侧栏调宽保存在writingSession.layout.drawerWidth，折叠左栏保留它，缩窗不覆盖偏好。显示格式转换与短卡预览不得写回聊天、原卡或证据。见[阅读体验](docs/阅读体验优化.md)与[当前UI约定](docs/assistant-ui-brief.md)。

## 常用命令与交付

- npm run build；npm test；npm start。桌面验收使用scripts/qa-*.mjs并按变更选择，传入隔离安装EXE时仍用隔离资料。qa-readability、qa-assistant-experience、qa-assistant-layout覆盖当前阅读与侧栏；qa-card-markdown/card-viewer/retrieval覆盖详情与证据。
- Windows打包npm run package:windows，本机NSIS在.local/nsis-official/nsis-3.13/makensis.exe；按发布清单完成隔离安装、正常备份、正式升级与资料摘要保护核验，再交安装器、源码ZIP及SHA清单。
- 每阶段同步HANDOFF和相关验收，区分实现/验证/提交/部署与NOT_RUN。文档维护不自动升版本或重装：同步当前源码包与SHA，安装器摘要保持不变。文档内旧时点结论明确标历史，不当现库或质量证明。

## 历史记录

[整理前规则原文](docs/history/AGENTS-20261115-整理前.md)保留历次授权/保护背景；[Claude专项台账](CLAUDE_前端体验优化交接.md)保留方案、Gemini交付和Codex独立验收。两者均不生成新的施工或派工任务，当前进度只写HANDOFF。
