import assert from 'node:assert/strict';
import test from 'node:test';
import { expansionSelection, MAX_EXPANSION_PROMPT_LENGTH } from '../app/shared/expansion-selection.mjs';

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
