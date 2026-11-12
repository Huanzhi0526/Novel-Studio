import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';

const DEFAULT_WORKER = fileURLToPath(new URL('../../model/embedding_worker.py', import.meta.url));

export function stripGpuArgs(args = []) {
  const valueFlags = new Set(['-ngl', '--gpu-layers', '--n-gpu-layers', '--device', '-dev', '--main-gpu', '-mg', '--split-mode', '-sm']);
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (valueFlags.has(a)) {
      i += 1;
      continue;
    }
    if ([...valueFlags].some(flag => a.startsWith(`${flag}=`))) continue;
    out.push(a);
  }
  return out;
}

/** Local, line-delimited JSON embedding worker. Configure modelPath to an on-disk
 * Sentence Transformers model directory; no model or text is sent over a network. */
export class EmbeddingProvider {
  constructor(options = {}) {
    this.modelPath = options.modelPath ?? process.env.NOVEL_STUDIO_EMBEDDING_MODEL;
    this.backend = options.backend ?? ((options.runtimePath ?? options.fallbackRuntimePath ?? process.env.NOVEL_STUDIO_LLAMA_SERVER) ? 'llama.cpp' : 'sentence-transformers');
    this.id = options.id ?? options.modelId ?? (this.modelPath ? path.basename(this.modelPath) : 'sentence-transformers-local');
    this.runtimePath = options.runtimePath ?? process.env.NOVEL_STUDIO_LLAMA_SERVER;
    this.fallbackRuntimePath = options.fallbackRuntimePath ?? '';
    this.pythonPath = options.pythonPath ?? process.env.NOVEL_STUDIO_EMBEDDING_PYTHON ?? 'python';
    this.workerPath = options.workerPath ?? DEFAULT_WORKER;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 45_000;
    this.idleTimeoutMs = Number(options.idleTimeoutMs ?? 0);
    this.extraArgs = [...(options.extraArgs ?? [])];
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.activeBackendMode = null;
    this.child = null;
    this.ready = false;
    this.closed = false;
    this.startPromise = null;
    this.activeCalls = 0;
    this.idleTimer = null;
    this.pending = new Map();
    this.buffer = '';
  }

  async embed(texts, { signal, query = false } = {}) {
    if (!Array.isArray(texts) || texts.some((v) => typeof v !== 'string')) {
      throw err('EMBED_INVALID_INPUT', 'texts must be an array of strings', false);
    }
    if (texts.length === 0) return [];
    if (signal?.aborted) throw err('EMBED_ABORTED', 'Embedding request was cancelled', true);
    if (this.closed) throw err('EMBED_CLOSED', 'Embedding provider is closed', true);
    this.#clearIdleTimer();
    this.activeCalls += 1;
    try {
      await this.#start();
      if (signal?.aborted) throw err('EMBED_ABORTED', 'Embedding request was cancelled', true);
      if (this.backend === 'llama.cpp') {
        try {
          return await this.#embedLlama(texts, { signal, query });
        } catch (firstErr) {
          if (!signal?.aborted && !this.closed && /^(ECONNRESET|ECONNREFUSED|EPIPE|EMBED_WORKER_IO)$/.test(String(firstErr?.code ?? ''))) {
            this.#unloadIdleWorker();
            await this.#start();
            return await this.#embedLlama(texts, { signal, query });
          }
          throw firstErr;
        }
      }
      const requestId = randomUUID();
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#failWorker(err('EMBED_TIMEOUT', `Embedding exceeded ${this.timeoutMs} ms`, true));
        }, this.timeoutMs);
        const abort = () => this.#failWorker(err('EMBED_ABORTED', 'Embedding request was cancelled', true));
        signal?.addEventListener('abort', abort, { once: true });
        this.pending.set(requestId, { resolve, reject, timer, signal, abort });
        try {
          this.child.stdin.write(`${JSON.stringify({ id: requestId, texts, query })}\n`, (e) => {
            if (e) this.#failWorker(err('EMBED_WORKER_IO', e.message, true));
          });
        } catch (e) {
          this.#failWorker(err('EMBED_WORKER_IO', e.message, true));
        }
      });
    } finally {
      this.activeCalls = Math.max(0, this.activeCalls - 1);
      this.#scheduleIdleUnload();
    }
  }

  async #start() {
    if (this.ready && this.child && !this.child.killed) return;
    if (this.startPromise) return this.startPromise;
    if (!this.modelPath) throw err('EMBED_MODEL_NOT_CONFIGURED', 'Set modelPath or NOVEL_STUDIO_EMBEDDING_MODEL to a local model directory', true);
    if (this.backend === 'llama.cpp') return this.#startLlama();
    this.startPromise = new Promise((resolve, reject) => {
      const child = this.spawnImpl(this.pythonPath, [this.workerPath, '--model', this.modelPath, ...this.extraArgs], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.child = child;
      this.ready = false;
      this.buffer = '';
      let settled = false;
      const startupTimer = setTimeout(() => {
        if (!settled) { settled = true; child.kill(); reject(err('EMBED_START_TIMEOUT', 'Embedding worker did not become ready in time', true)); }
      }, this.startupTimeoutMs);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let newline;
        while ((newline = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
          let msg;
          try { msg = JSON.parse(line); } catch { this.#failWorker(err('EMBED_PROTOCOL', 'Worker emitted invalid JSON', true)); continue; }
          if (msg.type === 'ready') {
            this.ready = true;
            if (!settled) { settled = true; clearTimeout(startupTimer); resolve(); }
            continue;
          }
          if (msg.type === 'fatal') {
            const failure = err(msg.error?.code ?? 'EMBED_WORKER_START', msg.error?.message ?? 'Embedding worker failed to initialize', msg.error?.recoverable ?? true);
            if (!settled) { settled = true; clearTimeout(startupTimer); reject(failure); }
            this.#failWorker(failure);
            continue;
          }
          const p = this.pending.get(msg.id);
          if (!p) continue;
          this.#clearPending(msg.id, p);
          if (msg.error) p.reject(err(msg.error.code ?? 'EMBED_INFERENCE', msg.error.message ?? 'Embedding failed', msg.error.recoverable ?? true));
          else if (!Array.isArray(msg.vectors)) p.reject(err('EMBED_PROTOCOL', 'Worker response lacks vectors', true));
          else p.resolve(msg.vectors.map((row) => Float32Array.from(row)));
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', () => {}); // diagnostics must not leak text or fill the pipe
      child.on('error', (e) => {
        clearTimeout(startupTimer);
        const failure = err('EMBED_WORKER_START', e.message, true);
        if (!settled) { settled = true; reject(failure); }
        if (this.child === child) this.#failWorker(failure);
      });
      child.on('exit', (code) => {
        clearTimeout(startupTimer);
        const failure = err('EMBED_WORKER_EXIT', `Embedding worker exited (${code ?? 'signal'})`, true);
        if (!settled) { settled = true; reject(failure); }
        if (this.child === child) this.#failWorker(failure, false);
      });
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  #startLlama() {
    if (!this.runtimePath && !this.fallbackRuntimePath) {
      throw err('EMBED_RUNTIME_NOT_CONFIGURED', 'Set runtimePath or NOVEL_STUDIO_LLAMA_SERVER to a local llama-server.exe', true);
    }
    this.startPromise = (async () => {
      try {
        if (!this.runtimePath) throw err('EMBED_RUNTIME_NOT_CONFIGURED', 'Primary runtimePath is empty', true);
        await this.#spawnLlamaOnce(this.runtimePath, this.extraArgs);
        this.activeBackendMode = this.extraArgs.some(a => a === '--device' || a === '-ngl' || a === '--gpu-layers') ? 'gpu' : 'cpu';
      } catch (primaryErr) {
        if (!this.closed && this.fallbackRuntimePath && this.fallbackRuntimePath !== this.runtimePath) {
          this.runtimePath = this.fallbackRuntimePath;
          this.extraArgs = stripGpuArgs(this.extraArgs);
          await this.#spawnLlamaOnce(this.runtimePath, this.extraArgs);
          this.activeBackendMode = 'cpu-fallback';
          return;
        }
        throw primaryErr;
      }
    })().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async #spawnLlamaOnce(runtimePath, extraArgs) {
    const port = await getFreePort();
    this.apiKey = randomBytes(24).toString('hex');
    const hasCustomCtx = extraArgs.some(a => a === '--ctx-size' || a === '-c' || String(a).startsWith('--ctx-size='));
    const spawnArgs = [
      '--model', this.modelPath,
      '--embedding', '--pooling', 'last', '--embd-normalize', '2',
      '--host', '127.0.0.1', '--port', String(port),
      '--parallel', '1',
      ...(hasCustomCtx ? [] : ['--ctx-size', '4096']),
      '--no-webui', '--api-key', this.apiKey,
      ...extraArgs
    ];
    const child = this.spawnImpl(runtimePath, spawnArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    this.ready = false;
    this.baseUrl = `http://127.0.0.1:${port}`;

    await new Promise((resolve, reject) => {
      let settled = false;
      let outputTail = '';
      const startupTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const timeoutErr = err('EMBED_START_TIMEOUT', 'llama.cpp did not become ready in time', true);
        if (this.child === child) this.#failWorker(timeoutErr);
        else if (!child.killed) child.kill();
        reject(timeoutErr);
      }, this.startupTimeoutMs);

      const observeStartup = (stream) => {
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          outputTail = (outputTail + chunk).slice(-8192);
          if (!this.ready && outputTail.includes('listening on http://127.0.0.1:')) {
            this.ready = true;
            if (!settled) {
              settled = true;
              clearTimeout(startupTimer);
              resolve();
            }
          }
        });
      };
      observeStartup(child.stdout);
      observeStartup(child.stderr);

      child.on('error', (e) => {
        clearTimeout(startupTimer);
        const failure = err('EMBED_WORKER_START', e.message, true);
        if (this.child === child) this.#failWorker(failure);
        if (!settled) {
          settled = true;
          reject(failure);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(startupTimer);
        const failure = err(
          settled ? 'EMBED_WORKER_EXIT' : 'EMBED_WORKER_START',
          settled ? `llama.cpp exited (${code ?? 'signal'})` : `llama.cpp failed during startup (${code ?? 'signal'})`,
          true
        );
        if (this.child === child) this.#failWorker(failure, false);
        if (!settled) {
          settled = true;
          reject(failure);
        }
      });
    });
  }

  async #embedLlama(texts, { signal, query }) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const instruction = "Instruct: Retrieve relevant knowledge cards that answer the user's query.\nQuery: ";
    const input = query ? texts.map((text) => instruction + text) : texts;
    try {
      const response = await localRequest(this.baseUrl, '/v1/embeddings', {
        method: 'POST', timeoutMs: this.timeoutMs, signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.id, input }),
      });
      if (response.statusCode < 200 || response.statusCode >= 300) throw err('EMBED_INFERENCE', `llama.cpp returned HTTP ${response.statusCode}`, true);
      const result = JSON.parse(response.body);
      if (!Array.isArray(result.data) || result.data.length !== texts.length) throw err('EMBED_PROTOCOL', 'llama.cpp returned an unexpected embedding batch', true);
      return result.data.sort((a, b) => a.index - b.index).map((item) => Float32Array.from(item.embedding));
    } catch (e) {
      if (controller.signal.aborted) {
        const failure = signal?.aborted ? err('EMBED_ABORTED', 'Embedding request was cancelled', true) : err('EMBED_TIMEOUT', `Embedding exceeded ${this.timeoutMs} ms`, true);
        this.#failWorker(failure);
        throw failure;
      }
      throw typeof e.recoverable === 'boolean' ? e : err(e.code ?? 'EMBED_WORKER_IO', e.message, true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  #clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  #scheduleIdleUnload() {
    this.#clearIdleTimer();
    if (this.closed || this.activeCalls > 0 || !(this.idleTimeoutMs > 0)) return;
    if (!this.child || this.child.killed) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.closed || this.activeCalls > 0 || this.pending.size > 0 || this.startPromise) return;
      this.#unloadIdleWorker();
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  #unloadIdleWorker() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    if (child && !child.killed) child.kill();
  }

  #clearPending(id, p) {
    clearTimeout(p.timer);
    p.signal?.removeEventListener('abort', p.abort);
    this.pending.delete(id);
  }

  #failWorker(failure, kill = true) {
    this.#clearIdleTimer();
    const child = this.child;
    this.child = null;
    this.ready = false;
    if (kill && child && !child.killed) child.kill();
    for (const [id, p] of this.pending) { this.#clearPending(id, p); p.reject(failure); }
  }

  async close() {
    this.closed = true;
    this.#clearIdleTimer();
    const child = this.child;
    this.#failWorker(err('EMBED_CLOSED', 'Embedding provider is closed', true));
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, 2_000);
        child.once('exit', done);
        child.once('error', done);
        if (!child.killed) child.kill();
      });
    }
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((e) => e ? reject(e) : resolve(port));
    });
  });
}

function localRequest(baseUrl, pathname, { method = 'GET', headers = {}, body, signal, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, baseUrl);
    const request = http.request({ hostname: target.hostname, port: Number(target.port), path: target.pathname, method, headers, signal, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(err('EMBED_TIMEOUT', `Local request exceeded ${timeoutMs} ms`, true)));
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function err(code, message, recoverable = true) {
  const e = new Error(message); e.code = code; e.recoverable = recoverable; return e;
}
