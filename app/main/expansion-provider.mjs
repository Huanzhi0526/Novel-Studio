const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const maxResponseBytes = 512 * 1024;
const maxOutputChars = 12_000;
const roles = new Set(['system', 'user', 'assistant']);

class ExpansionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function invalidEndpoint() {
  return new ExpansionError('EXPAND_CONFIG_INVALID', '请输入完整的 Chat Completions 地址。远程服务必须使用 HTTPS。');
}

export function normalizeExpansionConfig(config) {
  const { endpoint, model } = config ?? {};
  const address = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (address.length > 2048 || !/^https?:\/\//i.test(address) || /[\s\\?#\u0000-\u001f\u007f]/u.test(address)) {
    throw invalidEndpoint();
  }
  let url;
  try {
    url = new URL(address);
  } catch {
    throw invalidEndpoint();
  }
  if (url.username || url.password || !url.pathname.endsWith('/chat/completions') ||
      (url.protocol !== 'https:' && !loopbackHosts.has(url.hostname))) {
    throw invalidEndpoint();
  }
  const modelId = typeof model === 'string' ? model.trim() : '';
  if (!modelId || modelId.length > 200 || /[\u0000-\u001f\u007f]/u.test(modelId)) {
    throw new ExpansionError('EXPAND_CONFIG_INVALID', '请输入有效的模型名称。');
  }
  return { endpoint: url.href, model: modelId };
}

function providerFailure(status, deepSeek) {
  if (status === 401 || status === 403) {
    return new ExpansionError('EXPAND_AUTH_FAILED', '扩写服务拒绝访问。请检查 API 密钥和模型权限。');
  }
  if (deepSeek && status === 402) {
    return new ExpansionError('EXPAND_BALANCE_REQUIRED', 'DeepSeek API 账户余额不足（HTTP 402）。');
  }
  if (status === 429) {
    return new ExpansionError('EXPAND_RATE_LIMITED', '扩写服务暂时限制请求。请稍后重试或检查服务额度。');
  }
  if (status >= 300 && status < 400) {
    return new ExpansionError('EXPAND_REDIRECT', '扩写服务返回了跳转。请检查并填写最终的接口地址。');
  }
  return new ExpansionError('EXPAND_HTTP_ERROR', `扩写服务请求失败（HTTP ${status}）。请检查接口地址和模型设置。`);
}

function invalidResponse() {
  return new ExpansionError('EXPAND_INVALID_RESPONSE', '扩写服务未返回可用的正文。请检查接口和模型设置。');
}

function outputTooLarge() {
  return new ExpansionError('EXPAND_OUTPUT_TOO_LARGE', '扩写服务返回的内容过长。请缩短扩写提示后重试。');
}

async function readCompletion(response) {
  if (!response.body) throw invalidResponse();
  if (Number(response.headers.get('content-length')) > maxResponseBytes) {
    response.body.cancel().catch(() => {});
    throw outputTooLarge();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        reader.cancel().catch(() => {});
        throw outputTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let result;
  try {
    result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
  } catch {
    throw invalidResponse();
  }
  const choice = Array.isArray(result?.choices) ? result.choices[0] : undefined;
  if (choice?.finish_reason === 'length') {
    throw new ExpansionError('EXPAND_TRUNCATED', '扩写内容未写完。请缩小补写范围后重试。');
  }
  if (result?.error || choice?.message?.refusal || (choice?.finish_reason && choice.finish_reason !== 'stop') ||
      typeof choice?.message?.content !== 'string') {
    throw invalidResponse();
  }
  const text = choice.message.content.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new ExpansionError('EXPAND_EMPTY_RESPONSE', '扩写服务返回了空内容。请重试。');
  if (text.length > maxOutputChars) throw outputTooLarge();
  if (!text.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) throw invalidResponse();
  return text;
}

export async function requestExpansion({ config, apiKey = '', messages, signal, maxTokens = 900, timeoutMs = 90_000, connectionTest = false }) {
  const { endpoint, model } = normalizeExpansionConfig(config);
  const deepSeek = new URL(endpoint).origin === 'https://api.deepseek.com';
  const useThinking = deepSeek && config.thinking === true && !connectionTest;
  if (typeof apiKey !== 'string' || apiKey.length > 4096 || /[^\x20-\x7e]/u.test(apiKey)) {
    throw new ExpansionError('EXPAND_CONFIG_INVALID', 'API 密钥格式有误。');
  }
  if (deepSeek && !apiKey) {
    throw new ExpansionError('EXPAND_KEY_REQUIRED', 'DeepSeek 官方接口需要 API Key。请先保存此配置的密钥。');
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20 ||
      messages.some((message) => !roles.has(message?.role) || typeof message?.content !== 'string') ||
      messages.reduce((length, message) => length + message.content.length, 0) > 160_000 ||
      !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new ExpansionError('EXPAND_INVALID_INPUT', '扩写请求不完整或超出长度限制。');
  }
  const controller = new AbortController();
  const abort = () => controller.abort(new ExpansionError('EXPAND_CANCELLED', '已取消扩写。'));
  if (signal?.aborted) abort();
  if (controller.signal.aborted) throw controller.signal.reason;
  signal?.addEventListener('abort', abort, { once: true });
  const deadline = useThinking ? Math.max(timeoutMs, 150_000) : timeoutMs;
  const timer = setTimeout(() => controller.abort(new ExpansionError('EXPAND_TIMEOUT', '扩写等待超时。请重试。')), deadline);
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      redirect: 'manual',
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: messages.map(({ role, content }) => ({ role, content })),
        max_tokens: useThinking ? Math.max(maxTokens, 4096) : maxTokens,
        stream: false,
        // DeepSeek's default thinking can consume the short connection test budget.
        ...(deepSeek ? { thinking: { type: useThinking ? 'enabled' : 'disabled' } } : {}),
        ...(useThinking ? { reasoning_effort: 'low' } : {})
      })
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw providerFailure(response.status, deepSeek);
    }
    return await readCompletion(response);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof ExpansionError) throw error;
    throw new ExpansionError('EXPAND_NETWORK', '无法连接扩写服务。请检查网络和接口地址后重试。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
