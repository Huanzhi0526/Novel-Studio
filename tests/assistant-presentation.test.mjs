import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeAssistantMarkdown, readableAssistantTables } from '../app/renderer/assistant-markdown.mjs';
import { cardPreview } from '../app/renderer/card-preview.mjs';

const render = text => renderToStaticMarkup(React.createElement(Markdown, {
  remarkPlugins: [remarkGfm, readableAssistantTables]
}, normalizeAssistantMarkdown(text)));

test('collapsed prose tables become labeled records without losing content or rendering HTML', () => {
  const long = '共同修桥的目标、选择与关系变化。'.repeat(10);
  const source = `| 阶段 | 章节 | 设计 | | :--- | :--- | :--- | | **第一幕** | 第1章 | **目标**：${long}<br>**转折**：保留原有证据。 | | 第二幕 | 第2章 | 第二阶段内容。 |`;
  const html = render(source);
  assert.equal((html.match(/class="assistant-table-record"/g) ?? []).length, 2);
  assert.ok(html.includes(long));
  assert.ok(html.includes('第二阶段内容。'));
  assert.match(html, /<br\/>/);
  assert.doesNotMatch(html, /&lt;br|:---/);
  assert.match(html, /<strong>章节：<\/strong>/);
  assert.match(render('<div>原句仍可阅读</div>'), /原句仍可阅读/);
  assert.doesNotMatch(render('<img src="https://example.invalid/private"><script>alert(1)</script>'), /<img|<script/);
});

test('short valid tables stay tables; code fences and ambiguous pipe content are not repaired', () => {
  assert.match(render('| 方案 | 代价 |\n| --- | --- |\n| 甲 | 低 |'), /<table>/);
  const code = '```md\n| a | b | | --- | --- | | c | d |\n```';
  assert.equal(normalizeAssistantMarkdown(code), code);
  const escaped = '| a | b | | --- | --- | | c\\|d | `x\\|y` |';
  assert.match(render(escaped), /c\|d/);
  assert.match(render(escaped), /<code>x\|y<\/code>/);
  const ambiguous = '| a | b | | --- | --- | | c | `x|y` |';
  assert.equal(normalizeAssistantMarkdown(ambiguous), ambiguous);
  const malformed = '| a | b | | --- | --- | | one cell |';
  assert.equal(normalizeAssistantMarkdown(malformed), malformed);
});

test('card preview prioritizes a supplied takeaway and leaves source/evidence untouched', () => {
  const card = { content: '## 摘要\n**合作**：共同修桥。\n\n## 检索标签\n- 关系｜合作', evidence: [{ start: 'p1' }] };
  const before = JSON.stringify(card);
  assert.equal(cardPreview(card), '合作：共同修桥。');
  assert.equal(cardPreview({ ...card, creative_takeaway: '利用分工推进信任。' }), '利用分工推进信任。');
  assert.ok([...cardPreview({ content: '桥'.repeat(500) })].length <= 161);
  assert.equal(JSON.stringify(card), before);
});
