# 构建、验收与发布检查清单

所有命令从项目根目录运行。当前工作区为 `D:\Vibe Coding\Novel Studio`。新机器可以从源码 ZIP 解压后开始。已验证 Windows x64、PowerShell 7、Node.js 24.16.0 和 npm 11.13.0。转换器测试使用 Python 3，本机以 Python 3.10 复验。Windows 安装器使用 NSIS 3.13。

## 仅文档维护

先核对实际版本与引用入口，更新HANDOFF并区分当前/历史；代码和程序无变更时不自动升版本、构建安装器或重装，不为文档修改重跑外部模型。完成文档后运行npm run package:source，验证ZIP完整、版本一致和打包文件与工作区字节一致，重算该版本源码SHA；安装器SHA必须与此前回执一致。验收记录明确测试NOT_RUN及原因。原始历史原文可归档docs/history并从入口链接，不抹去原验收证据。

## 准备和源码验证

1. 读 [README](../README.md)、[CONTEXT](../CONTEXT.md) 和 [HANDOFF](../HANDOFF.md)，确认本次改动范围、数据目录和已验版本。已有依赖的同一工作区可直接构建。首次解包或依赖变动后执行 `npm ci`。
2. 执行与改动相关的检查，记录实际版本、命令、结果和报告位置。运行源码桌面检查前先执行 `npm run build`。

```powershell
npm ci
npm run setup:electron
npm run build
npm test
python -m unittest discover -s '拆书规范包/tools/tests' -v
node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs
node --disable-warning=ExperimentalWarning scripts/qa-writing-workflow.mjs
node --disable-warning=ExperimentalWarning scripts/qa-writing-regressions.mjs
node --disable-warning=ExperimentalWarning scripts/qa-expansion.mjs
node --disable-warning=ExperimentalWarning scripts/qa-retrieval.mjs
node --disable-warning=ExperimentalWarning scripts/qa-workspace-ui.mjs
node --disable-warning=ExperimentalWarning scripts/qa-card-viewer.mjs
node --disable-warning=ExperimentalWarning scripts/qa-card-markdown.mjs
```

桌面脚本使用 Electron 和 Playwright，测试资料创建在 `.local` 的独立目录。Playwright 通过项目内安装的 Electron 运行。扩写脚本默认启动本机模拟接口。报告和截图以各命令输出的实际路径为准。手动运行源码时也应指定独立资料目录，便于和桌面正式版同时打开。

知识卡格式或配色改动运行 `qa-card-markdown.mjs`，覆盖受限 Markdown、九类配色、分组及旧式标签、窄窗、源文保存与证据跳转。可传入隔离安装的 EXE；给仍为纯文本显示的旧版本增加 `--before`，复现格式符号直接显示。

`setup:electron` 调用已锁定版本的上游安装器。若本机无法从发布站下载运行时，可使用发布目录中的原版 Windows x64 ZIP，脚本会按 npm 包附带的 SHA-256 校验后安装。迁机时把下例的路径替换为 ZIP 实际位置。[Electron 安装文档](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md)

```powershell
npm run setup:electron -- 'D:/交接资料/electron-v43.2.0-win32-x64.zip'
```

```powershell
$previousDataDir = $env:NOVEL_STUDIO_DATA_DIR
$env:NOVEL_STUDIO_DATA_DIR = Join-Path (Get-Location).Path '.local/manual-qa-profile'
try { npm start } finally { $env:NOVEL_STUDIO_DATA_DIR = $previousDataDir }
```

## 按需复跑真实样本

| 检查 | 命令 | 所需文件 |
| --- | --- | --- |
| 书架、写作、参考对话和阅读截图 | `node --disable-warning=ExperimentalWarning scripts/qa-visual.mjs` | 源码随附 `scripts/fixtures/xiyou/result.zip`，含公版《西遊記》的标准参考结果 |
| 真实本地语义与关键词对照 | `node --disable-warning=ExperimentalWarning scripts/qa-search.mjs` | 同一结果包、随附的 `queries.json` 和解压到 `.local/model` 的 Qwen3 模型目录 |
| 安装版模型与证据定位 | `node --disable-warning=ExperimentalWarning scripts/qa-installed-model.mjs $testedExe $modelDir` | 已验收隔离安装路径、已解压 `model` 目录和随源码附带的公版结果包 |
| wenku8 EPUB 生成器 | `node --disable-warning=ExperimentalWarning scripts/qa-downloader.mjs` | `.local/downloader/fixture-cli/node_modules/wenku8/dist/epub/builder.js`，历史复验使用 wenku8 5.1.0 |

本机已有模型目录 `.local/release-model-probe-full/model`。换机器可将模型 ZIP 解压到 `.local`，得到默认的 `.local/model`。使用其他目录时，给 `qa-search.mjs` 传入样本目录、模型目录和可选语义阈值三个位置参数。默认样本的报告写入 `.local/search-qa`。显式传入样本目录时，报告按既有行为写回该目录，复跑旧报告前可使用样本副本。合成样本的桌面测试可独立运行。

运行安装版模型复验前，将 `$modelDir` 设为已解压的模型目录绝对路径。下节的隔离安装步骤会提供 `$testedExe`。

## 生成安装器和隔离验收

检查 `package.json` 与 `package-lock.json` 的版本一致。NSIS 已加入 PATH 时，`npm run package:windows` 会调用 `makensis.exe`。本机留有 `.local/nsis-official/nsis-3.13/makensis.exe`，也可用环境变量指定另一份已安装的 NSIS 绝对路径。

```powershell
$localNsis = '.local/nsis-official/nsis-3.13/makensis.exe'
if (!$env:NOVEL_STUDIO_MAKENSIS -and (Test-Path -LiteralPath $localNsis)) {
  $env:NOVEL_STUDIO_MAKENSIS = (Resolve-Path -LiteralPath $localNsis).Path
}
npm run package:windows
if ($LASTEXITCODE -ne 0) { throw 'Windows 安装包构建失败' }
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path -LiteralPath "release/NovelStudio-$version-x64-Setup.exe").Path
$qaInstall = Join-Path (Get-Location).Path ('.local/install-qa-' + [guid]::NewGuid().ToString('N'))
$process = Start-Process -FilePath $installer -ArgumentList ("/S /NOSHORTCUT /D=$qaInstall") -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "隔离安装失败，退出码 $($process.ExitCode)" }
$testedExe = (Resolve-Path -LiteralPath (Join-Path $qaInstall 'Novel Studio.exe')).Path
$installedVersion = (Get-Content -LiteralPath (Join-Path $qaInstall 'resources/app/package.json') -Raw | ConvertFrom-Json).version
if ($installedVersion -ne $version) { throw "隔离安装版本异常 $installedVersion" }
node --disable-warning=ExperimentalWarning scripts/qa-installed-smoke.mjs $testedExe $version
if ($LASTEXITCODE -ne 0) { throw '隔离启动检查失败' }
node --disable-warning=ExperimentalWarning scripts/qa-desktop.mjs $testedExe
if ($LASTEXITCODE -ne 0) { throw '隔离桌面验收失败' }
```

`/D=` 参数应在最后。隔离安装使用 `/NOSHORTCUT` 保留正式快捷方式和正式卸载登记。可将 `$testedExe` 作为位置参数交给写作、视觉和扩写脚本。视觉脚本还可接收模型目录作为第二个位置参数。正式发布前目视检查本次涉及的页面，记录宽窄窗口、中文长标题及键盘路径等与改动相关的结果。

修改参考作品封存功能时，在隔离库用真实模型检查一部已有卡的作品。先记录可命中的查询和证据，再确认封存后在日常书架、作品筛选、限书和全库检索里均被排除。单本恢复后，同一卡片和原文证据应可用。正式批量封存前保留独立资料备份，复验目标书目与变更范围。

## 正式升级及交付

1. 正常退出正式工作台，让编辑器保存并关闭数据库。检查仍有写作保存失败时，先用应用提供的重试和导出入口处理。
2. 核对正式资料目录 `%LOCALAPPDATA%\Novel Studio`。在正常退出后记录 `library.sqlite` 和已存在的 `library.sqlite-wal`、`expansion.json`、`embedding.json`、`retrieval-api.json` 的 SHA-256。保留应用内备份。安装器与资料目录分开，文件核对可用 `Get-FileHash -Algorithm SHA256 -LiteralPath $path`。
3. 使用已隔离验收的安装器进行本机正式升级。默认安装目录为 `%LOCALAPPDATA%\Programs\Novel Studio`。升级脚本比较正式与隔离安装的 EXE、`resources/app/app/main/index.mjs`、`resources/app/dist/app.js` 和 `app.css` 的哈希，并复核正式资料文件。
4. 从桌面「小说工作台」快捷方式打开应用，核对目标是正式安装目录的 `Novel Studio.exe`。可用 `scripts/qa-installed-smoke.mjs` 检查目标程序报告的版本和 AI 扩写设置。记录升级结果、实际路径、版本和哈希到[验收记录](acceptance.md)。
5. 更新版本对应的交接和验收记录，再执行 `npm run package:source`。核对 ZIP 可解压、版本一致，包含源码、脚本和交接文档。计算各交付文件 SHA-256。

使用本节的正式升级步骤时，沿用上节的 `$version` 和 `$qaInstall`。已退出应用后可直接执行。需要脚本请求应用正常退出时，增加 `-GracefulClose`。脚本会在隔离资料目录中启动正式目标程序，默认回执为 `.local/formal-upgrade-<版本>.json`。可用 `-RecordFile` 另行指定回执路径。

```powershell
& '.\scripts\upgrade-windows.ps1' -Version $version -IsolatedInstall $qaInstall
npm run package:source
```

| 交付件 | 用途与边界 |
| --- | --- |
| `release/NovelStudio-<版本>-x64-Setup.exe` | Windows x64 应用安装包。由本机生成，未签名 |
| `release/NovelStudio-<版本>-source.zip` | 源码、构建与验收脚本及文档。由 `npm run package:source` 生成 |
| `release/electron-v43.2.0-win32-x64.zip` | 可选的上游 Windows x64 开发运行时。由 `npm run setup:electron -- <zip>` 校验并安装 |
| `release/通用拆书规范包_v0.4.zip` | 外部拆解的规范、Schema 与转换器。应用打包时一并生成，也可单独执行 `node scripts/package-spec.mjs` |
| `release/NovelStudio-LocalModel-Qwen3-Q8_0.zip` | 可选离线语义权重和 CPU 运行时。上游材料齐全时用 `node scripts/package-model.mjs <上游材料目录>` 重建 |
| `release/NovelStudio-知识库-20261110-256卷.zip` | 知识卡整改前的参考资料快照。解压后逐本审核导入内层 `result.zip`，配套旧验收记录为 `NovelStudio-0.1.5-256卷验收记录.zip`。新版卡片修订批另见[整改记录](knowledge-card-remediation.md) |
| 应用内导出的备份 ZIP | 正式资料恢复入口，包含数据库及其清单，按 [README](../README.md) 恢复。扩写密钥另由 Windows 用户的加密配置保护 |

接手时记录源码包与安装包的版本和摘要，核对需要随交接提供的真实样本和证据。源码包保留项目文件，发布资料、用户数据库、私有原文和本机测试输出分别保存在各自位置。

修改图标后，分别核对 Windows 从安装器、隔离安装的应用 EXE、卸载器提取出的图标。正式升级脚本会给桌面快捷方式设置已安装的 ICO 文件，并在回执中记录目标。


创作助手/写作侧栏改动增加 `node scripts/qa-assistant.mjs <隔离EXE>` 和 `node scripts/qa-assistant-experience.mjs <隔离EXE>`；长任务协议需验提交立即返回、领取/失败/取消、跨书隔离，并以合成数据做超过180秒的真实模型领取测试，不能仅用固定句连接成功证明整条流程稳定。


## 助手/检索阅读布局改动

运行`node scripts/qa-readability.mjs $testedExe`验证长/短表、短卡网格、全文入口、细滚动条和深色窄窗；采用合成资料、无外部模型请求。此脚本使用showInactive的可见窗口，以实际触发布局测量。`qa-assistant-experience.mjs`继续验证发送快捷键/草稿/记忆；`qa-assistant-layout.mjs`验证拖动与宽度记忆。全文Markdown和证据由`qa-card-markdown.mjs`、`qa-card-viewer.mjs`、`qa-retrieval.mjs`覆盖，别用短预览替代详情验收。
