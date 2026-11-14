import assert from 'node:assert/strict';
import test from 'node:test';
import { orderedChapters } from '../app/renderer/writing-order.mjs';

test('orderedChapters expands chapters in volume order even when per-volume positions overlap', () => {
  const volumes = [
    { id: 'vol-1', title: '第一卷', position: 0 },
    { id: 'vol-2', title: '第二卷', position: 1 }
  ];
  // Simulate SQLite ORDER BY position, id where vol-2 chapter at position 0 appears first in docs array
  const docs = [
    { id: 'a-vol2-ch1', volume_id: 'vol-2', kind: 'chapter', position: 0, title: '第10章 灯塔' },
    { id: 'z-vol1-ch1', volume_id: 'vol-1', kind: 'chapter', position: 0, title: '第一章 熄灭的信号灯' },
    { id: 'z-vol1-ch2', volume_id: 'vol-1', kind: 'chapter', position: 1, title: '第2章' },
    { id: 'outline-1', volume_id: null, kind: 'outline', position: 0, title: '大纲' }
  ];
  const result = orderedChapters(volumes, docs);
  assert.deepEqual(result.map(item => item.id), ['z-vol1-ch1', 'z-vol1-ch2', 'a-vol2-ch1']);
});

test('orderedChapters skips deleted chapters and handles empty works', () => {
  const volumes = [{ id: 'vol-1', title: '第一卷' }];
  const docs = [
    { id: 'ch-deleted', volume_id: 'vol-1', kind: 'chapter', deleted: 1700000000 },
    { id: 'ch-live', volume_id: 'vol-1', kind: 'chapter', deleted: null }
  ];
  assert.deepEqual(orderedChapters(volumes, docs).map(item => item.id), ['ch-live']);
  assert.deepEqual(orderedChapters([], []), []);
  assert.deepEqual(orderedChapters(volumes, []), []);
});
