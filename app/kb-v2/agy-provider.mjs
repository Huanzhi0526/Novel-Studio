import { operation } from './operation.mjs';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgyFlashClient, awaitWithSignal, resolveAgyExecutableAsync, resolveWindowsSystemProxyAsync } from './agy-client.mjs';
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

// Catalogue metadata is shared across purposes; sessions, credentials and choices are not.
const catalogues=new WeakMap();
function catalogueMap(run){if(!catalogues.has(run))catalogues.set(run,new Map());return catalogues.get(run);}

export class AgyRetrievalProvider {
  constructor(directory, { run = execFile, clientFactory = options => new AgyFlashClient(options), env = process.env, purpose = 'retrieval' } = {}) {
    this.purpose = purpose;
    this.defaults = { ...defaults, ...(purpose === 'expand' ? { source: 'api' } : {}) };
    this.filename = join(directory, purpose === 'expand' ? 'expansion-provider.json' : 'retrieval-provider.json');
    this.cwd = join(directory, purpose === 'expand' ? 'agy-expansion-work' : 'agy-retrieval-work');
    this.env = accountEnvironment(env);
    this.executable = this.env.NOVEL_STUDIO_AGY_BIN ?? join(this.env.LOCALAPPDATA ?? '', 'agy', 'bin', 'agy.exe');
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

  async prepare(signal,{refresh=false}={}) {
    const executable=await resolveAgyExecutableAsync(this.env,{refresh,signal});
    signal?.throwIfAborted();
    if(this.executable!==executable){if(!this.active)this.close(false);this.models=[];this.executable=executable;}
    if(!existsSync(executable))fail('AGY_NOT_INSTALLED','未找到反重力CLI，请先安装并登录。');
    return executable;
  }

  async listModels(_, { signal, cached=false } = {}) {
    if(this.discovery)return this.waitDiscovery(signal);
    const key=JSON.stringify([this.executable,this.env.USERPROFILE,this.env.LOCALAPPDATA]);
    const cache=catalogueMap(this.run),previous=cache.get(key);
    if(cached&&previous?.models&&Date.now()-previous.at<60000){this.models=previous.models;return this.get();}
    const controller=new AbortController();
    // Shared discovery has independent waiters; cancellation abandons this caller.
    this.discovery=(async()=>{
      await this.prepare(controller.signal,{refresh:true});
      mkdirSync(this.cwd,{recursive:true});
      const proxy=await resolveWindowsSystemProxyAsync(this.env,controller.signal);
      return new Promise((resolve,reject)=>this.run(this.executable,['models'],{
        cwd:this.cwd,windowsHide:true,timeout:30000,maxBuffer:256*1024,encoding:'utf8',signal:controller.signal,env:{...this.env,...proxy}
      },(error,stdout)=>{
        if(error)return reject(Object.assign(new Error('无法获取反重力模型列表，请检查登录、网络或额度。'),{code:'AGY_MODELS'}));
        const models=parseAgyModels(stdout);
        if(!models.length)return reject(Object.assign(new Error('CLI未返回可用模型。'),{code:'AGY_MODELS_EMPTY'}));
        this.models=models;cache.set(key,{models,at:Date.now()});resolve(this.get());
      }));
    })().finally(()=>{this.discovery=null;this.discoveryController=null;});
    this.discoveryController=controller;
    return this.waitDiscovery(signal);
  }

  async waitDiscovery(signal){
    this.discoveryWaiters=(this.discoveryWaiters??0)+1;
    try{return await awaitWithSignal(this.discovery,signal);}
    finally{if(--this.discoveryWaiters===0&&this.discovery)this.discoveryController?.abort();}
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
      if (!this.active) this.close(false);
      return this.get();
    });
    this.writes = job;
    return job;
  }

  async complete(messages, options={}, signal) {
    if((this.queued??0)>=20)fail('AGY_BUSY','模型请求队列已满，请等待或取消。');
    const snapshot=this.snapshot();
    const ensure=()=>{signal?.throwIfAborted();if(snapshot!==this.snapshot())fail('SEARCH_CONFIG_CHANGED','模型配置已变化，旧请求未发送。');options.validate?.();};
    const op=operation({...options,signal});
    try {
    await awaitWithSignal(this.writes,op.signal);
    this.queued=(this.queued??0)+1;
    const job=this.requestLane.catch(()=>{}).then(()=>{op.signal.throwIfAborted();ensure();return this.runComplete(messages,{...options,...op,validate:ensure},op.signal);});
    this.requestLane=job;job.finally(()=>this.queued--).catch(()=>{});
    return await awaitWithSignal(job,op.signal);
    }finally{op.close();}
  }

  async runComplete(messages, options, signal) {
    await this.writes;
    if (this.active) fail('AGY_BUSY', '已有反重力请求进行中，请稍候或取消。');
    options.validate?.();
    const { modelId } = this.read();
    if(this.models.length&&!this.models.some(m=>m.id===modelId))fail('AGY_MODEL_UNKNOWN','当前目录已无所选模型，请刷新并重新选择。');
    await this.prepare(signal);
    await awaitWithSignal(this.stopping??Promise.resolve(),signal);
    options.validate?.();
    if (!existsSync(this.executable)) fail('AGY_NOT_INSTALLED', '未找到反重力 CLI，请先安装并登录。');
    if (!this.client || this.clientModel !== modelId || this.client.executable && this.client.executable !== this.executable) {
      this.close(false);
      this.client = this.clientFactory({ executable: this.executable, cwd: this.cwd, modelId,
        outputMode: this.purpose === 'expand' ? 'text' : 'json',
        thoughtLevel: /-(low|medium|high|xhigh|max)$/u.exec(modelId)?.[1] ?? null, env: this.env });
      this.clientModel = modelId;
    }
    clearTimeout(this.idleTimer);
    this.active = true;
    try { return await this.client.complete(messages, options, signal); }
    finally { this.active = false;this.idleTimer=setTimeout(()=>this.close(false),180000);this.idleTimer.unref?.(); }
  }

  async test(_, { signal } = {}) {
    const snapshot = this.snapshot();
    const text = await this.complete([{ role: 'user', content: '连接测试。请只返回 JSON {"ok":true}，不要使用工具。' }], { timeoutMs: 90000 }, signal);
    if (snapshot !== this.snapshot()) fail('SEARCH_CONFIG_CHANGED', '模型选择已变更，请重新测试。');
    if (!/"ok"\s*:\s*true/u.test(text)) fail('AGY_TEST_RESPONSE', '模型未返回预期测试内容，请重试。');
    return { ok: true, modelId: this.read().modelId };
  }

  close(discovery=true) { clearTimeout(this.idleTimer); if(discovery)this.discoveryController?.abort();this.stopping=Promise.all([this.stopping,this.client?.close()]).then(()=>{});this.client=null;this.clientModel=null;return this.stopping; }
}
