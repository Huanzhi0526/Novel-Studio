import test from 'node:test';
import assert from 'node:assert/strict';
import { readResultPackage, paragraphId, paragraphNumber, validateCard } from '../app/main/protocol.mjs';

const sample = new URL('../拆书规范包/examples/标准结果样例.zip', import.meta.url);

test('paragraph identifiers are canonical and one based', () => {
  assert.equal(paragraphId(1), 'p000001');
  assert.equal(paragraphId(1_000_000), 'p1000000');
  assert.equal(paragraphNumber('p000001'), 1);
  assert.ok(Number.isNaN(paragraphNumber('p0000001')));
  assert.ok(Number.isNaN(paragraphNumber('p000000')));
});

test('the bundled valid package reads with a stable logical digest', async () => {
  const first = await readResultPackage(sample);
  const second = await readResultPackage(sample);
  assert.equal(first.digest, second.digest);
  assert.equal(first.result.schema_version, 'draft-0.1');
  assert.equal(first.result.volumes[0].normalized_payload.blocks.length, 4);
  assert.deepEqual(first.warnings, []);
});

test('card validator checks referenced revision ranges and warns on missing related cards', () => {
  const card = {
    card_id: '617ff8c7-e0a8-5fc7-8b3e-cfbda4c34f41', category: 'event', title: '海上求救',
    content: '暴雨夜发生求救事件。', claim_type: 'fact',
    evidence: [{ volume_id: '076c0d56-d7d8-5a8d-831e-3f853372646f', revision_id: 'a'.repeat(64), start: 'p000001', end: 'p000002' }],
    related_card_ids: ['617ff8c7-e0a8-5fc7-8b3e-cfbda4c34f42']
  };
  const lookup = {
    revision: (_workId, _volumeId, revisionId) => revisionId === 'a'.repeat(64) ? { count: 4 } : undefined,
    card: () => false
  };
  const result = validateCard(card, 'a2213e04-5fd1-5756-ac23-95165a58fc3b', lookup);
  assert.equal(result.warnings.length, 1);
  assert.throws(() => validateCard({ ...card, evidence: [{ ...card.evidence[0], end: 'p000005' }] }, 'a2213e04-5fd1-5756-ac23-95165a58fc3b', lookup), { code: 'RANGE_INVALID' });
});
