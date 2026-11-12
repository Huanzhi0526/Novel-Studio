# Windows 本地运行时

采用 Electron 43.2.0、React、CodeMirror 6 与 JavaScript ES modules。渲染端用 esbuild 构建。Electron 内置 Node 24.18.0 的 `node:sqlite` 实测支持 SQLite 3.53.1 与 FTS5，避免单独维护原生 SQLite ABI。

SQLite 使用 WAL、外键与同一主进程单写入。图片、原始文件副本和正文随数据库事务提交，备份使用一致快照。原创表与参考表独立，参考 FTS5 和向量仅由已入库知识卡生成。

语义采用 Qwen3-Embedding-0.6B Q8_0、llama.cpp b12224 Windows CPU x64。工作台按需启动并管理子进程，用带随机密钥的回环 HTTP 直接连接，关闭浏览界面和公网监听。选择 GGUF 是为了简化离线交付与 Windows 运行环境。保留已有 Python Sentence Transformers 适配路径供手动配置。

检索使用 OpenCC 繁简归一化、ICU 中文切词、FTS5 和短词子串，语义候选按余弦阈值过滤，两路按 RRF 融合。模型缺失、故障或索引待构建时显示关键词降级。默认阈值根据首份公版试拆查询集校准，后续用更多题材复验。
