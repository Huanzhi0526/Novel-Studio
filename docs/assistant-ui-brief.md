# 创作助手当前UI约定（0.2.10，2026-11-15）

目标：作者边写边讨论大纲和情节，读清建议与依据，能随时停止、换入口不丢草稿。此页记录已实现行为；最初0.2.7的74ch阅读列已由后续用户指令替代。

## 对话画布与侧栏

主视图为作品上下文、独立滚动对话区和固定输入区。助手回复使用可用宽度，用户气泡靠右，保留响应式边距；不再限制74ch。独立页正文16px，侧栏14px，标题/短段落/列表/引用分层。上翻阅读时不强拉到底部。

右上角菜单打开“模型与记忆”，记忆面板提供未保存保护。参考资料默认折叠，展开后显示响应式短卡网格。输入区不常驻大段说明；快捷键悬停可见，发送范围在使用说明中查看，失败/未完成状态始终明确。

写作右侧栏与正文之间支持拖动分界线：280～960px、默认364px，停靠时保留正文空间，窄窗覆盖。方向键10px，Shift为40px，Home/End边界，双击默认；已选宽度记在既有writingSession.layout.drawerWidth，临时缩窗不覆盖。独立页和侧栏复用App controller，按书隔离草稿，切页/收起不取消本轮任务。

Enter发送、Shift+Enter换行，Ctrl/⌘+Enter兼容；IME组字不误发，忙碌时仍可草拟，不重复发送。侧栏绑定当前书，不自动抓取章节全文。

## 回复与参考卡

每轮提示追加短段落/分幕输出要求；显示层支持GFM短表，并将长表按原列转为分节，只有明确可还原的单行表才补显示换行。历史chat.json保持原字节，表格显示修复不等于模型输出内容质量验证。

对话卡先展示最多160字、三行的既有看点或原文摘录；宽窗并排、窄栏单列。标题/展开全文打开完整卡，原文证据折叠但可定位。实际cursor分页仍按用户加载，不自动多发AI请求。滚动条6px、透明轨道、低对比扁平滑块，保留原生滚动行为。

## 代码与验证

入口：Assistant.jsx、assistant.css、PanelResizer.jsx、writing-session.mjs、assistant-markdown.mjs、card-preview.mjs、ui.jsx；输出规范为app/main/assistant-presentation.mjs。详细显示边界见[阅读体验优化](阅读体验优化.md)。

专项脚本qa-readability、qa-assistant-experience、qa-assistant-layout均支持隔离安装EXE；完整卡片和证据另跑qa-card-markdown/card-viewer/retrieval。可见不抢焦点的showInactive窗口/native capture用于取得有效帧，隐藏窗口测量不能冒充实际可见布局验收。

已发布证据：.local/ux-readability-0210（117项单测及安装版检查，详见HANDOFF）；截图仅为自查，不冒充所有主题对比度认证或实际书籍建议质量。旧0.2.7截图和设计选择仅属当时历史。
