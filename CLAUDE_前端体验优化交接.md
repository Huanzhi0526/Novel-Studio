# 给 Claude：Novel Studio 前端、交互与使用体验优化交接

更新时间：2026-11-15。本文由 Codex 准备，供 Claude 理解、审查、开发和填写交接记录；不是已经完成的设计评审。

## 1. 本次任务与交付方式

用户希望你审查整个软件的前端、交互和使用体验，并实施有价值的改进。重点是让作者更容易理解、阅读和操作，而非只替换配色或增加装饰。可以重新组织界面和组件，不必照搬现有排版；保持已存在的功能与数据语义。

这次由用户手动把工作交给 Claude，完成后再由 Codex 独立验收、合并与发布。不要自行合并 main、覆盖正式程序、迁移正式资料或派发其他 Agent。本说明本身不代表 Claude 已启动或任何评审已通过。

功能基线：main 的 `ccb1120`，应用 0.2.7。正式安装与源码/锁文件均已在上一轮核验为0.2.7；交接文档提交可能在此提交之后。开发前重新核对实际 Git 状态，以**包含本文的 main 最新提交**作为分支起点，在第9节填写真实基线。本文列出的历史测试成绩不算你本轮验收。

## 2. 先读这些入口

依次阅读：

1. [AGENTS.md](AGENTS.md)：项目约束与当前授权。
2. [HANDOFF.md](HANDOFF.md) 顶部当前快照：部署、真实验证、已知问题。
3. [CONTEXT.md](CONTEXT.md)：产品边界与术语，历史段落以最新快照为准。
4. [维护地图](docs/maintenance.md)、[验收记录](docs/acceptance.md) 最新部分、[发布清单](docs/release-checklist.md)。
5. [创作助手说明](docs/创作助手.md)、[最近的助手设计 brief](docs/assistant-ui-brief.md)：帮助理解刚完成的交互，不是限制你改进的最终设计规范。

旧 spec、拆书整改、夜间派工、关机和历史验收只作背景，不接续这些任务。现行参考库已经采用 v2，不能仅凭早期“九类卡/共库”的描述理解当前实现。

## 3. 产品是什么，作者怎样使用

Windows 本地 Electron 小说写作工作台，不是网站，也不是后台自动写书系统。

| 区域/旅程 | 用户的主要任务 | 应理解和保留的行为 |
| --- | --- | --- |
| 原创书架 → 写作 | 打开作品，组织分卷/章节，持续写作 | 输入自动暂存/保存，切换与关闭前保存，草稿恢复，历史、标记、撤销/重做 |
| 大纲/角色/设定与正文对照 | 边写边查看本书资料或另一章 | 当前书绑定、资料预览与编辑区分、侧栏关闭/打开、窄窗覆盖层与正文空间 |
| 参考库 → 卡片 → 原文 | 找案例，读卡，再核验证据 | 本地/快速/深度模式，作品筛选，参考卡、卷与同版段落身份，原文定位/返回 |
| 主动 AI 扩写 | 选中章节内括号提示，生成局部文字 | 预览、采纳、取消；采纳前不覆盖原稿，失败/取消不自动重写 |
| 创作助手 | 结合本书大纲、主旨与偏好讨论情节 | 先委托检索AI，再结合结果给建议；每本书自己的记忆与会话 |
| 写作右侧“助手” | 留在正文旁边继续讨论 | 与独立助手共享聊天、模型、按书输入草稿和停止操作，不是第二套会话 |
| 资料与设置 | 调整写作/阅读偏好，选模型，备份/恢复 | 来源/模型/强度的含义明确，API配置与账号CLI来源独立，敏感值不展示 |

参考是物理独立的 `reference-v2.sqlite`，原创在 `library.sqlite`。最近正式库基线86部/657卷；记录不等于内容质量或全库覆盖已被人工证明。

作者偏好的已知方向：中文长文易读、界面安静、信息有层级、常用功能容易找到、少打断写作。主任务优先于技术说明，必要的外传提示、失败状态和恢复入口仍应保留。不要擅自假设“所有功能都需要一步弹窗确认”或“所有信息都应一直铺开”。

## 4. 前端与行为入口地图

React 19.3.1、CodeMirror 6、esbuild、Electron 43.2.0；Node最低24.16.0。已安装依赖时直接沿用，不因视觉改版自动升级整个技术栈。

| 文件 | 负责什么 |
| --- | --- |
| `app/renderer/App.jsx`、`app.css` | 应用导航、页面容器、设置入口、弹层、主题变量、App层共享状态 |
| `OriginalBookshelf.jsx`、`BookCover.jsx`、`reference-bookshelf.css`、`book-cover.css` | 原创/参考书架相关构图、书籍操作与封面；以组件实际引用关系为准 |
| `Writing.jsx`、`writing.css` | CodeMirror、保存/切书/关闭流程、编辑工具、扩写与侧栏集成 |
| `ManuscriptDirectory.jsx`、`manuscript-directory.css` | 分卷章节树、筛选、折叠、导航 |
| `WritingResources.jsx`、`writing-resources.css` | 大纲/角色/设定/章节对照与写作右侧工具条，含助手入口 |
| `Conversation.jsx` | 参考检索对话；写作侧栏与参考库入口 |
| `Reference.jsx`、`reader-workspace.css` | 参考书架、卡片展示/编辑、原文阅读与证据跳转 |
| `CardContent.jsx`、`card-content.css`、`ui.jsx` | 受限Markdown、知识卡、通用按钮/图标/弹层/错误提示、renderer API包装 |
| `Assistant.jsx`、`assistant.css` | 助手独立页和紧凑侧栏；导出的 `useAssistantController` 在 App 中只建一份 |
| `ExpansionDialog.jsx`、`expansion-dialog.css` | 选区扩写预览、采纳/取消的交互 |
| `Preferences.jsx`、`RetrievalPreferences.jsx`、`workspace-settings.css`、`expansion-preferences.css` | 写作/阅读/主题偏好、模型来源及API配置 |
| `writing-session.mjs`、`app/shared/expansion-selection.mjs` | 导航/光标等状态与扩写选区语义；改动前确认调用方 |

边界入口：`app/main/preload.cjs` 只暴露受控 invoke；`app/main/index.mjs` 注册IPC。原创行为在 `app/main/writing.mjs`，扩写在 `expansion.mjs`，助手在 `assistant.mjs`；助手检索worker在 `assistant-search*.mjs`，v2检索在 `app/kb-v2/`。这些可读来理解状态，不把本轮变成后端/数据库/检索策略重构。

### 最近修复不能被界面重构破坏

- 助手 `reference_search` 提交任务，`reference_result` 领取结果；提交成功不等于检索完成，未领取结果不保存为完整答复。
- 内部检索AI与创作助手可以选择不同模型。显示真实的准备/查库/等待/整理/失败，不能把本地回退冒充AI筛选成功。
- 主线程不能同步扫描全库向量。关闭侧栏或换页不自动取消主动发起的任务；“停止”须取消本轮及内部请求。
- 两个助手入口共享同一 controller；不能因组件挂载/卸载创建第二个请求、丢草稿、切错书或取消用户任务。
- 用户上翻看历史时不持续强制滚回底部。IME输入不能误触发送；目前Ctrl+Enter发送、Enter换行，可优化但要解释变更并验证。
- 保留可见的失败原因；未完成流式文字与正式回复区分。旧参考卡不能残留为新一轮结果。

## 5. 数据、运行与外传边界

**正式目录只读保护**：

- `C:\Users\78828\AppData\Local\Novel Studio`：原创、参考库、配置、加密凭证与助手文件。
- `C:\Users\78828\AppData\Local\Programs\Novel Studio`：正式安装程序。
- 桌面“小说工作台”快捷方式保持不动。Electron EXE文件版本不是应用版本，应用版本看 `resources/app/package.json`。

**不可清理/覆盖**：`.local/model`、既有备份/验收、原文档案、`原文保留/`、拆书工作区、已有release安装器/源码包/SHA。不要整库复制覆盖正式资料、重算向量、重拆书或恢复旧卡。

开发、演示与截图用合成资料或项目已有公版fixture。不要读取正式原创来填充展示稿，不把原文、用户聊天、API Key或带敏感内容的截图提交Git或上传外部。过去的两项真实小说检索验收许可不延续为本轮任意正文外传许可。模型功能测试优先mock；确需真实外部调用时使用新建合成文本并记录来源/模型。

Git分支只隔离代码，**不能隔离数据库、凭证、模型与CLI历史**。`.local`和正式库均不入Git，分支不能用来回滚它们。

默认 `npm start` 使用当前源码根目录的 `.local/dev-profile`。建议显式指定本轮专用目录：

```powershell
npm run build
$previousProfile = $env:NOVEL_STUDIO_DATA_DIR
try {
  $env:NOVEL_STUDIO_DATA_DIR = Join-Path (Get-Location).Path '.local/claude-frontend-ux/profile'
  npm start
} finally {
  $env:NOVEL_STUDIO_DATA_DIR = $previousProfile
}
```

不要将环境变量指向正式目录。Codex沙箱中的LOCALAPPDATA可能被重定向，不用它推测正式真实路径。测试安装版也必须使用隔离资料目录。

## 6. Git协作与推荐步骤

使用独立分支，推荐独立worktree，避免在共享main目录里切分支影响另一位开发者。以下是给你的命令模板，本轮Codex没有执行创建分支/worktree：

```powershell
# 在原项目根目录，只在确认分支名/目标目录未被占用时执行。
git status --short
git log -1 --oneline
git worktree list
git worktree add -b feat/claude-frontend-ux .local/worktrees/claude-frontend-ux main
Set-Location '.local/worktrees/claude-frontend-ux'
```

若目标已存在，先检查现有分支和未提交内容，不强制重置或删除。新worktree不带原目录的node_modules、dist、私有.local模型/数据库；需要依赖时在worktree运行 `npm ci`，Electron缺失才按发布清单执行setup。不要在两个目录交替修改同一份功能。

推荐推进：

1. 核对版本和实际界面，用合成书走一遍第3节所有旅程，记录问题的触发条件与影响。
2. 提出少量高价值改进，按P0数据/操作风险、P1主流程阻碍、P2可读性/一致性、P3润色分级。先修高影响项，再统一视觉，不将建议写成已实现。
3. 写简短设计方向：信息层级、导航/布局、文字和留白、主题、侧栏/窄窗、键盘。主页面与侧栏可以不同密度，但操作含义一致。
4. 重要路线或新组件库选择前查成熟开源实现/官方资料，记录链接、可复用部分、许可证和取舍。优先现有组件/CSS，避免为视觉引入完整新框架。
5. 分批实现并提交有意义的commit，填写第9节。可修改必要的前端状态、IPC消费/绑定和对应测试；涉及后端契约、CLI调度、模型提示词、权限或数据库变更时，先单列原因和范围供用户/Codex确认，不夹带到样式提交。
6. 用实际截图复核，验证受影响旅程。结束写清真实结果、未完成项、提交与恢复方式，停止改动后交还用户；不要在Codex开始验收后继续写同分支。

不要为了让旧测试变绿而删除行为断言。可调整因文案/布局改变而过时的定位器，记录原因；保存、证据、取消等行为保护不能随之移除。

## 7. 验收清单与现成命令

按改动选择检查，先构建。使用真实运行界面评审，不以代码存在、静态效果图或服务启动当验收通过。

```powershell
npm run build
npm test
node scripts/qa-writing-workflow.mjs
node scripts/qa-writing-regressions.mjs
node scripts/qa-workspace-ui.mjs
node scripts/qa-assistant.mjs
node scripts/qa-assistant-experience.mjs
node scripts/qa-expansion.mjs
node scripts/qa-retrieval.mjs
node scripts/qa-card-viewer.mjs
node scripts/qa-card-markdown.mjs
```

不是要求每次全部运行：写作变更优先写作工作流/回归，助手变更跑assistant与experience，卡片/阅读变更跑viewer/markdown，通用布局/导航改动再覆盖workspace/desktop。脚本的安装版参数、fixture和报告位置先看脚本及发布清单；部分旧QA会复用固定的.local测试目录，先保留已有报告或改为本轮专用输出，避免把旧证据覆盖成新成绩。

`qa-assistant-experience.mjs` 使用合成长中文讨论，覆盖独立页、侧栏、窄窗及共享草稿；不调用外部模型。原生截图需要刷新当前帧，隐藏窗口普通截图可能超时或取得旧帧；项目已有showInactive、双requestAnimationFrame、capturePage流程可复用。短暂展示测试窗口后恢复，不保留后台测试进程。

应覆盖：

- 默认宽窗、约980px窄窗和最小可用窗口；长书名、长段落、列表、引用、长错误和空数据。
- 已有五种主题，以及写作白纸/米纸/护眼/夜写等偏好；不把写作纸张颜色当整站深色主题。
- 正常/空/加载/长等待/失败/取消状态；不能让失败提示盖住停止或恢复入口。
- 鼠标与键盘、Tab焦点、Esc、中文输入法；焦点恢复、滚动位置和当前书身份正确。
- 未采纳扩写不改正文；切换/关闭不丢草稿；两入口助手不重复发送且按书隔离。
- 卡片回到正确作品/卷/正文版本/段落，关闭原文能回到原位置；受限Markdown不扩成任意HTML。
- 无横向溢出、遮挡、失效点击区、焦点陷阱；禁用状态、按钮反馈、字号/行距/对比度可读。

前端改版不需要为了交接自动改版本号、打包或升级正式版。打包/迁移/正式发布由Codex合并验收后按清单完成；任何测试没跑写 `NOT_RUN`，模型服务忙不能改写为前端验收成功。

## 8. 交回Codex前的要求

- 提交代码、必要文档与本说明里的记录，分支无未提交改动；私有截图/报告可留本机被忽略目录，在下表标准确路径。不能用 `git add -f` 把数据库、密钥、原稿或模型塞进去。
- 给出真实分支、worktree路径、基线、HEAD、commit列表及建议审查顺序。不要只写“都做好了”。若重命名/拆分组件，附旧→新映射。
- 与当前main的差异用 `git diff --stat main...HEAD` 和 `git log --oneline main..HEAD` 核对；main可能前进，发现冲突保留现场并说明，不覆盖他人的代码。
- 总结改变了什么、为什么、行为是否变化、怎样验证、风险/未完成项。列出依赖/IPC/偏好存储键/快捷键是否改变，未涉及也明确写“无”。
- 向用户说明开发已停写、等待Codex独立验收与合并。分支内改动可用分支/commit回退；隔离资料只能保留或从本轮自己的备份恢复，不能拿Git恢复正式库。

Codex接手时先检查你填写的记录与实际diff，独立重跑对应检查，再决定合并及发布。你的自评、截图或测试报告不能代替独立验收。

## 9. Claude持续修改记录（由Claude填写）

保留本说明前文，按实际阶段追加；不要填造未执行的结果。当前均为**待Claude填写/未开始**，不是已经确认的缺陷。

### 9.1 接手与分支

| 项目 | 实际值 |
| --- | --- |
| 接手时间 | 2026-11-15 03:38（UTC+8） |
| 工作目录/worktree | `D:\Vibe Coding\Novel Studio\.local\worktrees\claude-frontend-ux` |
| 开发分支 | `feat/claude-frontend-ux` |
| 实际基线commit / 版本 | `main@76e6f98`（功能基线 `ccb1120`，`package.json` 版本 `0.2.7`） |
| 本轮目标与明确不涉及项 | 按已确认的 [CLAUDE_前端体验优化执行方案.md](CLAUDE_前端体验优化执行方案.md) 分批实施 B0–B11（D1–D6、P1–P3）；仅涉及 `app/renderer/**`、必要 `app/shared/` 纯函数、测试、QA定位器与说明文档；**不涉及** `app/main/**`、`app/kb-v2/**`、IPC名称与参数、数据库、检索策略、提示词、CLI调度、权限、依赖升级、正式资料与正式安装版 |
| 隔离资料与证据目录 | `D:\Vibe Coding\Novel Studio\.local\worktrees\claude-frontend-ux\.local\claude-frontend-ux\`（每批独立时间戳子目录，内含 `profile/` 与 `shots/`） |
| 当前HEAD / 开发是否停写 | 开发进行中（B0 提交后继续按 B1–B11 推进） |

### 9.2 审查发现与取舍

| 编号/优先级 | 页面与复现步骤 | 对作者的影响 | 拟改方案与理由 | 状态/实际commit |
| --- | --- | --- | --- | --- |
| P1-1 | 参考库（KB v2）打开知识卡弹窗 → 点击“编辑” → 保存时报 `KB_V2_READONLY` | 误以为卡片可改，填写后保存失败形成死路 | `CardEditor` 增加 `editable`（`!info?.kbV2`），v2 隐藏“编辑”并说明只读，v1 保留 | 已完成（`bd99363`） |
| P1-2 | 多卷原创作品首次从书架进入写作页，按跨卷 `position` 落到后续卷开头（实测落到“第10章 灯塔”） | 初次打开书目跳卷，打乱阅读与续写定位 | 新增 `orderedChapters(volumes, docs)` 按卷顺序展开章节，`chooseWork` 与页脚导航统一复用 | 已完成（`bd99363`） |
| P1-3（D1） | 写作页默认“跟随窗口”每行约 66 字，专注模式约 85 字 | 中文长行扫视疲劳 | 保留已有偏好；全新本机默认“限制宽度 680px”；专注模式始终居中可读列宽（`--writing-focus-measure`） | 已完成（B5，见 §9.3） |
| P1-4 | 全局根字号 13px，大量 9–11px 界面与菜单文字 | 阅读费力、层级混乱 | 建立 `--fs-meta(12px)` 至 `--fs-h1(22px)` 标尺，根字号升至 14px，消除 `<12px` 可见文字 | 已完成（B5，见 §9.3） |
| P1-5 | 创作助手忙碌时禁用输入框，回合完成后无条件清空草稿 | 等待期间无法记录下一句构思，或写了一半被清空 | 忙碌时仅禁用发送按钮并忽略 Enter；仅当草稿仍等于本轮已发文本时清空，失败保留草稿 | 已完成（`8bebfa8`） |
| P1-6 | 助手 controller 常驻每秒轮询 `assistant.get` | 空闲时持续 IPC 与重渲染开销 | 仅在 `pending \|\| state?.busy` 时轮询，切换作品/进入视图/发送结束时单次刷新，消息列表 `React.memo` | 已完成（`8bebfa8`） |
| P1-7 | KB v2 检索区显示九类“类别”下拉，实际仅作 3 组侧重加权且名称与卡片标签不一致 | 筛选预期偏差 | v2 改为“侧重”（不限 / 人物与设定 / 剧情场次 / 原文描写），同步设置页 v2 说明文案 | 已完成（`bd99363`） |
| P2-1 | 章节历史仅显示保存时间，点击即弹恢复确认 | 无法先核对版本内容与字数差异 | 列表展示字数与差值，点击先在抽屉内只读预览正文，再决定恢复或返回列表 | 已完成（B6，见 §9.3） |
| P2-2 | 写作工具栏两端分散、开关抽屉时按钮位移、缺少按下态与分组收纳 | 肌肉记忆受干扰、窄窗拥挤 | 工具栏左对齐固定顺序，合并“更多”分组菜单，标记/历史补 `aria-pressed`，窄容器收纳次要项 | 已完成（`e906e26`） |
| P2-3 | 左侧栏不可折叠；窄窗下普通抽屉无遮罩且 Esc 需焦点在抽屉内才生效 | 窄窗正文空间局促，关闭抽屉手势不一致 | 左侧栏支持折叠为 56px 图标条（持久于 `writingSession.layout.railCollapsed`）；非停靠抽屉统一遮罩与全局 Esc 优先级 | 已完成（`56019d2`） |
| P2-4 | 设置页模型来源与兼容 API 混排、两个保存按钮易混、缺少当前生效摘要、顶栏标题重复 | 不易判断当前实际生效的模型来源 | 顶部增加生效摘要，拆分为“模型来源”与“兼容 API 配置”卡片，去重顶栏，补创作助手跳转说明 | 未开始 |
| P2-5 | 助手记忆在狭小下拉浮层编辑，“载入最新记忆”无未保存保护，“重新开始讨论”用原生 confirm 且紧挨发送 | 长记忆难编辑、易误覆盖或误清空讨论 | 改为右侧抽屉/面板并检测未保存修改；新增原生 `<dialog>` 确认框 `ConfirmDialog`；重开讨论移入 `⋯` 菜单 | 已完成（B9，见 §9.3） |
| P2-6 | 写作右侧大纲/角色/设定速查预览直接显示 Markdown 源码 | 标题与列表符号干扰对照阅读 | 使用受限白名单 `react-markdown`（`skipHtml`）渲染资料预览，章节对照保持纯文本 | 已完成（B6，见 §9.3） |
| P2-7 | 卡片弹窗标题写“知识卡”重复层级、证据全折叠、紧凑卡“查看完整卡片”像小标题且易被遮罩压住 | 查卡与核证原文多一步操作 | 弹窗直接以卡名为标题、眉题写作品与类别，默认展开前 3 条证据；紧凑卡底部右侧改为“展开全文 →” | 已完成（B8，见 §9.3） |
| P2-8 | 写作 364px 侧栏中 KB v2 模式按钮与“接口设置”挤压换行，两条外传说明占高 | 侧栏检索视野局促 | 侧栏模式按钮显示短名（保留完整可访问名称/title），接口设置改图标按钮，合并外传提示 | 已完成（B8，见 §9.3） |
| P2-9（D2） | 参考检索 Enter 发送，创作助手 Ctrl+Enter 发送 | 跨面板输入习惯割裂 | 统一 `sendIntent`：Enter 发送、Shift+Enter 换行、Ctrl/⌘+Enter 兼容发送、IME 组字保护 | 已完成（`8bebfa8`） |
| P2-10（D3） | 参考检索默认 `fast`（AI），且切页后参考库模式与已选作品重置 | 每次打开默认指向外传模式，跨页对照丢失位置 | v2 默认 `local`（会话内保留切换，重启回 `local`）；App 层保持参考库视图状态与书架滚动位置 | 已完成（`afbe4fe`） |
| P2-11 | 参考库、创作助手、设置页顶栏高度与标题层级不一致 | 跨页切换跳跃感明显 | 提取 `PageHeader` 统一 48px 页头，压缩助手页头，去除设置页重复顶栏 | 进行中（B8 参考库与 B9 助手页头已完成，B10 设置页接续） |
| P2-12 | CodeMirror 查找替换面板 12px 紧凑排布 | 查找框输入局促 | `.cm-search` 控件统一 `--fs-ui`、30px 最小高度与语义色变量 | 已完成（B5，见 §9.3） |
| P2-13 | 光标在括号提示内未全选时“AI 扩写”直接禁用，弹窗“生成预览”无主按钮样式 | 扩写触发门槛不直观 | 新增只读辅助函数 `enclosingExpansionPair`，提供“选中提示”快捷选中按钮；“生成预览”补主按钮样式 | 已完成（B6，见 §9.3） |
| P2-14（D5） | 夜写纸张时周边栏位仍为亮色，缺少独立整站深色模式 | 夜间写作眩光对比强烈 | 新增 `appearance`（`light`/`dark`/`system`）与全套语义色变量，五主题适配深色且与纸张独立 | 已完成（B7，见 §9.3） |
| P3 | `Modal` 缺 Tab 焦点圈闭、导航/扩写图标重复、章节菜单带框拥挤、删标记无撤销、助手样式写死色值 | 键盘可访问性与细节一致性不足 | `Modal` 补焦点圈闭、区分助手与扩写图标、菜单无框化、删除标记 5 秒内可撤销、清理残余硬编码色值 | 未开始 |
| D4 | 启动始终停在书架，需再次点选上次正在写的书 | 日常续写多一步点击 | 启动读取书架后若 `recent.workId` 仍存在则自动进入并恢复章节与光标，失败或恢复备份后停在书架 | 已完成（`54b977e`） |

### 9.3 每批实施记录（复制此模板追加）

#### B0：准备工作区、基线验证与台账

- 时间与目标：2026-11-15 03:38–03:48；建立独立 worktree `feat/claude-frontend-ux`，将确认版执行方案移入分支并保持 `main` 工作目录干净，完成依赖/Electron 就绪、基线单测与改动前全旅程合成截图。
- 发现/决定与取舍：
  1. 新 worktree 不包含 `.gitignore` 忽略的 `*.zip` 与 Electron 二进制：按发布清单使用本机 Electron 缓存包执行 `npm run setup:electron` 通过 SHA-256 校验安装 Electron 43.2.0；将主目录忽略的公版合成测试夹具 `拆书规范包/examples/标准结果样例.zip`（1,245 字节）复制到 worktree 同路径（仍被 Git 忽略），使 `tests/protocol.test.mjs` 与桌面导入 QA 正常运行。
  2. 基线合成审查复现了预期问题：`firstOpenedTitle="第10章 灯塔"`、`v2DefaultMode="AI 快速"`、`cardModalHasEditButton=true`、`referenceModeAfterReturn="检索"`、多处 10–11px 文字。
- 实际变更：新增 `CLAUDE_前端体验优化执行方案.md`（从 `main` 未跟踪文件移入），更新 `CLAUDE_前端体验优化交接.md` 第 9 节台账；在被忽略目录创建 `.local/claude-frontend-ux/audit-screens.mjs`。未改动任何业务代码。
- 行为差异：无（纯文档与隔离工作区准备）。
- 组件旧→新映射：无。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：`5e9b4d1`（`docs: add confirmed frontend UX execution plan`）。
- 验证：
  - `npm run build`（2026-11-15 03:39）：PASS（`dist/app.js` 766.9kb，`dist/app.css` 68.2kb）。
  - `npm test`（2026-11-15 03:41）：PASS（100 / 100 通过，耗时 4394.56ms）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B0-baseline`（2026-11-15 03:46）：PASS（0 页面错误，33 张基线截图与指标写入 `.local/worktrees/claude-frontend-ux/.local/claude-frontend-ux/B0-baseline-1794685557053/`）。
- 仍有问题与下一步：进入 B1，修正 KB v2 只读卡片编辑死路、多卷作品首次打开章节顺序与 v2 侧重筛选标签。

#### B1：修正死路与误导控件（P1-1、P1-2、P1-7）

- 时间与目标：2026-11-15 03:49–03:54；消除 KB v2 卡片“编辑→保存报错”死路、修复首次打开多卷作品落到后卷的问题、将 v2 检索九类筛选更名为与实际三层权重一致的“侧重”，并同步设置页 v2 说明文案。
- 发现/决定与取舍：
  1. `writing.list` 的 `docs` 按单卷内 `position` 排序而未联结卷序，导致第 2 卷第 1 章（`position=0`）可能排在第 1 卷章节之前；抽离纯函数 `orderedChapters(volumes, docs)` 按卷序展开，`chooseWork`、`createWork` 与页脚章节序列共用同一计算。
  2. `CardEditor` 新增默认 `editable = true` 参数，由 `App.jsx` 传入 `!info?.kbV2`，保证 v1 验收脚本（`qa-card-viewer`、`qa-card-markdown`）编辑流不受影响，v2 下隐藏编辑按钮并在底部说明只读维护来源。
  3. `Conversation.jsx` 在 `kbV2` 下将“类别”改为“侧重”（`aria-label="检索侧重"`），4 个选项直接对应 `search-v2.mjs` 的 `weightsFromLegacyCategories` 分支，不改后端契约。
- 实际变更：新建 `app/renderer/writing-order.mjs`、`tests/writing-order.test.mjs`；修改 `app/renderer/App.jsx`、`app/renderer/Reference.jsx`、`app/renderer/Writing.jsx`、`app/renderer/Conversation.jsx`、`app/renderer/RetrievalPreferences.jsx`、`app/renderer/Preferences.jsx`、`app/renderer/app.css`。
- 行为差异：KB v2 卡片弹窗不再显示“编辑”按钮并新增只读说明；KB v2 检索筛选标签由“类别（9类）”改为“侧重（不限 / 人物与设定 / 剧情场次 / 原文描写）”；无历史记录的多卷原创作品首次打开固定进入第一卷第一章。
- 组件旧→新映射：新增辅助纯函数模块 `app/renderer/writing-order.mjs`（`orderedChapters`）；组件名未变。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：`bd99363`（`fix(ui): hide read-only v2 card edit, open first chapter in volume order, relabel v2 focus filter`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 03:52）：PASS（102 / 102 通过）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-workflow.mjs`（2026-11-15 03:52）：PASS（`.local/writing-workflow-yoEkPE`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-regressions.mjs`（2026-11-15 03:52）：PASS（`.local/writing-regressions-p0ATX9`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-card-viewer.mjs`（2026-11-15 03:53）：PASS（`.local/card-viewer-qa-0kwihP`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-card-markdown.mjs`（2026-11-15 03:53）：PASS（`.local/card-markdown-qa-YIkcxS`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B1`（2026-11-15 03:53）：PASS（断言 `firstOpenedTitle==="第一章 熄灭的信号灯"`、`cardModalHasEditButton===false`、`categoryLabel==="侧重"` 全部通过，截图位于 `.local/claude-frontend-ux/B1-1794685986461/`）。
- 仍有问题与下一步：进入 B2，统一 Enter 发送键、支持助手运行期间继续草拟输入、优化助手空闲轮询并进行长对话测量。

#### B2：发送键统一、助手运行期草拟输入与轮询优化（D2、P1-5、P1-6、P2-9）

- 时间与目标：2026-11-15 04:03–04:09；统一参考检索与创作助手（独立页+写作侧栏）为 Enter 发送 / Shift+Enter 换行（含 IME 组字保护与 Ctrl/⌘+Enter 兼容别名），允许助手忙碌时继续编辑草稿且不清空新写草稿，将 `assistant.get` 轮询收窄至忙碌期并为长消息列表加 `React.memo`，对 200 条合成长对话改动前后各测一次长任务与轮询次数。
- 发现/决定与取舍：
  1. 200 条 × 约 600 字长对话实测复现了 P1-6 性能问题：改动前在空闲 30 秒内持续产生 30 次 `assistant.get` 与 30 次长任务（`totalLongtaskMs=2165`，`maxLongtaskMs=86`），忙碌模拟 6 秒内产生 6 次长任务（`totalLongtaskMs=442`，`maxLongtaskMs=79`）；改动后空闲 30 秒降为 0 次调用与 0 次长任务，忙碌 6 秒仍按预期轮询 6 次 `assistant.get` 但因 `MessageList` `React.memo` 跳过历史消息重渲染而降为 0 次长任务（`totalLongtaskMs=0`，`maxLongtaskMs=0`）。
  2. `Assistant.jsx` 将 `useAssistantController` 轮询拆分为：切换 `workId` 单次 `load`、`active` 从假变真单次 `refreshWorks()` + `refreshState()`、仅在 `Boolean(workId) && busy` 时每秒轮询；加入 `syncEpoch` 防止切换作品或回合结束时在途轮询覆盖新状态；`run()` 记录 `sent` 并在失败 `catch` 时静默拉取一次 `assistant.get` 同步 `lastError` / `failedPartial` / `busy: false`。
  3. 紧凑侧栏移除 `.assistant-compact .assistant-composer-actions>span{display:none}`，改为提示占首行、按钮居第二行自动换行，避免 364px 侧栏下横向溢出。
- 实际变更：新建 `app/renderer/input-keys.mjs`、`tests/input-keys.test.mjs`；修改 `app/renderer/Conversation.jsx`、`app/renderer/Assistant.jsx`、`app/renderer/assistant.css`、`scripts/qa-assistant-experience.mjs`、`docs/创作助手.md`、`docs/assistant-ui-brief.md`。
- 行为差异：参考检索与创作助手统一为 `Enter` 发送、`Shift+Enter` 换行（`Ctrl/⌘+Enter` 仍兼容发送，IME 组字与忙碌期间按 `Enter` 不发送也不换行）；助手忙碌时输入框保持可编辑，回合完成后若草稿已被用户改写则保留；侧栏底部显示键位提示。
- 组件旧→新映射：新增纯函数模块 `app/renderer/input-keys.mjs`（`sendIntent`）；`Assistant.jsx` 抽离 `MessageList = React.memo(...)`。
- 依赖、IPC、偏好存储键、权限变化：无（快捷键变化：创作助手发送键由 `Ctrl/⌘+Enter` 统一为 `Enter`，仍兼容 `Ctrl/⌘+Enter`）。
- 提交：`8bebfa8`（`feat(ui): unify Enter-to-send, allow drafting while assistant runs, poll assistant only when busy`）。
- 验证：
  - `measure-assistant-polling.mjs before`（2026-11-15 04:04）：PASS — 空闲 30s：`assistantGetCalls=30`，`longtaskCount=30`，`totalLongtaskMs=2165`，`maxLongtaskMs=86`；忙碌 6s：`assistantGetCalls=6`，`longtaskCount=6`，`totalLongtaskMs=442`，`maxLongtaskMs=79`（`.local/claude-frontend-ux/B2-perf-before-1794686623878/`）。
  - `npm run build && npm test`（2026-11-15 04:06）：PASS（106 / 106 通过）。
  - `measure-assistant-polling.mjs after`（2026-11-15 04:07）：PASS — 空闲 30s：`assistantGetCalls=0`，`longtaskCount=0`，`totalLongtaskMs=0`，`maxLongtaskMs=0`；忙碌 6s：`assistantGetCalls=6`，`longtaskCount=0`，`totalLongtaskMs=0`，`maxLongtaskMs=0`（`.local/claude-frontend-ux/B2-perf-after-1794686782080/`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-assistant.mjs`（2026-11-15 04:07）：PASS。
  - `node --disable-warning=ExperimentalWarning scripts/qa-assistant-experience.mjs`（2026-11-15 04:07）：PASS（保留既有跨入口草稿保持断言，新增 Shift+Enter、IME 组字、忙碌期打字/Enter 抑制、草稿保留/清空与失败同步断言，证据 `.local/assistant-027/experience-1794686840349`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 04:08）：PASS（`.local/visual-qa-LLxaWt`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B2`（2026-11-15 04:08）：PASS（0 页面错误，`.local/claude-frontend-ux/B2-1794686862068/`）。
  - `node scripts/qa-assistant-responsiveness.mjs`：`NOT_RUN`（需已打包安装版 EXE 与 `reference-v2.sqlite`，按本轮红线不打包且不读写正式库）。
- 仍有问题与下一步：进入 B3，将 KB v2 默认检索模式改为本地混合（`local`）并在 App 层保持参考库视图状态与书架滚动位置。

#### B3：参考检索默认本地混合与参考库跨页状态保持（D3、P2-10）

- 时间与目标：2026-11-15 04:08–04:12；将 `Conversation.jsx` 的 KB v2 初始模式由 `fast` 改为 `local`（会话内保留切换，重启回 `local`），并将 `Reference.jsx` 的 `{ mode, selected, archiveOpen, query }` 与书架滚动位置提升到 `App.jsx`（保留组件默认兜底，并在 `backup.restore` 的 `restored` 回调同步重置）。
- 发现/决定与取舍：
  1. `Conversation.jsx` 中 `useConversation()` 的 `v2Mode` 默认值改为 `'local'`，不持久化到磁盘，保证每次启动默认不外传且当次运行内切换模式可保持。
  2. `App.jsx` 新增 `referenceView`（`{ mode: 'search', selected: '', archiveOpen: false, query: '' }`）与 `referenceShelfScroll` ref 传入 `Reference`；`Reference` 保留本地默认 state/ref 兜底，且仅在书架列表态（`!workId`）记录滚动位置，避免详情页滚动覆盖书架位置；点击“书架”顶栏按钮在详情态仍回到书架列表；`backup.restore` 的 `restored` 回调同步重置 `referenceView` 与 `referenceShelfScroll`。
- 实际变更：修改 `app/renderer/Conversation.jsx`、`app/renderer/App.jsx`、`app/renderer/Reference.jsx`；并在 `.local/claude-frontend-ux/audit-screens.mjs` 增加 B3+ 断言。
- 行为差异：KB v2 独立页与写作侧栏默认均选中“本地混合”；从参考库切换主导航再返回后保持原模式、选中作品、封存筛选、搜索词与书架滚动位置。
- 组件旧→新映射：无（`Reference` 新增可选受控 props `viewState`、`setViewState`、`shelfScroll`，保留默认非受控兜底）。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：`afbe4fe`（`feat(ui): default reference search to local mode and keep reference view state across pages`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 04:10）：PASS（106 / 106 通过）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-workspace-ui.mjs`（2026-11-15 04:10）：PASS（`.local/workspace-ui-rL3ms1`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-retrieval.mjs`（2026-11-15 04:10）：PASS（`.local/retrieval-qa-cby5VS`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 04:11）：PASS（`.local/visual-qa-y5cB4f`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B3`（2026-11-15 04:11）：PASS（断言 `sidebarDefaultV2Mode="本地混合"`、`v2DefaultMode="本地混合"`、`referenceModeAfterReturn="书架"`、`referenceWorkOpenAfterReturn=true` 全部通过，0 页面错误，`.local/claude-frontend-ux/B3-1794687067400/`）。
- 仍有问题与下一步：进入 B4，实现启动读取书架后自动回到上次写作作品并更新受影响的 3 份 QA 脚本定位衔接。

#### B4：启动自动回到上次写作的作品（D4）

- 时间与目标：2026-11-15 04:12–04:24；在 `Writing.jsx` 初次 `loadBookshelf` 完成后，若 `session.current.recent?.workId` 存在于 `listing.works`，每次挂载最多自动调用一次 `chooseWork(recentId)` 恢复上次作品、章节、光标与滚动并聚焦编辑器；若不存在或报错则停在书架；同步更新 `qa-writing-workflow.mjs`、`qa-desktop.mjs`、`qa-expansion.mjs` 重启后的定位衔接并保留全部保护断言。
- 发现/决定与取舍：
  1. `Writing.jsx` 新增 `autoOpened = useRef(false)`。在初次 `loadBookshelf` 读取 `writing.list` 后，仅当 `!autoOpened.current && candidate && next.works.some(work => work.id === candidate)` 时标记 `autoOpened.current = true` 并记住 `recentId`；在 `finally` 释放 `transition.current = false`（若无 `recentId` 才释放 `transitioning`，避免自动打开前书架按钮短暂可点）后再 `await chooseWork(recentId)`，避免与 `withEditorLocked` 嵌套死锁。若 `writing.list` 或 `chooseWork` 报错，则停在书架并显示错误；`backup.restore` 已调用 `clearWritingSession()` 并递增 `epoch` 重挂，故恢复备份后停在书架。
  2. QA 定位调整（**保留全部保存、光标恢复、崩溃恢复、未采纳扩写与隔离保护断言**）：
     - `scripts/qa-writing-workflow.mjs`（L322–331）：因 D4 启动自动进入上次作品，重启后先直接等待 `heading(firstTitle)`、断言书架隐藏并核对 `expectPosition(beforeSwitch)` 与正文一致，再调用 `returnToBookshelf()` 断言“继续写作”与“返回书架”可达并重新打开作品衔接后续全文搜索。
     - `scripts/qa-desktop.mjs`（`openFirstChapter` L114–125）：因 D4 崩溃重启后自动回到编辑器，改为等待 `firstHeading`（已自动进入）或 `.original-shelf-grid[aria-busy="false"]` 内的作品按钮（如恢复备份清空 session 后停在书架），消除与自动打开之间的竞态；另同步 L352（原 L345）处 `main@ac91913` 改版时遗留的空结果定位文案 `'没有找到匹配的知识卡。'` → `'没有找到匹配的参考条目。'`（`Conversation.jsx:137`），保留原隔离无结果断言。
     - `scripts/qa-expansion.mjs`（新增 `reopenWorkAfterRestart` 辅助，L365–385）：因 D4 启动自动进入上次作品，两次重启后改为兼容自动进入编辑器或从 `aria-busy="false"` 书架点击进入，保留全部未采纳原稿保护与配置保存断言。
- 实际变更：修改 `app/renderer/Writing.jsx`、`scripts/qa-writing-workflow.mjs`、`scripts/qa-desktop.mjs`、`scripts/qa-expansion.mjs`。
- 行为差异：新装或恢复备份后启动仍停在书架；存在有效 `recent.workId` 时重启直接进入上次作品与章节并恢复光标/滚动，可通过“返回书架”返回。
- 组件旧→新映射：无。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：`54b977e`（`feat(ui): reopen the last manuscript on launch`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 04:13）：PASS（106 / 106 通过）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-workflow.mjs`（2026-11-15 04:14）：PASS（`.local/writing-workflow-BxVx5G`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-regressions.mjs`（2026-11-15 04:14）：PASS（`.local/writing-regressions-ahUT2q`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs`（2026-11-15 04:20）：PASS（`.local/desktop-qa-lL5pam`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-expansion.mjs`（2026-11-15 04:22）：PASS（`.local/expansion-qa-T4YXLn`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B4`（2026-11-15 04:23）：PASS（0 页面错误，`.local/claude-frontend-ux/B4-1794687783961/`）。
- 仍有问题与下一步：Phase 1（B2–B4）已完成并交付 `@verifier` 独立核验；后续进入 Phase 2（B5 字号标尺与行宽）。

#### B5：字号标尺、行宽与专注模式（D1、P1-3、P1-4、P2-12）

- 时间与目标：2026-11-15 04:28–04:40；分 3 个提交完成：① 零语义差异格式化 `assistant.css`；② 抽离纯 JS 偏好模型 `preferences-model.mjs`；③ 定义 `--fs-*`/`--lh-*` 字号行高标尺与 14px 根字号、清理全部 12 个 CSS 中的 `<12px` 声明、落实 D1 默认宽度与专注模式列宽对齐、放大 `.cm-search` 查找替换控件并补充测试与全尺寸溢出/字号断言。
- 发现/决定与取舍：
  1. `assistant.css` 格式化时同步保留了 B2（`8bebfa8`）对 `.assistant-composer-actions` 的 `flex-wrap: wrap` 与紧凑侧栏 `width: 100%` 键位提示换行规则，并在 Node 下做去空白语义一致性校验通过。
  2. `preferences-model.mjs` 抽离 `Preferences.jsx` 的偏好常量与 `normalizePreferences`/`loadPreferences`/`savePreferences`/`writingSurface`，`Preferences.jsx` 重新导出保持既有导入兼容。`writingDefaults.widthMode` 设为 `'limit'`，`loadPreferences` 在 `localStorage` 无 `studio.preferences.v1` 记录时默认返回 `'limit'`，而已有旧 JSON 缺 `widthMode` 时仍保留 `width === 680 ? 'window' : 'limit'` 回退规则；`writingSurface` 同时输出 `--writing-measure` 与 `--writing-focus-measure`（`'limit'` 取 `${width}px`，`'window'` 取 `${fontSize * 42}px`）。
  3. `.writing-main` 提升 `--editor-gutter: clamp(16px, 3vw, 58px)`，使 `.is-focused .toolbar-inner` 与 `.is-focused .editor-column` 共享同一 `--writing-focus-measure` 宽度并左右齐平；`.cm-search` 保持 CodeMirror 原有换行流，控件字号升至 `--fs-ui`、`min-height: 30px`。
- 实际变更：
  - Commit 1：格式化 `app/renderer/assistant.css`。
  - Commit 2：新建 `app/renderer/preferences-model.mjs`，更新 `app/renderer/Preferences.jsx`。
  - Commit 3：修改 `app/renderer/preferences-model.mjs`、`app/renderer/app.css`、`app/renderer/writing.css`、`app/renderer/assistant.css`、`app/renderer/card-content.css`、`app/renderer/manuscript-directory.css`、`app/renderer/writing-resources.css`、`app/renderer/reference-bookshelf.css`、`app/renderer/reader-workspace.css`、`app/renderer/workspace-settings.css`、`app/renderer/expansion-dialog.css`、`app/renderer/book-cover.css`、`README.md`；新增 `tests/preferences-model.test.mjs`；更新 `.local/claude-frontend-ux/audit-screens.mjs`（增加 B5+ `sub12 === []` 与 `1460×930`/`980×760`/`880×600` 无横向溢出断言）。
- 行为差异：新安装（无本地偏好）及“恢复默认”后默认“限制宽度 680px”，已有保存偏好不变；专注模式正文列与顶栏始终居中对齐可读列宽；全局最小可见字号不低于 12px，查找替换面板控件高度增至 30px。
- 组件旧→新映射：`Preferences.jsx` 中的 `storageKey`、`themes`、`papers`、`rulings`、`fonts`、`readerSizes`、`writingWidths`、`writingDefaults`、`defaults`、`normalizePreferences`、`loadPreferences`、`savePreferences`、`writingSurface` 迁入 `app/renderer/preferences-model.mjs`，由 `Preferences.jsx` 重新导出。
- 依赖、IPC、偏好存储键、权限变化：无（`studio.preferences.v1` 结构未新增字段，仅变更全新默认 `widthMode` 为 `'limit'`）。
- 提交：`4839d1e`（`style: reformat assistant.css without semantic changes`）、`1d9d64c`（`refactor(ui): extract preference model for tests`）、`9df2359`（`style(ui): type scale tokens, readable writing measure and focus column`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 04:34）：PASS（109 / 109 通过，含新增 3 项 `preferences-model` 单测）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B5`（2026-11-15 04:34）：PASS（0 页面错误，`sub12=[]`，`overflowWide=[]`，`overflowNarrow=[]`，`overflowMin=[]`，截图位于 `.local/claude-frontend-ux/B5-1794688476117/`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-workflow.mjs`（2026-11-15 04:35）：PASS（`.local/writing-workflow-c2G8UD`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-regressions.mjs`（2026-11-15 04:36）：PASS（`.local/writing-regressions-IXZP0I`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs`（2026-11-15 04:39）：PASS（`.local/desktop-qa-R4mLCd`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 04:39）：PASS（`.local/visual-qa-A0QzYE`）。
- 仍有问题与下一步：进入 B6（写作页结构：工具栏固定顺序与分组“更多”菜单、可收起左侧栏、统一遮罩与全局 Esc 优先级、历史正文预览、资料 Markdown 预览、扩写提示快捷选中）。

#### B6：写作页结构（P2-1、P2-2、P2-3、P2-6、P2-13）

- 时间与目标：2026-11-15 04:40–04:55；分 3 个提交完成：① 工具栏固定左对齐顺序与分组“更多”菜单（合并顶部“作品/编辑”，容器查询窄窗收纳次要项），同步更新 `qa-desktop.mjs`、`qa-writing-workflow.mjs`、`qa-writing-regressions.mjs` 顶部菜单触发定位器；② 左侧栏可收起为 56px 图标条（`writingSession.layout.railCollapsed`）、统一非停靠抽屉 `writing-overlay-dismiss` 遮罩与 window 级 Esc 优先级；③ 历史抽屉字数/差值与只读正文预览、资料速查 `react-markdown`（`skipHtml`）渲染（章节对照保持 `<pre>`）、`enclosingExpansionPair`“选中提示”快捷选中与弹窗主按钮样式。
- 发现/决定与取舍：
  1. 工具栏“更多”仅合并顶部“作品”与“编辑”两份下拉（分组为“本章”/“作品”并在 `@container writing-workspace (max-width: 740px)` 下显露“视图与工具”），列表/资料行内 `ActionMenu`（`更多${label}操作`）保持不动。同步更新 3 份 QA 脚本顶部菜单触发定位器至 `getByLabel('更多', { exact: true })`，原有整理、导入、导出及防误改断言全部保留。
  2. `App.jsx` 与 `Writing.jsx` 共同读写 `studio.writingSession.v1`：`Writing.jsx` 通过 `persistSession()` 在保存位置/折叠/最近文档时合并最新的 `layout.railCollapsed`，防止覆盖主侧栏折叠状态；`backup.restore` 回调同步重置 `railCollapsed` 为 `false`。
  3. window 级 `Escape` 统一按 `打开菜单(details.rail-menu[open]) → 对话框/弹窗/CodeMirror 查找栏 → 行内扩写预览 → 右侧抽屉（含焦点归还） → 专注模式` 顺序处理，并跳过 IME 组字与全局 `Modal`/`Reader`。
  4. `WritingResources.jsx` 仅对大纲、角色、设定启用受限白名单 `react-markdown`（`allowedElements` 13 项 + `skipHtml`），章节对照继续保留 `<pre tabIndex={0} aria-label="条目正文">`，确保 `qa-writing-workflow.mjs` 逐字换行对照不变。
- 实际变更：
  - Commit 1：修改 `app/renderer/Writing.jsx`、`app/renderer/writing.css`、`scripts/qa-desktop.mjs`、`scripts/qa-writing-workflow.mjs`、`scripts/qa-writing-regressions.mjs`。
  - Commit 2：修改 `app/renderer/writing-session.mjs`、`app/renderer/App.jsx`、`app/renderer/app.css`、`app/renderer/Writing.jsx`、`tests/writing-session.test.mjs`。
  - Commit 3：修改 `app/shared/expansion-selection.mjs`、`tests/expansion-selection.test.mjs`、`app/renderer/WritingResources.jsx`、`app/renderer/writing-resources.css`、`app/renderer/expansion-dialog.css`、`app/renderer/Writing.jsx`、`app/renderer/writing.css`、`.local/claude-frontend-ux/audit-screens.mjs` 与本交接台账。
- 行为差异：工具栏按钮顺序固定且窄窗次要按钮收进“更多”；左侧导航支持收起为 56px 图标条并持久记忆；窄窗所有右侧抽屉均带遮罩，Esc 按统一优先级逐层关闭；历史列表显示字数及差值且先预览再恢复；大纲/角色/设定预览支持 Markdown 排版；光标位于未选中括号提示内时“AI 扩写”旁显示“选中提示”。
- 组件旧→新映射：新增纯函数 `enclosingExpansionPair`（`app/shared/expansion-selection.mjs`）；`writing-session.mjs` 的 `normalizeSession` 新增 `layout: { railCollapsed }` 字段。
- 依赖、IPC、偏好存储键、权限变化：无（`studio.writingSession.v1` 仅新增向后兼容的 `layout.railCollapsed` 布尔字段）。
- 提交：`e906e26`（`feat(ui): stable writing toolbar with grouped overflow menu`）、`56019d2`（`feat(ui): collapsible rail, consistent drawer overlay and Esc`）、`13f0926`（`feat(ui): history preview, rendered material preview, expansion prompt helper`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 04:47）：PASS（112 / 112 通过，含新增 `writing-session` layout 单测及 2 项 `enclosingExpansionPair` 单测）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-workflow.mjs`（2026-11-15 04:48）：PASS（`.local/writing-workflow-1Bp77A`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-writing-regressions.mjs`（2026-11-15 04:49）：PASS（`.local/writing-regressions-eLvgDX`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-expansion.mjs`（2026-11-15 04:50）：PASS（`.local/expansion-qa-p50yJF`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs`（2026-11-15 04:52）：PASS（`.local/desktop-qa-FlTCQt`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 04:53）：PASS（`.local/visual-qa-5S4Koo`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B6`（2026-11-15 04:54）：PASS（0 页面错误，`sub12=[]`、`railCollapsedOverflow=[]`、`overflowWide=[]`、`overflowNarrow=[]`、`overflowMin=[]`，B6 折叠侧栏/历史预览/遮罩关闭/选中提示断言全部通过，截图 `.local/claude-frontend-ux/B6-1794689626584/`）。
- 仍有问题与下一步：进入 B7（整站深色界面与语义色变量，独立于写作纸张并满足 WCAG 对比度抽检）。

#### B7：整站深色界面与语义色变量（P2-14、D5）

- 时间与目标：2026-11-15 04:55–05:03；在 `preferences-model.mjs` 新增 `appearance`（`light`/`dark`/`system`，默认 `light`），在 `App.jsx` 监听系统深浅色并同步 `data-appearance` 与 `colorScheme`；在全部 CSS 中清理写死颜色及深色下发白 `color-mix` 遮罩，补齐 `ink/indigo/jade/rose/amber` 5 主题深色与 `card-content.css` 深色语义覆盖，保持写作纸张独立并完成 WCAG 对比度抽样实测。
- 发现/决定与取舍：
  1. `preferences-model.mjs` 新增 `appearances = [['light','浅色'], ['dark','深色'], ['system','跟随系统']]` 与 `defaults.appearance = 'light'`（非法值回退 `'light'`）；`Preferences.jsx` 的 `AppearancePreferences` 在主题色上方展示“界面明暗”分段按钮，并附“写作纸张在「写作偏好」中单独设置；夜间写作可搭配「夜写」纸张”提示。
  2. `App.jsx` 新增 `useResolvedAppearance(preferences.appearance)` 监听 `matchMedia('(prefers-color-scheme: dark)')`，在 `.studio` 设置 `data-appearance`，同步 `document.documentElement.style.colorScheme`；`index.html` `<meta name="color-scheme">` 更新为 `light dark`。
  3. `:root` 与 `.studio[data-appearance=dark]` 补齐 `--accent-ink`、`--scrim`、`--danger-*`、`--success-*`、`--warn-*`、`--shadow`、`--shadow-sm` 语义变量（深色下 `--accent-ink: #16181d` 配提亮主题 `--accent`），并将 `app.css`、`writing.css`、`assistant.css`、`manuscript-directory.css`、`expansion-dialog.css`、`reader-workspace.css`、`ui.jsx` 的写死颜色及发白 `color-mix(..., var(--ink))` 遮罩/阴影全部改为语义变量；`card-content.css` 为 10 类知识卡与 8 组标签在深色模式下配置低明度底色与提亮文字色；`[data-writing-paper]` 与 `[data-writing-paper=dark] .expansion-inline-preview` 保持独立于 `data-appearance`。
  4. **已知限制**：因本轮红线禁止修改 `app/main/**`，主进程 `BrowserWindow` 创建时的初始 `#ffffff` 背景色未同步调整，冷启动首帧渲染前可能存在极短白闪（首次挂载后即由 `data-appearance` 与 `colorScheme` 接管）。
- 实际变更：修改 `app/renderer/preferences-model.mjs`、`tests/preferences-model.test.mjs`、`app/renderer/Preferences.jsx`、`app/renderer/index.html`、`app/renderer/ui.jsx`、`app/renderer/App.jsx`、`app/renderer/app.css`、`app/renderer/writing.css`、`app/renderer/assistant.css`、`app/renderer/card-content.css`、`app/renderer/manuscript-directory.css`、`app/renderer/expansion-dialog.css`、`app/renderer/reader-workspace.css`、`README.md`、`.local/claude-frontend-ux/audit-screens.mjs` 与本交接台账。
- 行为差异：外观偏好新增独立于写作纸张的“浅色 / 深色 / 跟随系统”明暗模式，5 套主题均可在深色界面的同时自由搭配白纸/米纸/护眼/夜写纸张；原生控件、滚动条、弹窗遮罩、知识卡标签与报错条随明暗切换自适应。
- 组件旧→新映射：`preferences-model.mjs` 新增 `appearances` 常量；`App.jsx` 新增 `useResolvedAppearance` hook。
- 依赖、IPC、偏好存储键、权限变化：无（`studio.preferences.v1` 新增向后兼容 `appearance` 字段，默认 `'light'`）。
- 提交：`32b197b`（`feat(ui): independent dark appearance with semantic color tokens`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 04:58）：PASS（113 / 113 通过，含新增 `appearance` 规范化/持久化单测）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs`（2026-11-15 05:00）：PASS（`.local/desktop-qa-R8DSBV`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 05:00）：PASS（`.local/visual-qa-nevIpS`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B7`（2026-11-15 05:02）：PASS（0 页面错误，`sub12=[]`，`b7WhitePaperInDarkUi` 确认深色界面下白纸保持 `rgb(255, 255, 255)` / `rgb(35, 36, 40)`；Chromium 实测 5 主题深色对比度：`inkOnBg=13.35`、`inkOnPanel=12.14`、`mutedOnBg=6.82`、`mutedOnPanel=6.20`、`accentInkOnAccent=7.41–12.32`、`linkOnPanel=7.07–7.99`、`accentOnSoft=5.46–8.53`、`accentOnChrome=5.94–9.55`，全部达标；截图 `.local/claude-frontend-ux/B7-1794690142065/`）。
- 仍有问题与下一步：Phase 2（B5–B7）已全部完成并交付 `@verifier` 独立复核；等待核验通过后由 Phase 3 继续 B8–B11。

#### B8：参考检索与卡片、页头统一（P2-7、P2-8、P2-11）

- 时间与目标：2026-11-15 05:08–05:13；统一 `PageHeader` 48px 页头并接入参考库，改进 `CardEditor` 与 `Card` 弹窗层级、默认展开前 3 条证据，优化紧凑卡“展开全文 →”与 364px 侧栏检索控件排布。
- 发现/决定与取舍：
  1. `CardEditor` 改为以卡名（`live?.title ?? card.title`）作弹窗标题，眉题显示 `作品名 · 类型标签`；`Card` 新增 `headless` 参数隐藏弹窗内重复 `<h3>` 与作品名，但保留 `.knowledge-card > .card-kicker > .pill` 色标节点（满足视觉识别与 `qa-card-markdown.mjs:118` 读取分类色值）且不额外新增 `<p>`（保持 `qa-card-viewer.mjs:43` 的段落计数为 1）。
  2. 弹窗内 `collapseEvidence` 改为默认直接展示前 3 条 `.evidence-link`（置于 `<div className="card-evidence">`），超过 3 条部分放入 `<details className="evidence-more"><summary>另有 N 处</summary>...</details>`。同步调整两份 QA 的旧折叠前置步骤：
     - `scripts/qa-card-viewer.mjs` L44–46：原 L44 断言弹窗内 `.evidence-link` 初始隐藏（`isVisible() === false`）且 L46 点击 `^原文证据` 展开；因 B8 已默认展开前 3 条证据，改为等待并断言首条 `.evidence-link` 直接可见后点击跳转原文；保留全部证据高亮（`[data-highlighted=yes]`）、返回弹窗、取消编辑、保存修改及窄窗无溢出断言。
     - `scripts/qa-card-markdown.mjs` L125：原 L125 点击 `^原文证据` 展开折叠；因 B8 已默认展开前 3 条证据，改为等待首条 `.evidence-link` 可见后直接点击跳转；保留全部 Markdown 渲染、标签色值、XSS 拦截、证据返回与紧凑卡计数断言。
  3. 紧凑卡底部的“查看完整卡片”改为右对齐链接按钮 `展开全文 →`，包裹在 `<div className="card-expand-row">` 中置于 `<CardContent />` 外部、渐隐遮罩下方，不压遮罩也不影响 `.card-content` 内 `strong`/`h2` 计数；证据链接统一 `var(--fs-meta)`（12px）并去掉旧 `<small>{range.volume_title}</small>` 副标题，保留完整 `title` 提示。
  4. `Conversation.jsx` 独立页 KB v2 标题改为 `参考检索`（保留 `<section aria-label={sidebar ? '参考检索侧栏' : '参考库检索'}>` 与作品数副标题）；`sidebar` 为真时模式按钮显示短名 `本地 / 快速 / 深度`（保留 `aria-label` 与 `title` 完整说明）、“接口设置”改为图标按钮（保留 `aria-label="接口设置"` 与 `title="接口设置"`），并将两条 v2 外传与耗时说明合并为单条 `<small className="retrieval-disclosure">`。
  5. `ui.jsx` 新增 `PageHeader({ title, subtitle, actions })`（48px 高度，左 `<h1>` 右操作），`Reference.jsx` 接入并保留 `检索` / `书架` 分段开关与 `参考书架` 标题。
- 实际变更：修改 `app/renderer/ui.jsx`、`app/renderer/Reference.jsx`、`app/renderer/Conversation.jsx`、`app/renderer/app.css`、`app/renderer/card-content.css`、`app/renderer/reference-bookshelf.css`、`scripts/qa-card-viewer.mjs`、`scripts/qa-card-markdown.mjs` 与 `.local/claude-frontend-ux/audit-screens.mjs`。
- 行为差异：卡片弹窗直接显示卡名与前 3 条原文证据；紧凑卡“展开全文 →”位于右侧遮罩外；写作侧栏检索模式按钮与图标设置单行排布；参考库页头统一为 48px。
- 组件旧→新映射：`app/renderer/ui.jsx` 新增 `PageHeader`；`Card` 新增可选参数 `headless`。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：`c1ef246`（`feat(ui): clearer card dialog, compact card actions and sidebar search controls`）。
- 验证：
  - `npm run build && npm test`（2026-11-15 05:10）：PASS（113 / 113 通过）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-card-viewer.mjs`（2026-11-15 05:10）：PASS（`.local/card-viewer-qa-VsP2yk`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-card-markdown.mjs`（2026-11-15 05:10）：PASS（`.local/card-markdown-qa-DEFEq4`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-retrieval.mjs`（2026-11-15 05:11）：PASS（`.local/retrieval-qa-Ch8cOG`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-workspace-ui.mjs`（2026-11-15 05:11）：PASS（`.local/workspace-ui-drSMbu`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs`（2026-11-15 05:11）：PASS（`.local/visual-qa-VvHAAv`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B8`（2026-11-15 05:12）：PASS（0 页面错误，`sub12=[]`，3 窗口无溢出，364px 侧栏短名/单条披露/弹窗去重与前 3 条证据可见断言全过，截图 `.local/claude-frontend-ux/B8-1794690737490/`）。
- 仍有问题与下一步：进入 B9（创作助手页头压缩、记忆抽屉面板与未保存保护、原生 `ConfirmDialog`）。

#### B9：助手页与记忆、应用内确认框（P2-5、P2-11 助手部分）

- 时间与目标：2026-11-15 05:14–05:19；压缩创作助手独立页与写作侧栏页头，将“模型与本书记忆”改造为带未保存修改检测的右侧抽屉/覆盖面板，并在 `ui.jsx` 新增基于原生 `<dialog>` 的 `ConfirmDialog` 替换 `window.confirm`。
- 发现/决定与取舍：
  1. 去掉 `.assistant-eyebrow` 眉题；独立页采用 48px 页头（左 `<h1>创作助手</h1>`，右作品下拉 `<select aria-label="助手作品">` 与 `⋯` 菜单 `aria-label="更多助手操作"`，含 `模型与记忆`、`重新开始讨论`）；紧凑侧栏页头改为单行展示当前书名（截断+`title`）、`⋯` 菜单与关闭按钮（保留 `aria-label="关闭助手侧栏"`）。
  2. “模型与本书记忆”改为独立页带遮罩右侧抽屉（`.assistant-memory-layer.is-drawer`）与紧凑侧栏全覆盖面板（`.assistant-memory-layer.is-compact`），记忆文本框随面板高度伸展；保留 `助手模型`、`刷新反重力模型`、`本书助手记忆`、`保存记忆`、`载入最新记忆`、`记忆文件位置` 等可访问名称；未刷新模型列表时（`!models.length`）下拉显示 `当前：${modelId}（刷新列表确认）`。
  3. 发现原 `useAssistantController.saveMemory` 未同步更新 `state.memory`，本次在 `assistant.memory` 保存成功后同步更新 `state.memory`，确保 `memoryDirty`（`memory !== state.memory`）准确反映未保存状态；有未保存修改时显示 `未保存的修改` 标签，点 `载入最新记忆` 或通过关闭按钮/遮罩/Esc 关闭面板均弹出 `ConfirmDialog` 确认（Esc 由内层菜单/面板优先处理并阻止外层写作抽屉同时关闭；`Writing.jsx` 全局 Esc 增加 `dialog[open]` 保护）。
  4. `ui.jsx` 新增 `ConfirmDialog`（原生 `<dialog>`，`onCancel` 阻止默认并调用 `onCancel`，`useEffect` 中将初始焦点落到 `取消` 按钮并在关闭后归还先前焦点），替换 `Assistant.jsx` 的 `window.confirm`；“重新开始讨论”从底部发送区移入页头 `⋯` 菜单，发送按钮统一使用 `.primary`。
  5. QA 同步说明：
     - `scripts/qa-assistant.mjs` L12：原 L12 点击旧浮层摘要 `getByText('模型与本书记忆', { exact: true })`；因入口改为页头 `⋯` 菜单，同步调整为先点击 `更多助手操作` 再点击菜单项 `模型与记忆`，其余记忆填写、保存与 `assistant.get` 持久化断言原样保留。
     - `scripts/qa-assistant-experience.mjs` L185–224：新增 B9 验证，覆盖未刷新模型文案、`未保存的修改` 提示、`载入最新记忆` 与关闭面板时的 `ConfirmDialog`（初始焦点落在 `取消`、Esc 取消保留手写内容）、`保存记忆` 清除提示以及 `⋯ → 重新开始讨论` 的 `ConfirmDialog` 取消保护。
- 实际变更：修改 `app/renderer/ui.jsx`、`app/renderer/app.css`、`app/renderer/Assistant.jsx`、`app/renderer/assistant.css`、`app/renderer/Writing.jsx`、`scripts/qa-assistant.mjs`、`scripts/qa-assistant-experience.mjs` 与 `.local/claude-frontend-ux/audit-screens.mjs`。
- 行为差异：助手页头统一紧凑；模型与记忆在独立抽屉/面板编辑并受未保存确认保护；重开讨论移入 `⋯` 菜单并使用应用内 `<dialog>` 确认框。
- 组件旧→新映射：`app/renderer/ui.jsx` 新增 `ConfirmDialog`。
- 依赖、IPC、偏好存储键、权限变化：无。
- 提交：B9 提交（`feat(ui): compact assistant header, dedicated memory panel and in-app confirmations`，具体 hash 于 B10 开头补录）。
- 验证：
  - `npm run build && npm test`（2026-11-15 05:17）：PASS（113 / 113 通过）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-assistant.mjs`（2026-11-15 05:17）：PASS（`.local/assistant-v024/ui`）。
  - `node --disable-warning=ExperimentalWarning scripts/qa-assistant-experience.mjs`（2026-11-15 05:18）：PASS（`.local/assistant-027/experience-1794691073044`）。
  - `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B9`（2026-11-15 05:18）：PASS（0 页面错误，`sub12=[]`，3 窗口无溢出，48px 助手页头与记忆抽屉检查全过，截图 `.local/claude-frontend-ux/B9-1794691093735/`）。
  - `node scripts/qa-assistant-responsiveness.mjs`：`NOT_RUN`（需已打包安装版 EXE 与 `reference-v2.sqlite`）。
- 仍有问题与下一步：进入 B10（设置页重组：生效摘要、来源与兼容 API 双卡片拆分、去重顶栏与创作助手分组）。

### 9.4 验证与截图台账

| 旅程/窗口/状态 | 实际命令或操作 | 结果 PASS/FAIL/NOT_RUN | 证据路径 | 未覆盖与限制 |
| --- | --- | --- | --- | --- |
| B0 基线单测（100 项） | `npm run build && npm test` | PASS | 终端日志（100 pass / 0 fail） | 改动前基线核验 |
| B0 改动前全页面基线截图（1460×930 / 980×760 / 880×600） | `node --disable-warning=ExperimentalWarning .local/claude-frontend-ux/audit-screens.mjs B0-baseline` | PASS | `.local/worktrees/claude-frontend-ux/.local/claude-frontend-ux/B0-baseline-1794685557053/` | 仅合成资料与本地无模型模式 |
| B1 写作顺序、v1/v2 卡片只读与侧重筛选 | `npm test` + `qa-writing-workflow` + `qa-writing-regressions` + `qa-card-viewer` + `qa-card-markdown` + `audit-screens.mjs B1` | PASS | `.local/worktrees/claude-frontend-ux/.local/claude-frontend-ux/B1-1794685986461/` | v1 编辑流与 v2 只读态分别覆盖 |
| B2 200 条长对话改动前后轮询与长任务对比 | `measure-assistant-polling.mjs before` / `after` | PASS | `.local/claude-frontend-ux/B2-perf-before-1794686623878/` 与 `B2-perf-after-1794686782080/` | 合成 200 条消息，忙碌期为 IPC 模拟流式 |
| B2 发送键、忙碌草拟与界面回归 | `npm test` (106/106) + `qa-assistant` + `qa-assistant-experience` + `qa-visual` + `audit-screens.mjs B2` | PASS | `.local/assistant-027/experience-1794686840349`、`.local/claude-frontend-ux/B2-1794686862068/` | `qa-assistant-responsiveness.mjs` 记为 `NOT_RUN`（需安装版 EXE 与正式库） |
| B3 参考默认本地混合与跨页状态保持 | `npm test` (106/106) + `qa-workspace-ui` + `qa-retrieval` + `qa-visual` + `audit-screens.mjs B3` | PASS | `.local/workspace-ui-rL3ms1`、`.local/retrieval-qa-cby5VS`、`.local/claude-frontend-ux/B3-1794687067400/` | 仅合成/fixture 资料 |
| B4 启动自动回到上次作品与崩溃/重启恢复 | `npm test` (106/106) + `qa-writing-workflow` + `qa-writing-regressions` + `qa-desktop` + `qa-expansion` + `audit-screens.mjs B4` | PASS | `.local/writing-workflow-BxVx5G`、`.local/writing-regressions-ahUT2q`、`.local/desktop-qa-lL5pam`、`.local/expansion-qa-T4YXLn`、`.local/claude-frontend-ux/B4-1794687783961/` | 仅合成资料与本地模拟扩写服务 |
| B5 字号标尺、D1 默认宽度、专注列宽与无溢出 | `npm test` (109/109) + `qa-writing-workflow` + `qa-writing-regressions` + `qa-desktop` + `qa-visual` + `audit-screens.mjs B5` | PASS | `.local/writing-workflow-c2G8UD`、`.local/writing-regressions-IXZP0I`、`.local/desktop-qa-R4mLCd`、`.local/visual-qa-A0QzYE`、`.local/claude-frontend-ux/B5-1794688476117/` | 仅合成资料；`sub12=[]` 且 3 种窗口尺寸均无横向溢出 |
| B6 写作页结构、可收起侧栏、历史/资料预览与选中提示 | `npm test` (112/112) + `qa-writing-workflow` + `qa-writing-regressions` + `qa-expansion` + `qa-desktop` + `qa-visual` + `audit-screens.mjs B6` | PASS | `.local/writing-workflow-1Bp77A`、`.local/writing-regressions-eLvgDX`、`.local/expansion-qa-p50yJF`、`.local/desktop-qa-FlTCQt`、`.local/visual-qa-5S4Koo`、`.local/claude-frontend-ux/B6-1794689626584/` | 仅合成资料与本地模拟扩写服务；`sub12=[]`、3 种尺寸及折叠侧栏均无横向溢出 |
| B7 整站深色界面、5 主题适配与 WCAG 对比度 | `npm test` (113/113) + `qa-desktop` + `qa-visual` + `audit-screens.mjs B7` | PASS | `.local/desktop-qa-R8DSBV`、`.local/visual-qa-nevIpS`、`.local/claude-frontend-ux/B7-1794690142065/` | 仅合成资料；`app/main` 未改致冷启动首帧前存在短暂白闪；5 主题深色 WCAG 抽检全部达标 |
| B8 参考检索与卡片、页头统一 | `npm test` (113/113) + `qa-card-viewer` + `qa-card-markdown` + `qa-retrieval` + `qa-workspace-ui` + `qa-visual` + `audit-screens.mjs B8` | PASS | `.local/card-viewer-qa-VsP2yk`、`.local/card-markdown-qa-DEFEq4`、`.local/retrieval-qa-Ch8cOG`、`.local/workspace-ui-drSMbu`、`.local/visual-qa-VvHAAv`、`.local/claude-frontend-ux/B8-1794690737490/` | 仅合成/fixture 资料；`sub12=[]` 且 3 种窗口尺寸均无横向溢出 |
| B9 助手页头、记忆抽屉与 `ConfirmDialog` | `npm test` (113/113) + `qa-assistant` + `qa-assistant-experience` + `audit-screens.mjs B9` | PASS | `.local/assistant-v024/ui`、`.local/assistant-027/experience-1794691073044`、`.local/claude-frontend-ux/B9-1794691093735/` | `qa-assistant-responsiveness.mjs` 为 `NOT_RUN`（需安装版 EXE 与正式库）；`sub12=[]` 且 3 种窗口尺寸均无横向溢出 |

### 9.5 最终合并交接（停写时填写）

- 分支、worktree、基线、HEAD：待填写。
- 本轮实现概述与commit顺序：待填写。
- 未完成项、风险与后续建议：待填写。
- 测试通过/失败/NOT_RUN汇总：待填写。
- 需要Codex重点独立复验的操作：待填写。
- main是否前进/已知冲突/依赖变更：待填写。
- 确认保护边界：正式数据/程序/快捷方式是否改动（预期无），私有信息是否进入Git（预期无）；有例外如实列出。
- 运行中的测试程序/CLI/临时服务及关闭状态：待填写。
- 开发已停止写入：待填写时间；等待Codex接手。
