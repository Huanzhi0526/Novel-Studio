import assert from 'node:assert/strict';
import test from 'node:test';
import { enclosingExpansionPair, expansionSelection, MAX_EXPANSION_PROMPT_LENGTH } from '../app/shared/expansion-selection.mjs';

test('expansion normalizes exact selections inside or around one bracket pair', () => {
  const source = '她停在走廊。（ 描述她的学院制服 ）门铃响了。';
  const from = source.indexOf('（');
  const to = source.indexOf('）') + 1;
  const match = { from, to, prompt: '描述她的学院制服' };
  assert.deepEqual(expansionSelection(source, from, to), match);
  assert.deepEqual(expansionSelection(source, from + 1, to - 1), match);
  assert.equal(expansionSelection(source, from + 2, to - 1), null);
  assert.equal(expansionSelection(source, from - 1, to), null);
  assert.equal(expansionSelection(source, from, to - 1), null);
});

test('expansion matches nested bracket styles and rejects spanning multiple pairs', () => {
  const source = '(她穿制服（深蓝色）)';
  assert.deepEqual(expansionSelection(source, 0, source.length), {
    from: 0, to: source.length, prompt: '她穿制服（深蓝色）'
  });
  for (const invalid of ['（甲）（乙）', '(甲）', '（甲(乙）', '（甲(乙）丙)）', '（ ）']) {
    assert.equal(expansionSelection(invalid, 0, invalid.length), null);
  }
});

test('expansion enforces the trimmed prompt limit and preserves UTF-16 offsets', () => {
  const limit = '🧥'.repeat(MAX_EXPANSION_PROMPT_LENGTH / 2);
  const source = `（ ${limit} ）`;
  assert.equal(expansionSelection(source, 0, source.length)?.prompt, limit);
  const oversized = `（${limit} 衣）`;
  assert.equal(expansionSelection(oversized, 0, oversized.length), null);
  const split = '（🧥）';
  assert.equal(expansionSelection(split, 2, split.length - 1), null);
});

test('enclosingExpansionPair detects Chinese and English brackets around cursor only when inside', () => {
  const cn = '她停在走廊。（ 描写她的制服 ）门铃响了。';
  const cnFrom = cn.indexOf('（');
  const cnTo = cn.indexOf('）') + 1;
  const cnMatch = { from: cnFrom, to: cnTo, prompt: '描写她的制服' };
  assert.deepEqual(enclosingExpansionPair(cn, cnFrom + 1), cnMatch);
  assert.deepEqual(enclosingExpansionPair(cn, cnFrom + 4), cnMatch);
  assert.deepEqual(enclosingExpansionPair(cn, cnTo - 1), cnMatch);
  assert.equal(enclosingExpansionPair(cn, cnFrom), null);
  assert.equal(enclosingExpansionPair(cn, cnTo), null);
  assert.equal(enclosingExpansionPair(cn, 0), null);
  assert.equal(enclosingExpansionPair(cn, cn.length), null);

  const en = 'Walks in (describe coat) quietly.';
  const enFrom = en.indexOf('(');
  const enTo = en.indexOf(')') + 1;
  assert.deepEqual(enclosingExpansionPair(en, enFrom + 2), { from: enFrom, to: enTo, prompt: 'describe coat' });
  assert.equal(enclosingExpansionPair(en, enFrom), null);
  assert.equal(enclosingExpansionPair(en, enTo), null);
});

test('enclosingExpansionPair picks innermost valid nested pair and rejects empty or oversized prompts', () => {
  const nested = '(外层（内层细节）继续)';
  const innerFrom = nested.indexOf('（');
  const innerTo = nested.indexOf('）') + 1;
  assert.deepEqual(enclosingExpansionPair(nested, innerFrom + 2), { from: innerFrom, to: innerTo, prompt: '内层细节' });
  assert.deepEqual(enclosingExpansionPair(nested, 2), { from: 0, to: nested.length, prompt: '外层（内层细节）继续' });

  assert.equal(enclosingExpansionPair('（   ）', 2), null);
  assert.equal(enclosingExpansionPair('（甲(乙）', 3), null);

  const over = `（${'字'.repeat(MAX_EXPANSION_PROMPT_LENGTH + 1)}）`;
  assert.equal(enclosingExpansionPair(over, 5), null);

  const emoji = '（🧥）';
  assert.equal(enclosingExpansionPair(emoji, 2), null);
  assert.deepEqual(enclosingExpansionPair(emoji, 1), { from: 0, to: emoji.length, prompt: '🧥' });
});
