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
| 接手时间 | 待填写 |
| 工作目录/worktree | 待填写 |
| 开发分支 | 待填写 |
| 实际基线commit / 版本 | 待填写 |
| 本轮目标与明确不涉及项 | 待填写 |
| 隔离资料与证据目录 | 待填写 |
| 当前HEAD / 开发是否停写 | 待填写 |

### 9.2 审查发现与取舍

| 编号/优先级 | 页面与复现步骤 | 对作者的影响 | 拟改方案与理由 | 状态/实际commit |
| --- | --- | --- | --- | --- |
| 待填写 | 待填写 | 待填写 | 待填写 | 未开始 |

### 9.3 每批实施记录（复制此模板追加）

- 时间与目标：待填写。
- 发现/决定与取舍：待填写；引用外部方案时附原始链接和许可证。
- 实际变更：待填写；列路径，区分计划与已实现。
- 行为差异：待填写，注明新增/改名/移位/快捷键/默认值变化。
- 组件旧→新映射：待填写或“无”。
- 依赖、IPC、偏好存储键、权限变化：待填写或“无”。
- 提交：待填写真实hash；未提交明确写未提交。
- 验证：填写实际命令、时间、结果、报告/截图路径；未跑为NOT_RUN。
- 仍有问题与下一步：待填写，不能将审美自评等同功能通过。

### 9.4 验证与截图台账

| 旅程/窗口/状态 | 实际命令或操作 | 结果 PASS/FAIL/NOT_RUN | 证据路径 | 未覆盖与限制 |
| --- | --- | --- | --- | --- |
| 待填写 | 待填写 | NOT_RUN | 待填写 | 待填写 |

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
