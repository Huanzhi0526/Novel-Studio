# Claude 前端体验优化执行方案（历史方案，已由Gemini实施）

> 当前状态：本段原始“未开工”说明是编写时快照，现已由Gemini完成实现并由Codex独立验收合并；详见配套交接文档第10节。

- 编写：Claude，2026-11-15。用户已确认第 1 节的决策，并要求**先不开工**。本文是之后逐批执行的依据。
- 配套交接文档：[CLAUDE_前端体验优化交接.md](CLAUDE_前端体验优化交接.md)。保护边界、Git 协作规则、第 9 节修改台账以交接文档为准。本文不替代它。
- 基线：`main@76e6f98`（交接文档提交），功能基线 `ccb1120`，应用 0.2.7。截至本文写成时，**没有修改任何代码**，没有创建分支或 worktree，没有改动正式资料或正式程序。
- 本文件创建于 main 工作目录，目前未跟踪。B0 会把它移入开发分支并提交，然后从 main 目录删除，使 main 恢复干净（见 B0）。
- 审查证据（合成资料，在隔离目录中生成）：`.local/claude-frontend-ux/audit-1794683502033/`、`.local/claude-frontend-ux/audit-1794683675786/`（含 `shots/`、`report.json`）。截图脚本是 `.local/claude-frontend-ux/audit-screens.mjs`、`audit-screens-2.mjs`。

---

## 1. 已确认决策

| 编号 | 决策 | 具体规则 |
| --- | --- | --- |
| D1 | 写作宽度按建议处理 | 不改动用户**已经保存**的“跟随窗口/限制宽度”选择。专注模式**始终**居中显示一列可读宽度。全新用户（本机没有保存偏好）默认“限制宽度”，宽度 680px。“恢复默认”会恢复为新默认值 |
| D2 | 发送键统一为 Enter | 参考检索（独立页和写作侧栏）与创作助手（独立页和写作侧栏）一致：**Enter 发送，Shift+Enter 换行**。输入法正在组字时（`isComposing` 或 `keyCode===229`）不发送。Ctrl/⌘+Enter 作为兼容别名，同样发送，但界面不单独提示。忙碌时按 Enter 既不发送也不插入换行，Shift+Enter 仍然可以换行 |
| D3 | 参考检索默认“本地混合” | v2 模式的初始值从 `fast` 改为 `local`，写作侧栏和参考库页都适用。当次运行中用户切换的模式保留到下次重启前，重启后回到本地混合，**不持久保存**，以保证默认不外传 |
| D4 | 启动后回到上次写作的书 | 启动时如果写作会话里有 `recent.workId`，而且这部作品仍然存在，就自动进入该作品，并恢复上次章节和光标（沿用现有恢复逻辑）。作品不存在或打开失败时停在书架并显示原因。“返回书架”入口保留。恢复备份后（会话已清空）停在书架 |
| D5 | 做独立的整站深色界面 | 新增偏好 `appearance`，取值 `light`（默认）、`dark`、`system`，**与写作纸张颜色互不绑定**。五种主题强调色在深色下都有对应色值 |
| D6 | 先出方案，不开工 | 本文即方案。开工从 B0 开始，按批次推进，每批单独提交、单独验证 |

未在本轮决定、**不做**的事项：主导航改名（“资料与设置”保留，因为大量 QA 依赖这个名字）、书架卡片显示字数和更新时间（需要改 IPC，见第 9 节）、修改主进程窗口底色（见 B7 风险）。

---

## 2. 边界与保护（摘要，以交接文档为准）

- 只在独立 worktree 的 `feat/claude-frontend-ux` 分支上开发，不合并 main，不打包，不改版本号，不升级正式版，不派发其他 Agent。
- 正式目录 `%LOCALAPPDATA%\Novel Studio` 和 `%LOCALAPPDATA%\Programs\Novel Studio` 只读；桌面快捷方式不动。运行、截图、QA 一律使用 `.local/claude-frontend-ux/` 下的隔离资料目录和合成资料。不调用外部模型。
- 范围限于 renderer：`app/renderer/**`、必要的 `app/shared/` 纯函数、`tests/`、`scripts/qa-*.mjs` 定位器，以及 `docs/`、`README.md` 的说明同步。
- **不改**：`app/main/**`、`app/kb-v2/**`、IPC 名称和参数、数据库、检索策略、提示词、CLI 调度、权限、依赖版本。确实需要时先停下来，单独列出原因和范围，等确认后再做。
- 偏好与会话存储保持兼容：`studio.preferences.v1` 新增 `appearance` 字段；`studio.writingSession.v1` 新增 `layout.railCollapsed` 字段。两者都只做**可选的增量字段**，旧版本读到时会自动丢弃（现有 normalize 函数会忽略未知字段），所以双向回退都安全。

---

## 3. 审查发现与对应批次

| 编号 | 问题 | 批次 |
| --- | --- | --- |
| P1-1 | v2 知识卡显示“编辑”，保存时报 `KB_V2_READONLY`（[Reference.jsx#L294](app/renderer/Reference.jsx#L294)、[store-v2.mjs#L582](app/kb-v2/store-v2.mjs#L582)） | B1 |
| P1-2 | 首次打开多卷作品可能落到其他卷的开头（实测落在“第10章”）。原因：[Writing.jsx#L571-L577](app/renderer/Writing.jsx#L571-L577) 按跨卷的 `position` 取第一章 | B1 |
| P1-3 | 默认正文每行约 66 字，专注模式约 85 字 | B5（D1） |
| P1-4 | 大量 10–12px 文字（≤11px 的声明 48 处，12px 的 41 处），根字号 13px | B5 |
| P1-5 | 助手忙碌时输入框被禁用；完成后会无条件清空草稿 | B2 |
| P1-6 | 助手 controller 每秒轮询，两个实例常驻重复渲染（风险，需要测量） | B2 |
| P1-7 | v2 的“类别”下拉其实只调整权重，而且类别名与结果标签对不上 | B1 |
| P2-1 | 章节历史看不到内容就要恢复（后端已经返回 `text`，见 [writing.mjs#L309-L314](app/main/writing.mjs#L309-L314)） | B6 |
| P2-2 | 写作工具栏平铺、按下态缺失、开关侧栏时按钮移位 | B6 |
| P2-3 | 窄窗下侧栏不能收起；遮罩规则不一致；Esc 只在焦点位于抽屉内时生效 | B6 |
| P2-4 | 设置页：模型配置分散、两个保存按钮易混、文案过时、标题重复 | B10 |
| P2-5 | 助手记忆在小浮层里编辑；“载入最新记忆”会覆盖未保存内容；重开讨论用原生 confirm 且紧挨发送 | B9 |
| P2-6 | 资料速查预览显示 Markdown 原文 | B6 |
| P2-7 | 卡片弹窗标题层级、证据默认折叠、“查看完整卡片”看起来像小标题 | B8 |
| P2-8 | 写作侧栏的检索模式切换和“接口设置”被挤成两行 | B8 |
| P2-9 | 发送键不一致 | B2（D2） |
| P2-10 | 离开参考库后，模式和选中作品会重置 | B3 |
| P2-11 | 各页页头不统一 | B8、B9、B10 |
| P2-12 | 查找替换面板字号过小 | B5 |
| P2-13 | AI 扩写选区门槛不直观；“生成预览”没有主按钮样式 | B6 |
| P2-14 | 夜写纸张时外框仍是亮色 | B7（D5） |
| P3 | 对话框焦点圈闭、图标复用、章节菜单样式、删除标记无确认、助手写死的颜色 | B11 |

---

## 4. 设计规范（各批共同遵守）

### 4.1 字号与行高标尺

在 `app.css` 的 `:root` 中定义，各 CSS 文件统一引用，不再写零散的像素值：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--fs-meta` | 12px | 计数、时间、来源、辅助说明、键位提示（**全软件最小字号**） |
| `--fs-ui` | 13px | 按钮、菜单项、卷章树、标签页、表单标签 |
| `--fs-body` | 14px | 界面正文、卡片正文、侧栏正文、设置说明 |
| `--fs-read` | 16px | 助手主阅读列、卡片弹窗正文（写作正文和阅读器另由偏好控制） |
| `--fs-h3 / --fs-h2 / --fs-h1` | 15 / 18 / 22px | 区块标题 / 面板标题 / 页标题 |
| `--lh-ui / --lh-body / --lh-read` | 1.45 / 1.65 / 1.85 | — |

根字号从 13px 改为 14px。禁止新增小于 12px 的文字。

### 4.2 行宽

- 写作正文的可读宽度变量为 `--writing-measure`：“限制宽度”时等于用户设置的宽度；“跟随窗口”时等于 100%。专注模式改用 `--writing-focus-measure`：“限制宽度”时取用户宽度，否则取 `字号 × 42`。
- 依据：[W3C clreq](https://www.w3.org/TR/clreq/)（行长取字号的整数倍）、[WCAG 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)（中日韩文字每行不超过 40 字）。42 字是在 40 字建议上留出一点标点挤压余量。

### 4.3 颜色变量与深色界面

- 统一的语义变量：`--bg --panel --canvas --chrome --ink --muted --border --hover --accent --accent-soft --accent-ink --link --focus --scrim --danger-bg --danger-border --danger-ink --success-bg --success-border --success-ink --warn-bg --warn-ink --shadow`。
- 把写死的颜色（app.css 主题块以外的部分、assistant.css 约 33 处、card-content.css 约 37 处、expansion-dialog.css、manuscript-directory.css、writing.css）替换为语义变量，或基于它们 `color-mix` 出来的值。`.primary` 上的 `color: white` 改为 `var(--accent-ink)`。
- 深色：`.studio[data-appearance=dark]` 设置基础色（参考值 `--bg #1c1e23`、`--panel #23262c`、`--ink #e4e6eb`、`--muted #a0a6b1`、`--border #353943`、`--hover #2c3038`）。每个主题 `[data-theme=x][data-appearance=dark]` 只覆盖 `--accent`、`--accent-soft`、`--link`、`--focus`，提亮到对比度不低于 4.5:1。同时设置 `color-scheme: dark`。
- `system`：通过 `matchMedia('(prefers-color-scheme: dark)')` 解析，并监听变化。
- 写作纸张保持独立：深色界面配白纸是允许的。设置里加一句提示：“夜间写作可搭配『夜写』纸张”，不自动联动。

### 4.4 布局与断点

- 宽窗（≥1120px）时右侧抽屉停靠；窄窗时覆盖正文，并且**所有抽屉一律带遮罩**，点击遮罩关闭（现在只有参考和助手抽屉有遮罩）。
- 左侧栏可以手动收起为 56px 图标条（只保留品牌、四个主导航图标和“展开目录”）。状态保存在 `studio.writingSession.v1` 的 `layout.railCollapsed` 中。图标按钮必须保留 `aria-label` 和 `title`。
- 页头统一：页面级页头高 48px，左边是 H1，右边是页面操作。写作页的工具栏就是它的页头。

### 4.5 键盘

- Esc 优先级：打开的菜单 → 对话框或弹窗 → 扩写预览（恢复原文） → 右侧抽屉 → 专注模式。正文区按 Esc 时如果有抽屉打开，先关闭抽屉，焦点回到触发按钮或正文。输入法组字时一律不处理。
- 发送键见 D2。面板开关按钮使用 `aria-pressed`。本轮不新增全局快捷键。

---

## 5. 分批执行计划

每批的通用要求：

1. 改代码前，先在台账（交接文档 §9.2/§9.3）写下这批要做什么。
2. 每批完成后：`npm run build`，跑本批列出的 QA，用截图脚本截改后的图（输出到 `.local/claude-frontend-ux/<批次>-<时间戳>/`，不覆盖审查证据）。
3. 提交时使用本批给出的提交信息，然后把实际 hash、命令和结果写入 §9.3/§9.4。没有跑的检查写 NOT_RUN。
4. 某批验证失败时不进入下一批。修复后重新验证；如果需要扩大范围，先停下来说明。

### B0 准备工作区与台账

- [ ] 在 main 目录核对 `git status --short`、`git log -1 --oneline`、`git worktree list`，确认 HEAD 和分支名、目录都没被占用。
- [ ] 执行 `git worktree add -b feat/claude-frontend-ux .local/worktrees/claude-frontend-ux main`。
- [ ] 在 worktree 里执行 `npm ci`；Electron 缺失时才运行 `npm run setup:electron`。然后执行 `npm run build` 和 `npm test`，确认改动前的基线结果并记录。
- [ ] 把 main 目录下的本文件移入 worktree 根目录，在交接文档 §9.1 填写接手信息并链接本文件。提交信息：`docs: add confirmed frontend UX execution plan`。确认 main 目录 `git status` 恢复干净。
- [ ] 修正截图脚本：先通过卷章树打开“第一章”，再选中括号；输出目录带批次名。把它复制为 worktree 中的 `.local/claude-frontend-ux/audit-screens.mjs`（`.local` 已被忽略，不入 Git）。在 worktree 下重新截一组**改动前基线**截图。
- 隔离资料目录：`.local/claude-frontend-ux/profile-*`。严禁指向正式目录。

### B1 修正死路与误导控件（P1-1、P1-2、P1-7）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| v2 卡片只读 | `App.jsx`、`Reference.jsx` | `CardEditor` 新增 `editable` 参数，App 传入 `!info?.kbV2`。不可编辑时不渲染“编辑”按钮，在卡片下方显示一行提示：“此卡由参考库建库流程维护，在此只读。”v1 行为不变 |
| 首次打开取第一卷第一章 | `Writing.jsx`、新建 `app/renderer/writing-order.mjs` | 新增纯函数 `orderedChapters(volumes, docs)`：按卷顺序展开，卷内保持接口返回的顺序，排除已删除的章节。`chooseWork` 的回退顺序为：上次文档 → 有位置记录的章节 → `orderedChapters(...)[0]`。顶部现有的 `chapters` 计算也改用这个函数，避免两套逻辑 |
| v2 “类别”改为“侧重” | `Conversation.jsx` | `kbV2` 为真时：标签显示“侧重”，选项为 `['', '不限']`、`['character', '人物与设定']`、`['event', '剧情场次']`、`['technique', '原文描写']`，仍然写入 `filters.categories`（与后端 [search-v2.mjs#L373-L380](app/kb-v2/search-v2.mjs#L373-L380) 的映射一致），`aria-label` 改为“检索侧重”。v1 保持 9 类不变 |
| v2 设置文案 | `Preferences.jsx` | AI 辅助检索的说明里“启用『外部 AI 辅助』时”只在 v1 显示；v2 改为“选择『AI 快速』或『AI 深度翻书』时…”。需要把 `kbV2` 传下去 |

- 新增测试 `tests/writing-order.test.mjs`：两卷章节的 position 都从 0 开始时取第一卷第一章；已删除的章节跳过；空作品返回空。
- 行为变化：v2 不再显示“编辑”；v2 筛选标签改名；首次打开作品落在第一卷第一章。
- 验证：`npm test`；`node scripts/qa-writing-workflow.mjs`；`node scripts/qa-writing-regressions.mjs`；`node scripts/qa-card-viewer.mjs`、`qa-card-markdown.mjs`（v1 下“编辑”仍然存在）；截图脚本中新增“v2 卡片弹窗没有编辑按钮”“首次打开标题为第一章”两项断言。
- 提交信息：`fix(ui): hide read-only v2 card edit, open first chapter in volume order, relabel v2 focus filter`

### B2 发送键与助手等待（D2、P1-5、P1-6）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 统一发送键 | 新建 `app/renderer/input-keys.mjs`、`Conversation.jsx`、`Assistant.jsx` | 纯函数 `sendIntent(event)` 返回 `'send'`、`'newline'` 或 `null`。规则：组字中返回 `null`；Shift+Enter 返回 `'newline'`；不带修饰键或带 Ctrl/⌘ 的 Enter 返回 `'send'`。两个输入框都改用它。助手底部提示由“Ctrl + Enter 发送”改为“Enter 发送 · Shift+Enter 换行”，侧栏也显示（现在侧栏隐藏了提示） |
| 忙碌时可输入 | `Assistant.jsx` | 输入框只在没有选书时禁用；忙碌时只禁用发送按钮，按 Enter 不发送也不插入换行。`run()` 记录已发送的文本 `sent`，完成后执行 `setDrafts(d => d[book] === sent ? { ...d, [book]: '' } : d)`。失败时保留草稿。按书隔离和共享 controller 不变 |
| 轮询降频 | `Assistant.jsx` | `assistant.get` 只在 `pending \|\| state?.busy` 时每秒轮询。空闲时只在以下时机刷新一次：切换书、`active` 从假变真（进入助手页或打开侧栏）、发送结束。首次加载时如果发现 `v.busy` 为真，就开始轮询（用于恢复后台仍在进行的回合）。权限请求和检索任务进度只在忙碌时出现，不受影响 |
| 渲染记忆化 | `Assistant.jsx` | 消息列表抽成 `MessageList = React.memo(...)`，比较条件为消息条数加最后一条的 role 和 text。正在生成的片段单独渲染 |

- 测量（P1-6 的验收依据）：用合成长对话（200 条，每条约 600 字）在隔离目录中打开独立页和侧栏，用 `PerformanceObserver('longtask')` 统计空闲 30 秒和忙碌模拟期间的长任务次数与总时长，改动前后各测一次，写进台账。如果改动前没有明显长任务，就如实记录“风险未复现”，保留降频（它也减少了磁盘读取）。
- 新增测试 `tests/input-keys.test.mjs`：Enter 发送、Shift+Enter 换行、组字中返回 null、keyCode 229 返回 null、Ctrl+Enter 发送。
- 回归重点：两个入口不重复发送；草稿按书隔离；关闭侧栏或换页不取消任务；停止按钮可用；上翻阅读历史时不被抢回底部；失败的原因和未完成输出照常显示。
- 验证：`npm test`；`node scripts/qa-assistant.mjs`；`node scripts/qa-assistant-experience.mjs`（扩展：Enter 发送用模拟方式或只断言 `sendIntent` 的接线、Shift+Enter 插入换行、忙碌期间写的草稿在完成后保留）；`node scripts/qa-assistant-responsiveness.mjs`；`node scripts/qa-visual.mjs`（侧栏检索仍用 Enter）。
- 文档：`docs/创作助手.md` 第 9 行、`docs/assistant-ui-brief.md` 第 7 行改为 Enter 发送。
- 提交信息：`feat(ui): unify Enter-to-send, allow drafting while assistant runs, poll assistant only when busy`

### B3 参考检索默认本地并保留页面状态（D3、P2-10）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 默认本地混合 | `Conversation.jsx` | `useState('fast')` 改为 `useState('local')`。外传说明只在选中 AI 模式时出现（逻辑已经是这样） |
| 保留参考库状态 | `App.jsx`、`Reference.jsx` | 在 App 层保存 `{ mode, selected, archiveOpen, query }`，通过参数传给 `Reference`，替换组件内部的 `useState`。书架滚动位置用 ref 保存在 App 层，回到书架时恢复。点“书架”按钮回到书架列表的行为不变 |

- 行为变化：每次启动默认本地检索；当次切换的模式在会话内保留。从参考库切到别的页面再回来，仍停在原来的模式和作品。
- 验证：`node scripts/qa-workspace-ui.mjs`、`qa-retrieval.mjs`（v1 路径）；截图脚本增加“v2 默认选中本地混合”和“切页回来模式不变”两项断言；`node scripts/qa-visual.mjs`。
- 提交信息：`feat(ui): default reference search to local mode and keep reference view state across pages`

### B4 启动回到上次的书（D4）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 自动进入 | `Writing.jsx` | 在初次的 `loadBookshelf` 里，读取书架后，如果 `session.current.recent?.workId` 存在于 `listing.works`，就在锁定流程结束后调用 `chooseWork(recentId)`（用 ref 保证只执行一次）。失败时停在书架并显示原因。`focusNewDocument` 使正文获得焦点 |
| 保持书架入口 | `Writing.jsx` | “返回书架”按钮的可访问名称保持“返回书架”（QA 依赖）。书架页的“继续写作”标记保留 |

- 不变的部分：恢复备份时 `clearWritingSession()` 已经清空最近记录，所以停在书架；新资料目录（没有最近记录）也停在书架。
- QA 需要更新：`qa-writing-workflow.mjs` 第 322–331 行（重启后直接出现上次章节，再验证“返回书架”可用）；`qa-desktop.mjs` 第 385–391 行（核对 `openFirstChapter` 是否假设启动停在书架）；`qa-expansion.mjs` 第 361–381、426 行的重启等待。改动时在台账逐条写明“因 D4 启动行为变化”，**保存和恢复相关的断言保留**。
- 验证：上面三个脚本，加 `qa-writing-regressions.mjs`。
- 提交信息：`feat(ui): reopen the last manuscript on launch`

### B5 字号标尺、行宽与专注模式（D1、P1-3、P1-4、P2-12）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 字号变量 | `app.css` 及全部 renderer CSS | 按 §4.1 定义变量，根字号改为 14px。逐个文件把 9–12px 的声明替换为变量：卷章树和章节名用 `--fs-ui`；菜单项用 `--fs-ui`；标记、历史、隐私提示、证据链接、页脚计数用 `--fs-meta`。assistant.css 是压缩成单行的，**先格式化成多行**再修改（单独一个格式化提交，不改语义） |
| 偏好模型抽离 | 新建 `app/renderer/preferences-model.mjs` | 把 `normalizePreferences`、`loadPreferences`、`savePreferences`、`writingSurface` 及常量移入，`Preferences.jsx` 重新导出（旧→新的对应关系写入台账）。目的是能用 node 测试 |
| D1 默认宽度 | `preferences-model.mjs` | `loadPreferences`：本机**没有任何**已保存偏好时，用新默认值 `widthMode:'limit'`。有已保存偏好时，沿用现有的归一化规则，包括旧数据缺少 `widthMode` 时回退为“跟随窗口”的规则。`writingDefaults.widthMode` 改为 `'limit'`，影响“恢复默认” |
| 专注模式行宽 | `preferences-model.mjs`、`writing.css`、`Writing.jsx` | `writingSurface` 额外输出 `--writing-focus-measure`。`.is-focused .editor-column` 使用这个宽度并居中；专注模式的工具栏内容也对齐到同一列宽 |
| 查找替换面板 | `writing.css` | `.cm-search` 的输入框和按钮使用 `--fs-ui`，最小高度 30px，间距、颜色用变量。中文短语表不变 |
| README | `README.md` 第 22 行 | 改为“新安装默认限制最大宽度，可切换为跟随窗口；专注模式始终居中显示可读宽度” |

- 新增测试 `tests/preferences-model.test.mjs`：没有保存偏好时默认 limit；保存过 window 时保持 window；旧数据缺 widthMode 且宽度为 680 时为 window；`--writing-focus-measure` 的计算正确。
- 验收：在 1460×930、980×760、880×600 三种窗口下没有横向溢出，按钮没有截断成两行（自动检查：没有元素的 `scrollWidth` 超过 `clientWidth` 加 1，并列出例外）；计算样式中没有小于 12px 的可见文字（截图脚本里统计字号分布）。
- 验证：`npm test`；`qa-writing-workflow`、`qa-writing-regressions`、`qa-desktop`、`qa-visual`；全部页面截图。
- 提交信息（建议分 3 个）：`style: reformat assistant.css without semantic changes`；`refactor(ui): extract preference model for tests`；`style(ui): type scale tokens, readable writing measure and focus column`

### B6 写作页结构（P2-1、P2-2、P2-3、P2-6、P2-13）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 工具栏重排 | `Writing.jsx`、`writing.css` | 从左到右依次为：`‹ 书架`（可访问名称“返回书架”）、面包屑“书名 / 卷名”（最多 36ch，超出截断，悬停显示全文）、撤销和重做、**AI 扩写**（可用时使用强调样式）、标记、历史、查找替换、写作设置、专注、“更多”。整体**左对齐**，开关右侧抽屉时按钮不移位。标记和历史在对应抽屉打开时 `aria-pressed=true`。“更多”菜单合并原来的“作品”和“编辑”两个菜单，分两组：“本章”（一键整理、重命名、导出本章或文档）和“作品”（导入 TXT、导出整书 TXT、重命名作品）。窄窗时用容器查询把次要按钮收进“更多”。所有现有的可访问名称保持不变 |
| 左侧栏收起 | `App.jsx`、`app.css`、`writing-session.mjs` | 侧栏底部加“收起侧栏/展开侧栏”按钮，收起后变成 56px 图标条（§4.4）。`normalizeSession` 增加 `layout: { railCollapsed: boolean }` 字段，并补充测试。专注模式和阅读器的现有隐藏逻辑不变 |
| 抽屉遮罩与 Esc | `Writing.jsx`、`writing.css` | 非停靠时所有抽屉统一使用 `writing-overlay-dismiss` 遮罩。在 window 级监听 Esc：有抽屉打开、没有对话框、没有扩写预览、没有打开的菜单、不在组字时，关闭抽屉并恢复焦点（不再要求焦点在抽屉内）。专注模式退出逻辑排在它之后 |
| 历史预览 | `Writing.jsx`、`writing.css` | 历史列表每项显示时间、字数（`wordCount(text)`）和与当前字数的差值，例如 `+120 / −35`。点击一项后在抽屉内显示只读正文预览，上方有“恢复此版本”（沿用现有确认框）和“返回列表”。默认显示 20 条，可以“显示更多” |
| 资料速查渲染 Markdown | `WritingResources.jsx`、`writing-resources.css` | 大纲、角色、设定的预览用 `react-markdown` 渲染，元素白名单为 h1–h4、p、strong、em、ul、ol、li、blockquote、br、hr，不允许原始 HTML（`skipHtml`）。章节对照仍然按纯文本显示 |
| 扩写入口提示 | `app/shared/expansion-selection.mjs`、`Writing.jsx`、`ExpansionDialog.jsx` | 新增纯函数 `enclosingExpansionPair(lineText, offset)`，返回光标所在行中包住光标的最内层括号对，或 null，**不修改**现有的 `expansionSelection`。在章节中、光标为空选区且位于括号内时，工具栏 AI 扩写旁出现“选中提示”按钮，点击后把选区设为这对括号（含括号本身），之后仍需要用户点“AI 扩写”。对话框里“生成预览”使用主按钮样式 |

- 新增测试：`tests/expansion-selection.test.mjs` 补充 `enclosingExpansionPair` 的用例（中英文括号、嵌套、光标在括号外、超长内容）；`tests/writing-session.test.mjs` 补充 layout 字段的用例。
- 回归重点：保存、切书、关闭前保存；Esc 优先级（扩写预览时第一次 Esc 恢复原文，第二次退出专注，对应 `qa-expansion.mjs` 第 320–346 行）；新建或重命名弹窗内 Tab 循环；未采纳的扩写不改原稿。
- 验证：`npm test`；`qa-writing-workflow`、`qa-writing-regressions`、`qa-expansion`、`qa-desktop`、`qa-visual`；在三种窗口下截图，并手动测试键盘（Tab、Esc、方向键切换工具条）。
- 提交信息（建议分 3 个）：`feat(ui): stable writing toolbar with grouped overflow menu`；`feat(ui): collapsible rail, consistent drawer overlay and Esc`；`feat(ui): history preview, rendered material preview, expansion prompt helper`

### B7 整站深色界面（D5、P2-14）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 偏好字段 | `preferences-model.mjs` | `appearance` 取值为 `light`、`dark`、`system`，默认 `light`，非法值回退为 `light` |
| 解析与应用 | `App.jsx` | `useResolvedAppearance(pref)` 监听系统主题，在 `.studio` 上设置 `data-appearance`；`document.documentElement.style.colorScheme` 跟着切换。`index.html` 的 `color-scheme` 改为 `light dark` |
| 颜色变量化 | 全部 renderer CSS | 按 §4.3 替换写死的颜色；提示框（notice）的 danger、success 和琥珀色标签使用语义变量 |
| 设置入口 | `App.jsx`（外观组） | “界面明暗：浅色 / 深色 / 跟随系统”三段按钮，旁边提示“写作纸张在『写作偏好』中单独设置” |

- 已知限制：主进程窗口底色是 `#ffffff`（[index.mjs#L322](app/main/index.mjs#L322)），深色启动时**可能闪一下白色**。修复需要改主进程，本轮不做，写入台账，交给 Codex 或用户决定。
- 验收：5 种主题 × 浅色/深色 × 白纸/夜写，覆盖写作页、参考检索和卡片、阅读器、助手、设置；主要文字对比度不低于 4.5:1，次要文字不低于 3:1（用脚本抽样计算对比度）；没有残留亮色块。
- 新增测试：`tests/preferences-model.test.mjs` 补充 appearance 的用例。
- 验证：`qa-desktop`（第 394–396 行的主题和纸张断言仍然通过）、`qa-visual`；全量截图。
- 提交信息：`feat(ui): independent dark appearance with semantic color tokens`

### B8 参考检索与卡片、页头统一（P2-7、P2-8、P2-11）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 卡片弹窗 | `ui.jsx`、`Reference.jsx` | `CardEditor` 用卡名作为弹窗标题，眉题为“作品名 · 类型标签”。`Card` 新增 `headless` 参数，弹窗内不再重复显示标题和眉题。证据默认展开前 3 条，其余放进“另有 N 处”折叠 |
| 紧凑卡片 | `ui.jsx`、`card-content.css`、`app.css` | “查看完整卡片”改为卡片底部右侧的链接样式按钮“展开全文 →”，渐隐遮罩不压住它。证据链接使用 `--fs-meta`（12px），去掉 10px 的副标题 |
| 侧栏检索 | `Conversation.jsx`、`app.css` | 侧栏模式下，模式按钮显示短名“本地 / 快速 / 深度”（`title` 保留完整说明，可访问名称保留完整名称）。“接口设置”改为图标按钮，`aria-label` 为“接口设置”。两条外传说明合并为一条 |
| 页头组件 | `ui.jsx`、`App.jsx`、`Reference.jsx` | 新增 `PageHeader({ title, actions })`，参考库页使用。设置页去掉顶栏，只保留页内 H1（B10 中完成）。v2 检索区的标题“创作参考检索 (KB v2)”改为“参考检索”，作品数量放在副标题 |

- 验证：`qa-card-viewer`、`qa-card-markdown`、`qa-retrieval`、`qa-workspace-ui`、`qa-visual`；截图覆盖长卡名、长证据标题和 364px 侧栏。
- 提交信息：`feat(ui): clearer card dialog, compact card actions and sidebar search controls`

### B9 助手页与记忆（P2-5、P2-11 助手部分）

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 页头压缩 | `Assistant.jsx`、`assistant.css` | 去掉眉题。独立页页头为：“创作助手” H1、作品选择、“⋯”菜单（模型与记忆、重新开始讨论）。侧栏页头只占一行：当前书名（截断）、“⋯”、关闭按钮 |
| 记忆面板 | `Assistant.jsx`、`assistant.css` | “模型与本书记忆”从浮层改为右侧抽屉（独立页）或覆盖整个侧栏的面板（侧栏），文本框高度随面板。显示“未保存的修改”标记；在有未保存修改时“载入最新记忆”需要确认；关闭面板时如果有未保存修改也需要确认。“记忆文件位置”保留在折叠区 |
| 统一确认框 | `ui.jsx`、`Assistant.jsx` | 新增 `ConfirmDialog`（原生 `<dialog>`，Esc 取消，焦点落在“取消”）。替换 `window.confirm`。“重新开始讨论”从输入区移到“⋯”菜单 |
| 模型显示 | `Assistant.jsx` | 在模型列表还没刷新时，下拉框显示“当前：gemini-3.8-flash-low（刷新列表确认）”，与设置页的写法一致 |

- QA 需要更新：`qa-assistant.mjs` 第 12–13 行（打开记忆的方式从浮层改为面板；可访问名称“本书助手记忆”“保存记忆”保持不变，只改打开入口的定位）。
- 验证：`qa-assistant`、`qa-assistant-experience`、`qa-assistant-responsiveness`；截图覆盖独立页、侧栏、980px 和 880px 窗口。
- 提交信息：`feat(ui): compact assistant header, dedicated memory panel and in-app confirmations`

### B10 设置页重组（P2-4）

保持现有分组按钮名称（“外观与阅读”“写作偏好”“AI 辅助检索”“AI 扩写”“本机资料”）和“保存模型来源”等按钮名称不变，QA 依赖这些名字；只在其后增加“创作助手”分组。

| 任务 | 文件 | 实现要点 |
| --- | --- | --- |
| 生效摘要 | `RetrievalPreferences.jsx` | 每个 AI 分组顶部显示一行状态，例如“当前生效：反重力 · gemini-3.8-flash-low”“兼容 API · 某模型”“未配置（检索将仅用本地）”。根据已保存的来源（auto、api、agy）和 API 配置是否存在，在前端推算 |
| 区块分隔 | `RetrievalPreferences.jsx`、`Preferences.jsx` | 拆成两张有标题的卡片：“模型来源”（带“保存模型来源”）和“兼容 API 配置”（带“保存配置”）。API 卡片在来源为 agy 时隐藏（现状），为 auto 时折叠并显示“已配置/未配置”，为 api 时展开。删除重复出现的“AI 辅助检索”二级标题 |
| 创作助手分组 | `App.jsx` | 只放说明：“助手模型按每本书在创作助手页选择”，加一个“打开创作助手”按钮。不读写任何助手配置 |
| 标题去重 | `App.jsx` | 设置页不再渲染顶栏，只保留页内标题“资料与设置” |
| 外观组 | `App.jsx` | 包含主题色、界面明暗（B7）、阅读字号 |

- 验证：`qa-agy-model-settings`、`qa-agy-expansion-settings`（包括 API 配置和 Key 文件字节不变的断言）、`qa-expansion`（设置跳转）、`qa-retrieval`。
- 提交信息：`feat(ui): settings show effective model and separate source from API profile`

### B11 润色、全量复核与交回

- P3：`Modal` 改为原生 `<dialog>` 或补全焦点圈闭和 Esc；区分图标（创作助手用对话图标，AI 扩写用笔加星号图标，品牌图标保留）；章节“⋯”菜单项改为无边框列表，字号用 `--fs-ui`；删除标记后显示“已删除 · 撤销”提示，5 秒内可撤销，撤销通过重新 `addMark` 实现，**不新增 IPC**；做不到则改为确认框，写入台账。
- 全量验收：按第 7 节矩阵截图，运行交接文档 §7 中全部相关 QA，没跑的写 NOT_RUN。
- 填写交接文档 §9.3–§9.5：分支、worktree、基线、HEAD、commit 列表、旧→新组件对应、依赖/IPC/存储键/快捷键变化（预期：IPC 无；依赖无；存储键新增 `appearance` 和 `layout.railCollapsed`；快捷键：助手由 Ctrl+Enter 改为 Enter，Ctrl+Enter 仍可用）、风险和未完成项。
- `git diff --stat main...HEAD`、`git log --oneline main..HEAD` 核对；确认分支没有未提交的改动；关闭所有测试进程；声明停止写入，等待 Codex 验收。
- 提交信息：`chore(ui): polish and record frontend UX handoff`

---

## 6. QA 定位器与文档同步清单

原则：只改因为文案或结构变化而过时的定位器，**不删除保存、证据、取消这类行为断言**。每处修改都在台账写明原因。

| 文件与位置 | 涉及批次 | 处理方式 |
| --- | --- | --- |
| `scripts/qa-writing-workflow.mjs` L322–331 | B4 | 重启后直接断言上次章节标题，再点“返回书架”断言书架可达；记录文案改为“重启自动回到上次作品…” |
| `scripts/qa-desktop.mjs` L385–391 | B4 | 核对 `openFirstChapter` 是否假设启动停在书架，必要时先判断当前是否已在编辑器中 |
| `scripts/qa-expansion.mjs` L361–381、L426 | B4 | 重启后的等待对象从书架改为编辑器，或兼容两种情况 |
| `scripts/qa-assistant.mjs` L12–13 | B9 | 打开记忆面板的入口改为“⋯ → 模型与记忆”；字段名称不变 |
| `scripts/qa-assistant-experience.mjs` | B2、B9 | 增加 Enter、Shift+Enter、组字、忙碌时草稿保留的检查；侧栏页头定位随 B9 调整 |
| `scripts/qa-card-viewer.mjs`、`qa-card-markdown.mjs`（“编辑”） | B1 | v1 环境不变；在截图脚本里新增 v2 没有“编辑”的断言 |
| `scripts/qa-retrieval.mjs`、`qa-workspace-ui.mjs`（“外部 AI 辅助”） | — | v1 路径，不变 |
| `scripts/qa-visual.mjs` L64、`qa-writing-workflow.mjs` L66（“返回书架”） | B6 | 可访问名称保持“返回书架”，不需要改 |
| `docs/创作助手.md` L9、`docs/assistant-ui-brief.md` L7 | B2 | 改为 Enter 发送，Shift+Enter 换行 |
| `README.md` L22 | B5 | 写作宽度默认值的说明 |
| `README.md`（外观段落） | B7 | 补充界面明暗说明 |

---

## 7. 验收矩阵

| 旅程 | 1460×930 | 980×760 | 880×600 | 主题与明暗 |
| --- | --- | --- | --- | --- |
| 启动回到上次作品 → 写作 → 切章 → 返回书架 | 截图加 QA | 截图 | 截图 | 墨灰浅色、松绿深色 |
| 大纲、角色、设定预览（Markdown）和章节对照 | 截图 | 截图（遮罩） | 截图 | 浅色、深色 |
| 标记、历史预览与恢复 | 截图加 QA | 截图 | — | 浅色 |
| AI 扩写：选中提示 → 对话框 → 错误或取消（不调用外部模型） | 截图加 qa-expansion（模拟 API） | — | — | 浅色、深色 |
| 专注模式（跟随窗口和限制宽度两种设置下都是居中一列） | 截图 | 截图 | 截图 | 白纸、夜写 |
| 参考检索：默认本地 → 结果 → 卡片 → 原文 → 返回 | 截图加 QA | 截图 | — | 浅色、深色 |
| 写作侧栏检索和助手（Enter 发送、草稿共享、按书隔离） | 截图加 QA | 截图 | 截图 | 浅色、深色 |
| 助手独立页：记忆面板、确认框、忙碌时输入 | 截图加 QA | 截图 | — | 浅色、深色 |
| 设置：生效摘要、来源与 API 卡片、界面明暗 | 截图加 QA | 截图 | — | 浅色、深色 |
| 键盘：Tab 顺序、Esc 优先级、方向键切换工具条、组字 | 手测记录 | — | — | — |
| 自动检查：横向溢出、小于 12px 的文字、对比度抽样 | 脚本 | 脚本 | 脚本 | 全部 |

---

## 8. 风险与回退

| 风险 | 缓解方式 |
| --- | --- |
| 根字号上调导致窄窗溢出 | B5 自带溢出检查；工具栏在 B6 改为容器查询收纳。如果 B5 单独合入后出现溢出，先在 B5 里临时压缩间距 |
| 启动自动进入作品与关闭前保存、恢复备份、锁定流程冲突 | 复用 `chooseWork` 和 `withEditorLocked`，只执行一次；qa-writing-workflow 和 qa-desktop 的重启与崩溃恢复用例必须通过 |
| 助手轮询降频后漏掉状态 | 忙碌时仍每秒轮询；切书、进入页面、发送结束时都主动刷新；qa-assistant 系列，加长任务模拟用例（停止、失败、权限） |
| Enter 发送导致误发长段落 | Shift+Enter 换行，组字保护，提示文字常显；忙碌时 Enter 不起作用 |
| 深色界面对比度不足、残留亮色块 | 语义变量全面替换，脚本抽样计算对比度，5 种主题全量截图 |
| QA 定位器调整掩盖行为回退 | 只改定位方式不改断言；每处修改都在台账写明原因；Codex 独立复验 |

回退方式：每批单独提交，可以用 `git revert <hash>` 逐批回退。新增的偏好和会话字段都是可选字段，回退后旧代码会自动忽略。本轮不涉及数据库和正式资料，没有数据回退问题。隔离资料目录可以直接删除重建。

---

## 9. 后续待确认（本轮不做）

- 书架卡片显示总字数、章节数、最近编辑时间：需要 `writing.list` 返回这些字段（IPC 改动）。
- 主进程窗口底色跟随明暗，以避免深色启动时的白闪：需要改 `app/main/index.mjs`。
- 主导航“资料与设置”是否改名：会影响大量 QA 和文档。
- 写作日更目标、全书字数统计：属于新功能，不在本轮体验优化范围内。

## 10. 交回要求

按交接文档 §8 执行：提交代码和记录，分支没有未提交的改动；写明分支、worktree、基线、HEAD、commit 列表和建议审查顺序（B1 → B11）；列出依赖、IPC、存储键、快捷键的变化；向用户说明已经停止写入，等待 Codex 独立验收与合并。
