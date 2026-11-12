import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BackupService } from './backup.mjs';
import { EmbeddingProvider } from './embedding.mjs';
import { ExpansionService } from './expansion.mjs';
import { ImportService, ReferenceService } from './reference.mjs';
import { SearchService } from './search.mjs';
import { RetrievalService } from './retrieval.mjs';
import { Store, fail } from './store.mjs';
import { WritingService } from './writing.mjs';
import { ReferenceStoreV2 } from '../kb-v2/store-v2.mjs';
import { SearchEngineV2 } from '../kb-v2/search-v2.mjs';
import { RetrievalEngineV2 } from '../kb-v2/retrieval-v2.mjs';
import { AgyFlashClient } from '../kb-v2/agy-client.mjs';

const appUrl = 'novel://studio/index.html';
const appDir = fileURLToPath(new URL('../../', import.meta.url));
const dataDir = resolve(process.env.NOVEL_STUDIO_DATA_DIR || join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Novel Studio'));
const contentTypes = {
  '/index.html': 'text/html; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/app.css': 'text/css; charset=utf-8'
};
const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
let window;
let store;
let storeV2;
let agyClient;
let useKbV2 = false;
let embedding;
let waitingForClose = false;
let canClose = false;
let restoring = false;
const requests = new Map();

app.setName('Novel Studio');
mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
protocol.registerSchemesAsPrivileged([{ scheme: 'novel', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function cancellation() {
  const error = new Error('操作已取消');
  error.code = 'CANCELLED';
  return error;
}

function safeName(title) {
  return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || '正文';
}

function decodeTxt(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030', { fatal: true }).decode(bytes);
  }
}

async function chooseFile(name, extensions) {
  const selection = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name, extensions }] });
  return selection.canceled ? null : selection.filePaths[0];
}

async function chooseDestination(filename, extension, type) {
  const selection = await dialog.showSaveDialog(window, { defaultPath: filename, filters: [{ name: type, extensions: [extension] }] });
  if (selection.canceled || !selection.filePath) return null;
  return extname(selection.filePath).toLowerCase() === '.' + extension ? selection.filePath : selection.filePath + '.' + extension;
}

async function modelOptions(preferVulkan = false) {
  if (process.env.NOVEL_STUDIO_NO_MODEL === '1') return { modelPath: '' };
  const configPath = join(dataDir, 'embedding.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      const options = {};
      for (const key of ['modelPath', 'pythonPath', 'runtimePath', 'fallbackRuntimePath']) {
        if (typeof config[key] === 'string' && isAbsolute(config[key])) options[key] = config[key];
      }
      if (typeof config.id === 'string') options.id = config.id;
      if (Array.isArray(config.extraArgs) && config.extraArgs.every(v => typeof v === 'string')) {
        options.extraArgs = config.extraArgs;
      }
      if (typeof config.idleTimeoutMs === 'number' && Number.isFinite(config.idleTimeoutMs) && config.idleTimeoutMs >= 0) {
        options.idleTimeoutMs = config.idleTimeoutMs;
      }
      if (typeof config.startupTimeoutMs === 'number' && Number.isFinite(config.startupTimeoutMs) && config.startupTimeoutMs > 0) {
        options.startupTimeoutMs = config.startupTimeoutMs;
      }
      if (options.modelPath) return options;
    } catch {
      // A partial configuration can still fall back to the installed model pack.
    }
  }
  if (process.env.NOVEL_STUDIO_EMBEDDING_MODEL) return {};
  const candidates = [join(dataDir, 'model')];
  if (!app.isPackaged) candidates.push(join(appDir, '.local', 'model'));
  const vulkanCandidate = !app.isPackaged ? join(appDir, '.local', 'kb-v2-mvp', 'llama-cpp-vulkan', 'llama-server.exe') : '';
  for (const directory of candidates) {
    const modelPath = join(directory, 'Qwen3-Embedding-0.6B-Q8_0.gguf');
    const cpuRuntimePath = join(directory, 'llama-cpp', 'llama-server.exe');
    if (!existsSync(modelPath) || !existsSync(cpuRuntimePath)) continue;
    const { size, mtimeMs } = await stat(modelPath);
    const id = `Qwen3-Embedding-0.6B-Q8_0:${size}:${Math.trunc(mtimeMs)}`;
    if (preferVulkan && vulkanCandidate && existsSync(vulkanCandidate)) {
      return {
        modelPath,
        runtimePath: vulkanCandidate,
        fallbackRuntimePath: cpuRuntimePath,
        id,
        extraArgs: ['-ngl', '99', '--device', 'Vulkan0', '--ctx-size', '16384', '--batch-size', '4096', '--ubatch-size', '2048'],
        idleTimeoutMs: 180_000,
        startupTimeoutMs: 45_000
      };
    }
    return { modelPath, runtimePath: cpuRuntimePath, id };
  }
  return {};
}

function register(writing, reference, imports, search, backup, expansion, retrieval) {
  const handlers = new Map();
  const expose = (prefix, service, methods) => {
    for (const name of methods) handlers.set(`${prefix}.${name}`, service[name].bind(service));
  };
  expose('writing', writing, [
    'list', 'searchWork', 'open', 'preview', 'createWork', 'createVolume', 'createDoc', 'rename', 'move',
    'stage', 'save', 'addMark', 'deleteMark', 'history', 'restoreHistory', 'trash', 'restore'
  ]);
  expose('reference', reference, ['list', 'setHidden', 'getCard', 'listCards', 'editCard', 'read', 'asset']);
  expose('import', imports, ['preview', 'commit', 'cancel']);
  expose('search', search, ['prepare']);
  handlers.set('search.query', retrieval.query.bind(retrieval));
  for (const [name, method] of Object.entries({
    get: 'configGet', save: 'configSave', select: 'configSelect', remove: 'configRemove', test: 'configTest'
  })) {
    handlers.set('retrieval.config.' + name, (args, context) => retrieval.setting(method, args, context));
  }
  expose('expand', expansion, ['generate']);
  handlers.set('expand.config.get', expansion.configGet.bind(expansion));
  handlers.set('expand.config.save', expansion.configSave.bind(expansion));
  handlers.set('expand.config.select', expansion.configSelect.bind(expansion));
  handlers.set('expand.config.remove', expansion.configRemove.bind(expansion));
  handlers.set('expand.config.test', expansion.configTest.bind(expansion));
  handlers.set('expand.cancel', ({ requestId }) => {
    if (expansionRequests.has(requestId)) requests.get(requestId)?.abort(cancellation());
    return true;
  });
  handlers.set('request.cancel', ({ id }) => {
    requests.get(id)?.abort(cancellation());
    return true;
  });
  handlers.set('import.inspect', async (_, { signal }) => {
    const filename = await chooseFile('标准结果包', ['zip']);
    signal?.throwIfAborted();
    return filename ? imports.inspect(filename, { signal }) : null;
  });
  handlers.set('writing.importTxt', async ({ workId, volumeId }) => {
    const filename = await chooseFile('TXT 文本', ['txt']);
    if (!filename) return null;
    if ((await stat(filename)).size > 40 * 1024 * 1024) fail('TXT_LIMIT', 'TXT 文件超过 40 MiB');
    let text;
    try {
      text = decodeTxt(await readFile(filename)).replace(/\r\n?/g, '\n');
    } catch {
      fail('TXT_ENCODING', 'TXT 无法按 UTF-8、UTF-16 BOM 或 GB18030 解码');
    }
    if (text.includes('\0')) fail('TXT_ENCODING', '文件含空字节，请使用有效文本编码');
    return writing.createDoc({ workId, volumeId, kind: 'chapter', title: basename(filename, extname(filename)).slice(0, 250), text });
  });
  handlers.set('writing.exportTxt', async args => {
    const { title, text } = writing.exportText(args);
    const filename = await chooseDestination(safeName(title) + '.txt', 'txt', 'UTF-8 文本');
    if (!filename) return false;
    await writeFile(filename, text, 'utf8');
    return true;
  });
  handlers.set('app.info', () => ({
    dataDir, model: embedding.id, modelConfigured: Boolean(embedding.modelPath),
    embeddingMode: embedding.activeBackendMode,
    version: app.getVersion(), electron: process.versions.electron, kbV2: useKbV2
  }));
  handlers.set('app.openDataDir', async () => {
    const message = await shell.openPath(dataDir);
    if (message) fail('OPEN_DATA', message);
    return true;
  });
  handlers.set('backup.export', async () => {
    const filename = await chooseDestination(`Novel Studio ${new Date().toLocaleDateString('sv-SE')}.zip`, 'zip', '工作台备份');
    return filename ? backup.export(filename) : null;
  });
  handlers.set('backup.restore', async () => {
    const filename = await chooseFile('工作台备份', ['zip']);
    if (!filename) return null;
    const decision = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['取消', '校验并恢复'], cancelId: 0, defaultId: 0,
      message: '恢复备份将替换当前资料',
      detail: '程序会校验备份，并在资料目录保留替换前的完整快照。'
    });
    if (decision.response !== 1) return null;
    restoring = true;
    reference.generation++;
    imports.cancel();
    for (const request of requests.values()) request.abort(cancellation());
    try {
      return await backup.restore(filename);
    } finally {
      restoring = false;
    }
  });
  handlers.set('app.closeResult', async ({ saved, message }) => {
    if (!waitingForClose) return false;
    if (!saved) {
      const decision = await dialog.showMessageBox(window, {
        type: 'error', buttons: ['返回编辑', '关闭窗口'], cancelId: 0, defaultId: 0,
        message: '编辑内容未能保存', detail: String(message ?? '可返回编辑并导出当前正文。').slice(0, 500)
      });
      if (decision.response === 0) {
        waitingForClose = false;
        return false;
      }
    }
    canClose = true;
    window.close();
    return true;
  });
  const expansionRequests = new Set();
  const cancellable = new Set(['import.inspect', 'search.query', 'search.prepare', 'expand.generate', 'expand.config.test', 'retrieval.config.test']);
  ipcMain.handle('novel:invoke', async (event, method, args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== appUrl || !handlers.has(method)) {
      return { ok: false, error: { code: 'IPC_METHOD', message: '操作不可用' } };
    }
    if (restoring && method !== 'request.cancel' && method !== 'expand.cancel') return { ok: false, error: { code: 'RESTORING', message: '正在恢复资料，请稍候' } };
    let controller;
    let id;
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)) fail('IPC_INPUT', '操作参数无效');
      if (cancellable.has(method)) {
        id = args.requestId ?? (method.endsWith('.config.test') ? randomUUID() : undefined);
        if (typeof id !== 'string' || !id || id.length > 80 || requests.has(id)) fail('REQUEST_ID', '请求标识无效或已在使用');
        controller = new AbortController();
        requests.set(id, controller);
        if (method.startsWith('expand.')) expansionRequests.add(id);
      }
      const value = await handlers.get(method)(args, { signal: controller?.signal });
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error?.code ?? 'OPERATION_FAILED',
          message: error?.message ?? '操作失败',
          details: error?.details,
          recoverable: error?.recoverable ?? true
        }
      };
    } finally {
      if (controller) {
        requests.delete(id);
        expansionRequests.delete(id);
      }
    }
  });
}

async function launch() {
  await app.whenReady();
  protocol.handle('novel', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'studio' || url.search || !Object.hasOwn(contentTypes, url.pathname)) return new Response('Not found', { status: 404 });
    const data = await readFile(join(appDir, 'dist', url.pathname.slice(1)));
    return new Response(data, {
      headers: { 'Content-Type': contentTypes[url.pathname], 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' }
    });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, reply) => reply({ cancel: true }));
  store = new Store(join(dataDir, 'library.sqlite'));
  const v2DbPath = join(dataDir, 'reference-v2.sqlite');
  useKbV2 = process.env.NOVEL_STUDIO_KB_V2 === '1' || existsSync(v2DbPath);
  embedding = new EmbeddingProvider(await modelOptions(useKbV2));
  if (useKbV2) {
    storeV2 = new ReferenceStoreV2(v2DbPath);
    const searchV2 = new SearchEngineV2(storeV2, embedding);
    const retrievalConfigFile = join(dataDir, 'retrieval-api.json');
    let customComplete = null;
    let fallbackComplete = null;
    if (process.env.NOVEL_STUDIO_AGY_RETRIEVAL === '1') {
      agyClient = new AgyFlashClient();
      customComplete = (messages, opts, sig) => agyClient.complete(messages, opts, sig);
    } else if (!app.isPackaged && process.env.NOVEL_STUDIO_NO_AGY_FALLBACK !== '1') {
      agyClient = new AgyFlashClient();
      fallbackComplete = (messages, opts, sig) => agyClient.complete(messages, opts, sig);
    }
    const retrievalV2 = new RetrievalEngineV2(searchV2, {
      store, filename: retrievalConfigFile, vault: safeStorage, customComplete, fallbackComplete
    });
    // Keep legacy ImportService bound to original store while decoupled reference/search/retrieval run on storeV2
    register(new WritingService(store), storeV2, new ImportService(new ReferenceService(store)), searchV2,
      new BackupService(store), new ExpansionService(store, join(dataDir, 'expansion.json'), safeStorage),
      retrievalV2);
  } else {
    const reference = new ReferenceService(store);
    const search = new SearchService(reference, embedding);
    register(new WritingService(store), reference, new ImportService(reference), search,
      new BackupService(store), new ExpansionService(store, join(dataDir, 'expansion.json'), safeStorage),
      new RetrievalService(search, store, join(dataDir, 'retrieval-api.json'), safeStorage));
  }
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1460, height: 930, minWidth: 880, minHeight: 600, show: false, backgroundColor: '#ffffff',
    title: '个人小说写作工作台',
    icon: join(appDir, 'app', 'assets', 'app-icon.png'),
    webPreferences: {
      preload: join(appDir, 'app', 'main', 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('close', event => {
    if (canClose || window.webContents.isCrashed()) return;
    event.preventDefault();
    if (restoring) return;
    if (!waitingForClose) {
      waitingForClose = true;
      window.webContents.send('novel:close-requested');
    }
  });
  window.once('ready-to-show', () => {
    if (process.env.NOVEL_STUDIO_TEST_HIDDEN !== '1') window.show();
  });
  await window.loadURL(appUrl);
  if (useKbV2) {
    if (agyClient) void agyClient.warmup().catch(() => {});
    if (embedding?.modelPath) void embedding.embed(['预热'], { query: true }).catch(() => {});
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    for (const request of requests.values()) request.abort(cancellation());
    void embedding?.close();
    agyClient?.close();
    storeV2?.close();
    store?.close();
  });
  launch().catch(error => {
    dialog.showErrorBox('工作台启动失败', error.message);
    canClose = true;
    app.quit();
  });
}
