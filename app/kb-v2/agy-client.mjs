import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_WORKER_CWD = fileURLToPath(new URL('../../.local/kb-v2-mvp/worker-cwd', import.meta.url));

/**
 * Locate `agy.exe` reliably both inside and outside MSIX packaged terminal sandboxes.
 * When `agy` was installed from an MSIX terminal (e.g. OpenAI.Codex_*), its physical binary
 * lives under `%LOCALAPPDATA%\Packages\*\LocalCache\Local\agy\bin\agy.exe` rather than `%LOCALAPPDATA%\agy\bin\agy.exe`.
 */
export function resolveAgyExecutable(baseEnv = process.env) {
  if (baseEnv.NOVEL_STUDIO_AGY_BIN && existsSync(baseEnv.NOVEL_STUDIO_AGY_BIN)) {
    return baseEnv.NOVEL_STUDIO_AGY_BIN;
  }
  const localAppData = baseEnv.LOCALAPPDATA || join(baseEnv.USERPROFILE || homedir(), 'AppData', 'Local');
  const directCandidates = [
    join(localAppData, 'agy', 'bin', 'agy.exe'),
    join(localAppData, 'Programs', 'agy', 'bin', 'agy.exe'),
    join(localAppData, 'Programs', 'antigravity', 'bin', 'agy.exe')
  ];
  for (const candidate of directCandidates) {
    if (existsSync(candidate)) {
      try { return realpathSync(candidate); } catch { return candidate; }
    }
  }
  // Check MSIX LocalCache packages (e.g. OpenAI.Codex_*\LocalCache\Local\agy\bin\agy.exe)
  const packagesDir = join(localAppData, 'Packages');
  if (existsSync(packagesDir)) {
    try {
      for (const pkg of readdirSync(packagesDir)) {
        const msixCandidate = join(packagesDir, pkg, 'LocalCache', 'Local', 'agy', 'bin', 'agy.exe');
        if (existsSync(msixCandidate)) return msixCandidate;
      }
    } catch {}
  }
  // Fallback to PATH lookup
  for (const dir of (baseEnv.PATH || '').split(';')) {
    const trimmed = dir.trim();
    if (!trimmed) continue;
    const pathCandidate = join(trimmed, 'agy.exe');
    if (existsSync(pathCandidate)) return pathCandidate;
  }
  return join(localAppData, 'agy', 'bin', 'agy.exe');
}

function cancellationError() {
  const err = new Error('操作已取消');
  err.code = 'CANCELLED';
  return err;
}

// CLI status notices travel in the same ACP text stream as model output.
// Only strip recognized CLI lines, never arbitrary warning symbols in prose.
export function separateAgyStatus(text) {
  const statuses = [];
  const clean = text.replace(/^[ \t]*⚠[ \t]*(API error \(attempt \d+\):[^\n]*(?:\n|$)|Your previous turn (?:was interrupted|failed)[^\n]*(?:\n|$))/gmu,
    (_line, status) => { statuses.push(status.trim()); return '\n'; }).trim();
  const capacity = statuses.some(line => /No capacity available|UNAVAILABLE\s*\(code 503\)/iu.test(line));
  const quota = statuses.some(line => /RESOURCE_EXHAUSTED|code 429|quota.*exhaust|rate.?limit/iu.test(line));
  return { text: clean, capacity, quota, interrupted: statuses.some(line => /^Your previous turn/u.test(line)) };
}

function upstreamError(model, kind) {
  const error = new Error(kind === 'capacity'
    ? `反重力 ${model} 服务端容量不足（503），短暂重试后仍未响应。请稍后重试或手动选择其他模型。`
    : `反重力 ${model} 额度不足或限流（429），请检查账号额度后重试。`);
  error.code = kind === 'capacity' ? 'AGY_CAPACITY' : 'AGY_RATE_LIMIT';
  error.details = { provider: 'agy', modelId: model, upstreamStatus: kind === 'capacity' ? 503 : 429 };
  return error;
}

/**
 * On Windows, users typically configure local proxies via System Proxy (WinINET Registry),
 * which PowerShell/CMD does not export to HTTP_PROXY/HTTPS_PROXY. Because `agy.exe` is a Go
 * binary that only reads environment variables for proxy routing, resolve WinINET proxy
 * automatically when env proxy vars are absent.
 */
export function resolveWindowsSystemProxy(baseEnv = process.env) {
  if (process.platform !== 'win32') return {};
  if (
    baseEnv.HTTPS_PROXY || baseEnv.https_proxy ||
    baseEnv.HTTP_PROXY || baseEnv.http_proxy ||
    baseEnv.ALL_PROXY || baseEnv.all_proxy
  ) {
    return {};
  }
  try {
    const out = execFileSync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { encoding: 'utf8', windowsHide: true, timeout: 2500 }
    );
    const enableMatch = /^\s*ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/m.exec(out);
    if (!enableMatch || Number(enableMatch[1]) === 0) return {};
    const serverMatch = /^\s*ProxyServer\s+REG_SZ\s+(.+)$/m.exec(out);
    const raw = serverMatch?.[1]?.trim();
    if (!raw) return {};

    let httpProxy = '';
    let httpsProxy = '';
    if (raw.includes('=')) {
      for (const part of raw.split(';')) {
        const [k, v] = part.split('=').map(s => s?.trim());
        if (!k || !v) continue;
        const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) ? v : (k.toLowerCase().startsWith('socks') ? `socks5://${v}` : `http://${v}`);
        if (k.toLowerCase() === 'http') httpProxy = url;
        else if (k.toLowerCase() === 'https') httpsProxy = url;
        else if (k.toLowerCase().startsWith('socks') && !httpProxy && !httpsProxy) {
          httpProxy = url;
          httpsProxy = url;
        }
      }
    } else {
      const url = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`;
      httpProxy = url;
      httpsProxy = url;
    }

    const resolved = {};
    if (httpProxy || httpsProxy) {
      resolved.HTTP_PROXY = httpProxy || httpsProxy;
      resolved.HTTPS_PROXY = httpsProxy || httpProxy;
      if (!baseEnv.NO_PROXY && !baseEnv.no_proxy) {
        resolved.NO_PROXY = '127.0.0.1,localhost';
      }
    }
    return resolved;
  } catch {
    return {};
  }
}

export class AgyFlashClient {
  constructor({
    executable = null,
    cwd = DEFAULT_WORKER_CWD,
    modelId = 'gemini-3.8-flash-low',
    thoughtLevel = 'low',
    outputMode = 'json',
    env = null,
    spawnImpl = spawn,
    initializeTimeoutMs = 45_000,
    sessionNewTimeoutMs = 90_000,
    capacityGraceMs = 20_000,
    assistant = null
  } = {}) {
    this.executable = executable || resolveAgyExecutable(env ?? process.env);
    this.cwd = cwd;
    this.modelId = modelId;
    this.thoughtLevel = thoughtLevel;
    this.outputMode = outputMode;
    this.customEnv = env;
    this.spawnImpl = spawnImpl;
    this.initializeTimeoutMs = initializeTimeoutMs;
    this.sessionNewTimeoutMs = sessionNewTimeoutMs;
    this.capacityGraceMs = capacityGraceMs;
    this.assistant = assistant;
    this.sessionStatus = new Map();
    this.child = null;
    this.seq = 0;
    this.pending = new Map();
    this.sessionChunks = new Map();
    this.readyPromise = null;
    this.warmupPromise = null;
    this.prewarmedSessionId = null;
    this.closed = false;
    this.stderrTail = '';
    this.usageTotals = {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedReadTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0
    };
  }

  #buildChildEnv() {
    const base = { ...(this.customEnv ?? process.env) };
    delete base.ELECTRON_RUN_AS_NODE;
    const winProxy = resolveWindowsSystemProxy(base);
    return { ...base, ...winProxy };
  }

  async #ensureStarted(signal) {
    signal?.throwIfAborted();
    if (this.child && !this.child.killed && this.readyPromise) {
      return await this.readyPromise;
    }
    mkdirSync(this.cwd, { recursive: true });
    const child = this.spawnImpl(this.executable, ['acp', '--sandbox', '--include-default-customizations=false'], {
      cwd: this.cwd,
      env: this.#buildChildEnv(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.child = child;
    this.stderrTail = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      if (this.child !== child) return;
      this.stderrTail = (this.stderrTail + chunk).slice(-2000);
    });

    let buf = '';
    child.stdout.on('data', chunk => {
      if (this.child !== child) return;
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === 'session/update') {
          const sid = msg.params?.sessionId;
          const upd = msg.params?.update;
          this.assistant?.onUpdate?.(upd);
          if (sid && upd?.sessionUpdate === 'agent_message_chunk' && typeof upd?.content?.text === 'string') {
            const list = this.sessionChunks.get(sid);
            if (list) {
              list.push(upd.content.text);
              const status = separateAgyStatus(list.join(''));
              const state = this.sessionStatus.get(sid);
              if (state) {
                state.capacity ||= status.capacity;
                state.recovered = Boolean(status.text);
                if (status.quota && !status.text) this.#killCurrentChild(upstreamError(this.modelId, 'quota'));
                else if (status.text) { clearTimeout(state.timer); state.timer = null; }
                else if (status.capacity && !state.timer) {
                  state.timer = setTimeout(() => {
                    if (this.sessionStatus.get(sid) === state && this.child === child) {
                      this.#killCurrentChild(upstreamError(this.modelId, 'capacity'));
                    }
                  }, this.capacityGraceMs);
                }
              }
            }
          }
        } else if (msg.method === 'session/request_permission' && msg.id != null && this.assistant?.permission) {
          Promise.resolve(this.assistant.permission(msg.params)).then(outcome => {
            if (this.child === child) child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{outcome}})+'\n');
          }).catch(() => {});
        } else if (msg.method && msg.id != null) {
          // Pure text generation client: never grant tool execution permissions
          const response = msg.method === 'session/request_permission'
            ? { jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'cancelled' } } }
            : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Unsupported client method' } };
          try { child.stdin.write(JSON.stringify(response) + '\n'); } catch {}
        } else if (!msg.method && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.#clearPending(msg.id, p);
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      }
    });

    const onProcessDown = reason => {
      if (this.child !== child) return;
      const detail = this.stderrTail.trim() ? ` (${this.stderrTail.trim().slice(-200)})` : '';
      const err = new Error(`默认 Gemini Flash 桥接进程退出: ${reason}${detail}`);
      this.child = null;
      this.readyPromise = null;
      this.warmupPromise = null;
      this.prewarmedSessionId = null;
      this.assistantSessionId = null;
      for (const [id, p] of this.pending.entries()) {
        this.#clearPending(id, p);
        p.reject(err);
      }
    };

    child.on('error', err => onProcessDown(err.message));
    child.on('exit', code => onProcessDown(`code=${code ?? 'signal'}`));

    this.readyPromise = this.#rpc('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'novel-studio-kb-v2', version: '0.1' },
      clientCapabilities: {}
    }, { timeoutMs: this.initializeTimeoutMs, signal }).then(result => { this.agentCapabilities = result.agentCapabilities ?? {}; return result; }).catch(err => {
      if (this.child === child) this.#killCurrentChild();
      throw err;
    });
    return await this.readyPromise;
  }

  #clearPending(id, p) {
    clearTimeout(p.timer);
    if (p.signal && p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
    this.pending.delete(id);
  }

  #killCurrentChild(resetReason = 'agy ACP 连接已重置') {
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    this.warmupPromise = null;
    this.prewarmedSessionId = null;
    this.assistantSessionId = null;
    for (const state of this.sessionStatus.values()) clearTimeout(state.timer);
    for (const [id, p] of this.pending.entries()) {
      this.#clearPending(id, p);
      p.reject(resetReason instanceof Error ? resetReason : new Error(resetReason));
    }
    if (child && !child.killed) {
      try { child.stdin.end(); } catch {}
      try { child.kill(); } catch {}
    }
  }

  #rpc(method, params, { timeoutMs = 30_000, signal, resetOnTimeout = false } = {}) {
    return new Promise((resolvePromise, rejectPromise) => {
      if (signal?.aborted) {
        rejectPromise(signal.reason ?? cancellationError());
        return;
      }
      if (!this.child || this.child.killed) {
        rejectPromise(new Error('agy ACP 进程未运行'));
        return;
      }
      const id = ++this.seq;
      const entry = { resolve: resolvePromise, reject: rejectPromise, timer: null, signal, onAbort: null };
      entry.timer = setTimeout(() => {
        const capacity = this.sessionStatus.get(params?.sessionId)?.capacity && !this.sessionStatus.get(params?.sessionId)?.recovered;
        const failure = capacity ? upstreamError(this.modelId, 'capacity')
          : Object.assign(new Error(`反重力 ${this.modelId} 请求超时（${method} 超过 ${Math.round(timeoutMs / 1000)}s）。请检查服务状态后重试。`), { code: 'AGY_TIMEOUT' });
        this.#clearPending(id, entry);
        if (resetOnTimeout) this.#killCurrentChild();
        rejectPromise(failure);
      }, timeoutMs);
      if (signal) {
        entry.onAbort = () => {
          this.#clearPending(id, entry);
          if (params?.sessionId && this.child && !this.child.killed) {
            try {
              this.child.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/cancel',
                params: { sessionId: params.sessionId }
              }) + '\n');
            } catch {}
          }
          rejectPromise(signal.reason ?? cancellationError());
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }
      this.pending.set(id, entry);
      try {
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch (err) {
        this.#clearPending(id, entry);
        rejectPromise(err);
      }
    });
  }

  async #createConfiguredSession(signal) {
    await this.#ensureStarted(signal);
    try {
      const params = { cwd: this.cwd, mcpServers: this.assistant?.mcpServers ?? [] };
      let sessionId;
      if (this.assistant?.resumeId && this.agentCapabilities.loadSession) {
        try { await this.#rpc('session/load', { ...params, sessionId: this.assistant.resumeId }, {timeoutMs:this.sessionNewTimeoutMs,signal}); sessionId=this.assistant.resumeId; }
        catch(error) { if(signal?.aborted) throw error; this.assistant.resumeId=null; }
      }
      if(!sessionId) ({sessionId}=await this.#rpc('session/new',params,{timeoutMs:this.sessionNewTimeoutMs,signal,resetOnTimeout:true}));
      if(this.assistant) { this.assistant.resumeId=sessionId; this.assistant.onSession?.(sessionId); }
      await this.#rpc('session/set_model', { sessionId, modelId: this.modelId }, { timeoutMs: 15_000, signal, resetOnTimeout: true });
      // Some catalogue entries (e.g. Orchestrator) expose no effort suffix.
      if (this.thoughtLevel) {
        const cfg = await this.#rpc('session/set_config_option', {
          sessionId, configId: 'thought_level', value: this.thoughtLevel
        }, { timeoutMs: 15_000, signal, resetOnTimeout: true });
        const actualThought = cfg.configOptions?.find(x => x.id === 'thought_level')?.currentValue;
        if (actualThought !== this.thoughtLevel) {
          throw new Error(`Expected thought_level=${this.thoughtLevel}, got ${actualThought}`);
        }
      }
      return sessionId;
    } catch (err) {
      if (!signal?.aborted) {
        this.#killCurrentChild();
      }
      throw err;
    }
  }

  /**
   * Pre-warm the standalone Language Server session inside `agy.exe acp` so the user's
   * first interactive search does not pay the 3-4s cold-boot overhead.
   */
  warmup() {
    if (this.closed) return Promise.resolve();
    if (this.prewarmedSessionId) return Promise.resolve(this.prewarmedSessionId);
    if (this.warmupPromise) return this.warmupPromise;
    this.warmupPromise = this.#createConfiguredSession()
      .then(sid => {
        this.prewarmedSessionId = sid;
        return sid;
      })
      .finally(() => {
        this.warmupPromise = null;
      });
    return this.warmupPromise;
  }

  /**
   * Run a fresh, isolated 1-turn prompt on Gemini 3.8 Flash (low thought level).
   */
  async promptText(promptString, { signal, timeoutMs = 90_000 } = {}) {
    signal?.throwIfAborted();
    if (this.warmupPromise) {
      await this.warmupPromise.catch(() => {});
    }
    signal?.throwIfAborted();
    let sessionId = this.assistantSessionId ?? this.prewarmedSessionId;
    if (sessionId && this.child && !this.child.killed) {
      this.prewarmedSessionId = null;
    } else {
      this.prewarmedSessionId = null;
      sessionId = await this.#createConfiguredSession(signal);
    }

    if (this.assistant) this.assistantSessionId = sessionId;
    this.sessionChunks.set(sessionId, []);
    this.sessionStatus.set(sessionId, { capacity: false, timer: null });
    try {
      const fullPrompt = this.assistant ? promptString : [
        this.outputMode === 'text'
          ? '【你处于小说局部补写模式。严禁调用工具、读取文件或执行命令。只根据输入写出缺口里的新增正文，不输出JSON、代码围栏或解释；连接测试则按测试句要求输出。】'
          : '【重要执行要求：你处于纯文本分析模式，严禁调用任何工具、读取文件或执行终端命令。直接依据下方输入文本输出要求的纯 JSON 结果，不要输出任何额外说明文字。】',
        promptString
      ].join('\n\n');

      const result = await this.#rpc(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: fullPrompt }] },
        { timeoutMs, signal, resetOnTimeout: true }
      );

      const u = result?.usage ?? {};
      this.usageTotals.calls += 1;
      this.usageTotals.inputTokens += u.inputTokens ?? 0;
      this.usageTotals.outputTokens += u.outputTokens ?? 0;
      this.usageTotals.cachedReadTokens += u.cachedReadTokens ?? 0;
      this.usageTotals.thoughtTokens += u.thoughtTokens ?? 0;
      this.usageTotals.totalTokens += u.totalTokens ?? 0;

      const status = separateAgyStatus((this.sessionChunks.get(sessionId) ?? []).join(''));
      const text = status.text;
      if (!text && status.capacity) throw upstreamError(this.modelId, 'capacity');
      if (!text && status.quota) throw upstreamError(this.modelId, 'quota');
      if (result?.stopReason && result.stopReason !== 'end_turn') {
        throw Object.assign(new Error(`反重力 ${this.modelId} 未完成生成（${result.stopReason}），未采用不完整内容。`), { code: 'AGY_INCOMPLETE' });
      }
      if (status.interrupted) {
        this.#killCurrentChild();
      }
      return { text, usage: u, sessionId, stopReason: result?.stopReason };
    } finally {
      clearTimeout(this.sessionStatus.get(sessionId)?.timer);
      this.sessionStatus.delete(sessionId);
      this.sessionChunks.delete(sessionId);
    }
  }

  /**
   * Compatible with RetrievalEngineV2 `customComplete(messages, options, signal) => Promise<string>`
   */
  async complete(messages, options = {}, signal) {
    const formatted = messages.map(m => {
      const tag = m.role === 'system' ? '[SYSTEM INSTRUCTIONS]' : m.role === 'assistant' ? '[PREVIOUS ASSISTANT OUTPUT]' : '[USER INPUT]';
      return `${tag}\n${m.content}`;
    }).join('\n\n---\n\n');
    const { text } = await this.promptText(formatted, { signal, timeoutMs: options.timeoutMs ?? 90_000 });
    return text;
  }

  close() {
    this.closed = true;
    for (const [id, p] of this.pending.entries()) {
      this.#clearPending(id, p);
      p.reject(new Error('AgyFlashClient closed'));
    }
    this.#killCurrentChild();
  }
}
