import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgyFlashClient, awaitWithSignal, resolveAgyExecutable, resolveWindowsSystemProxy } from './agy-client.mjs';
import { fail } from '../main/store.mjs';

const defaults = { version: 1, source: 'auto', modelId: 'gemini-3.8-flash-low' };
const sources = new Set(['auto', 'api', 'agy']);

export function parseAgyModels(output) {
  const models = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = /^(gemini-[a-z0-9.-]+)\s+(.+)$/iu.exec(line.trim());
    if (!match) continue;
    const [, id, name] = match;
    const effort = /-(low|medium|high|xhigh|max)$/u.exec(id)?.[1] ?? null;
    models.set(id, { id, name: name.trim(), effort,
      family: effort ? id.slice(0, -effort.length - 1) : id,
      familyName: effort ? name.trim().replace(/\s*\((?:Low|Medium|High|XHigh|Max)\)$/iu, '') : name.trim() });
  }
  return [...models.values()];
}

export function accountEnvironment(env = process.env) {
  const copy = { ...env };
  // Reuse CLI account sign-in, never inherit an API billing credential from this app.
  for (const key of Object.keys(copy)) {
    if (/^(ELECTRON_RUN_AS_NODE|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI)$/iu.test(key)) delete copy[key];
  }
  return copy;
}

export class AgyRetrievalProvider {
  constructor(directory, { run = execFile, clientFactory = options => new AgyFlashClient(options), env = process.env, purpose = 'retrieval' } = {}) {
    this.purpose = purpose;
    this.defaults = { ...defaults, ...(purpose === 'expand' ? { source: 'api' } : {}) };
    this.filename = join(directory, purpose === 'expand' ? 'expansion-provider.json' : 'retrieval-provider.json');
    this.cwd = join(directory, purpose === 'expand' ? 'agy-expansion-work' : 'agy-retrieval-work');
    this.env = accountEnvironment(env);
    this.executable = resolveAgyExecutable(this.env);
    this.run = run;
    this.clientFactory = clientFactory;
    this.models = [];
    this.client = null;
    this.clientModel = null;
    this.active = false;
    this.requestLane = Promise.resolve();
    this.writes = Promise.resolve();
    this.discovery = null;
  }

  read() {
    let value;
    try { value = JSON.parse(readFileSync(this.filename, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { ...this.defaults };
      fail('RETRIEVAL_PROVIDER_READ', '模型来源配置无法读取，请保留原文件并检查。');
    }
    if (value?.version !== 1 || !sources.has(value.source) ||
        typeof value.modelId !== 'string' || !/^gemini-[a-z0-9.-]{1,120}$/u.test(value.modelId)) {
      fail('RETRIEVAL_PROVIDER_READ', '模型来源配置格式无效。');
    }
    return { version: 1, source: value.source, modelId: value.modelId };
  }

  snapshot() { return JSON.stringify(this.read()); }

  get() {
    return { ...this.read(), available: existsSync(this.executable), models: this.models };
  }

  async listModels(_, { signal } = {}) {
    if (this.discovery) return this.discovery;
    this.executable = resolveAgyExecutable(this.env);
    if (!existsSync(this.executable)) fail('AGY_NOT_INSTALLED', '未找到反重力 CLI，请先安装并使用 Google 账号登录。');
    mkdirSync(this.cwd, { recursive: true });
    this.discovery = new Promise((resolve, reject) => {
      this.run(this.executable, ['models'], {
        cwd: this.cwd, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024,
        encoding: 'utf8', signal, env: { ...this.env, ...resolveWindowsSystemProxy(this.env) }
      }, (error, stdout) => {
        if (error) {
          if (signal?.aborted) return reject(signal.reason ?? error);
          return reject(Object.assign(new Error('无法获取反重力模型列表，请检查 CLI 登录、网络或额度后重试。'), { code: 'AGY_MODELS' }));
        }
        const models = parseAgyModels(stdout);
        if (!models.length) return reject(Object.assign(new Error('CLI 未返回可用的 Gemini 模型，请检查账号权限。'), { code: 'AGY_MODELS_EMPTY' }));
        this.models = models;
        resolve(this.get());
      });
    }).finally(() => { this.discovery = null; });
    return this.discovery;
  }

  save({ source, modelId }) {
    const job = this.writes.catch(() => {}).then(() => {
      if (!sources.has(source) || typeof modelId !== 'string' || !/^gemini-[a-z0-9.-]{1,120}$/u.test(modelId)) fail('RETRIEVAL_PROVIDER_INPUT', '模型来源或模型无效。');
      const current = this.read();
      // A previous selection remains valid offline, but new names must come from the CLI.
      if (modelId !== current.modelId && !this.models.some(item => item.id === modelId)) fail('AGY_MODEL_UNKNOWN', '请刷新模型列表后选择，不能填写未公布的模型。');
      const temp = this.filename + '.' + randomUUID() + '.tmp';
      try {
        writeFileSync(temp, JSON.stringify({ version: 1, source, modelId }, null, 2), { flag: 'wx' });
        renameSync(temp, this.filename);
      } finally { rmSync(temp, { force: true }); }
      // Let an in-flight request finish; its settings snapshot will reject stale results.
      if (!this.active) this.close();
      return this.get();
    });
    this.writes = job;
    return job;
  }

  async complete(messages, options, signal) {
    const job=this.requestLane.catch(()=>{}).then(()=>{signal?.throwIfAborted();return this.runComplete(messages,options,signal);});
    this.requestLane=job;return awaitWithSignal(job,signal);
  }

  async runComplete(messages, options, signal) {
    await this.writes;
    if (this.active) fail('AGY_BUSY', '已有反重力请求进行中，请稍候或取消。');
    const { modelId } = this.read();
    if (!existsSync(this.executable)) fail('AGY_NOT_INSTALLED', '未找到反重力 CLI，请先安装并登录。');
    if (!this.client || this.clientModel !== modelId) {
      this.close();
      this.client = this.clientFactory({ executable: this.executable, cwd: this.cwd, modelId,
        outputMode: this.purpose === 'expand' ? 'text' : 'json',
        thoughtLevel: /-(low|medium|high|xhigh|max)$/u.exec(modelId)?.[1] ?? null, env: this.env });
      this.clientModel = modelId;
    }
    this.active = true;
    try { return await this.client.complete(messages, options, signal); }
    finally { this.active = false; }
  }

  async test(_, { signal } = {}) {
    const snapshot = this.snapshot();
    const text = await this.complete([{ role: 'user', content: '连接测试。请只返回 JSON {"ok":true}，不要使用工具。' }], { timeoutMs: 90000 }, signal);
    if (snapshot !== this.snapshot()) fail('SEARCH_CONFIG_CHANGED', '模型选择已变更，请重新测试。');
    if (!/"ok"\s*:\s*true/u.test(text)) fail('AGY_TEST_RESPONSE', '模型未返回预期测试内容，请重试。');
    return { ok: true, modelId: this.read().modelId };
  }

  close() { this.client?.close(); this.client = null; this.clientModel = null; }
}
