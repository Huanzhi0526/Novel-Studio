import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { normalizeExpansionConfig, requestExpansion } from '../app/main/expansion-provider.mjs';

const model = 'writing-model';
const apiKey = 'local-test-key';
const messages = [{ role: 'system', content: '只写小说正文。' }, { role: 'user', content: '补充青黛制服。' }];

async function listen(t, onRequest) {
  const server = createServer(onRequest);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return { endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, model };
}

function completion(content, finishReason = 'stop') {
  return JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] });
}

test('configuration requires a full completion route and uses HTTPS outside loopback', () => {
  assert.deepEqual(normalizeExpansionConfig({ endpoint: ' HTTPS://EXAMPLE.COM/api/v1/chat/completions ', model: ` ${model} ` }), {
    endpoint: 'https://example.com/api/v1/chat/completions', model
  });
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const endpoint = `http://${host}:1234/v1/chat/completions`;
    assert.equal(normalizeExpansionConfig({ endpoint, model }).endpoint, endpoint);
  }
  for (const endpoint of [
    'http://example.com/v1/chat/completions', 'http://192.168.1.1/v1/chat/completions',
    'https://user:secret@example.com/v1/chat/completions', 'https://example.com/v1/chat/completions?key=secret',
    'https://example.com/v1/chat/completions#', 'https://example.com/v1/chat/completions?',
    'https://example.com/v1/embeddings', 'https://example.com/v1', 'file:///v1/chat/completions'
  ]) {
    assert.throws(() => normalizeExpansionConfig({ endpoint, model }), { code: 'EXPAND_CONFIG_INVALID' });
  }
  assert.throws(() => normalizeExpansionConfig(null), { code: 'EXPAND_CONFIG_INVALID' });
  assert.throws(() => normalizeExpansionConfig({ endpoint: 'https://example.com/v1/chat/completions', model: ' ' }), { code: 'EXPAND_CONFIG_INVALID' });
});

test('provider sends a bounded chat request and extracts the text', async (t) => {
  let received;
  const config = await listen(t, async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = { path: request.url, method: request.method, headers: request.headers, body: JSON.parse(Buffer.concat(chunks)) };
    response.end(completion('\n衣襟收着两道细银边。\n第二段。  '));
  });
  assert.equal(await requestExpansion({ config: { ...config, thinking: true }, apiKey, messages, maxTokens: 630 }), '衣襟收着两道细银边。\n第二段。');
  assert.equal(received.path, '/v1/chat/completions');
  assert.equal(received.method, 'POST');
  assert.equal(received.headers.authorization, `Bearer ${apiKey}`);
  assert.equal(received.headers['content-type'], 'application/json');
  assert.deepEqual(received.body, { model, messages, max_tokens: 630, stream: false });
});

test('official DeepSeek uses a short connection test, honors expansion thinking, and distinguishes balance errors', async (t) => {
  const config = { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' };
  const calls = [];
  let responseStatus = 200;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, authorization: options.headers.authorization });
    if (responseStatus === 402) return new Response('private balance response', { status: 402 });
    return new Response(body.thinking?.type === 'disabled' || (body.thinking?.type === 'enabled' && body.max_tokens >= 4096)
      ? completion('连接正常。')
      : completion(null, 'length'));
  });
  await assert.rejects(requestExpansion({ config, messages }), { code: 'EXPAND_KEY_REQUIRED' });
  assert.equal(calls.length, 0);
  assert.equal(await requestExpansion({ config, apiKey, messages, maxTokens: 48 }), '连接正常。');
  assert.equal(await requestExpansion({ config, apiKey, messages }), '连接正常。');
  const thinkingConfig = { ...config, thinking: true };
  assert.equal(await requestExpansion({ config: thinkingConfig, apiKey, messages, maxTokens: 48, connectionTest: true }), '连接正常。');
  assert.equal(await requestExpansion({ config: thinkingConfig, apiKey, messages }), '连接正常。');
  assert.deepEqual(calls.map(({ body }) => [body.max_tokens, body.thinking.type, body.reasoning_effort]), [
    [48, 'disabled', undefined], [900, 'disabled', undefined], [48, 'disabled', undefined], [4096, 'enabled', 'low']
  ]);
  assert.equal(calls[0].url, config.endpoint);
  assert.equal(calls[0].authorization, `Bearer ${apiKey}`);
  responseStatus = 402;
  await assert.rejects(requestExpansion({ config, apiKey, messages }), {
    code: 'EXPAND_BALANCE_REQUIRED', message: 'DeepSeek API 账户余额不足（HTTP 402）。'
  });
});

test('redirects are refused and server error bodies do not reach callers', async (t) => {
  let status = 307;
  let requests = 0;
  const config = await listen(t, (request, response) => {
    requests += 1;
    if (status === 307) response.setHeader('Location', '/should-not-be-requested');
    response.writeHead(status).end('server diagnostic local-test-key 衣襟 127.0.0.1');
  });
  for (const [statusCode, code] of [[307, 'EXPAND_REDIRECT'], [401, 'EXPAND_AUTH_FAILED'], [429, 'EXPAND_RATE_LIMITED'], [500, 'EXPAND_HTTP_ERROR']]) {
    status = statusCode;
    await assert.rejects(requestExpansion({ config, apiKey, messages }), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /diagnostic|local-test-key|衣襟|127\.0\.0\.1/);
      return true;
    });
  }
  assert.equal(requests, 4);
});

test('malformed, empty, truncated and oversized responses do not enter the editor', async (t) => {
  let content = '';
  let chunked = false;
  const config = await listen(t, (_request, response) => {
    if (chunked) response.write(content.slice(0, 90));
    response.end(chunked ? content.slice(90) : content);
  });
  for (const [value, code] of [
    ['server error echoed private input', 'EXPAND_INVALID_RESPONSE'],
    [completion([{ text: '未知内容格式' }]), 'EXPAND_INVALID_RESPONSE'],
    [completion(' \n '), 'EXPAND_EMPTY_RESPONSE'],
    [completion('未完成的扩写', 'length'), 'EXPAND_TRUNCATED'],
    [completion('被过滤的扩写', 'content_filter'), 'EXPAND_INVALID_RESPONSE'],
    [completion('长'.repeat(12_001)), 'EXPAND_OUTPUT_TOO_LARGE'],
    [completion('长'.repeat(180_000)), 'EXPAND_OUTPUT_TOO_LARGE']
  ]) {
    content = value;
    await assert.rejects(requestExpansion({ config, messages }), { code });
  }
  chunked = true;
  await assert.rejects(requestExpansion({ config, messages }), { code: 'EXPAND_OUTPUT_TOO_LARGE' });
});

test('cancelled requests, timeouts during body reads, and network failures are distinct', async (t) => {
  const reachedServer = Promise.withResolvers();
  let requestCount = 0;
  const config = await listen(t, (_request, response) => {
    requestCount += 1;
    response.write('{');
    reachedServer.resolve();
  });
  await assert.rejects(requestExpansion({ config, messages, signal: AbortSignal.abort(new Error('caller reason')) }), { code: 'EXPAND_CANCELLED' });
  assert.equal(requestCount, 0);
  const controller = new AbortController();
  const pending = requestExpansion({ config, messages, signal: controller.signal });
  await reachedServer.promise;
  controller.abort(new Error('caller reason'));
  await assert.rejects(pending, { code: 'EXPAND_CANCELLED' });
  await assert.rejects(requestExpansion({ config, messages, timeoutMs: 150 }), { code: 'EXPAND_TIMEOUT' });
  assert.equal(requestCount, 2);
  const reset = await listen(t, (request) => request.socket.destroy());
  await assert.rejects(requestExpansion({ config: reset, messages }), { code: 'EXPAND_NETWORK' });
});
