import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearWritingSession, matchingPosition, readWritingSession, rememberPosition,
  toggleCollapsedVolume, writeWritingSession
} from '../app/renderer/writing-session.mjs';

function memoryStorage() {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; }
  };
}

const position = { revision: 2, anchor: 15, head: 12, scrollTop: 4.5 };

test('writing session persists only resume metadata and clears after a library restore', () => {
  const storage = memoryStorage();
  const empty = readWritingSession(storage);
  let state = { ...empty, recent: { workId: 'work-1', docId: 'doc-1', text: 'draft body' } };
  state = rememberPosition(state, 'doc-1', { ...position, text: 'draft body' });
  state = toggleCollapsedVolume(state, 'work-1', 'volume-1');
  writeWritingSession({ ...state, text: 'draft body' }, storage);

  assert.equal(storage.getItem().includes('draft body'), false);
  const reloaded = readWritingSession(storage);
  assert.deepEqual(reloaded, {
    recent: { workId: 'work-1', docId: 'doc-1' },
    positions: { 'doc-1': position },
    collapsed: { 'work-1': ['volume-1'] },
    layout: { railCollapsed: false }
  });
  assert.deepEqual(matchingPosition(reloaded, 'doc-1', 2, 15), position);
  assert.equal(matchingPosition(reloaded, 'doc-1', 2, 14), null);
  assert.equal(matchingPosition(reloaded, 'doc-1', 3, 15), null);
  assert.equal(matchingPosition(reloaded, 'toString', 2, 15), null);
  assert.deepEqual(toggleCollapsedVolume(reloaded, 'work-1', 'volume-1').collapsed, {});

  clearWritingSession(storage);
  assert.deepEqual(readWritingSession(storage), empty);
});

test('writing session ignores corrupt storage and invalid entries', () => {
  const storage = memoryStorage();
  const empty = readWritingSession(storage);
  storage.setItem('', 'malformed');
  assert.deepEqual(readWritingSession(storage), empty);
  storage.setItem('', JSON.stringify({
    recent: { workId: 'work-1' },
    positions: { invalid: { ...position, anchor: -1 }, valid: position },
    collapsed: { 'work-1': [null, ' ', 'volume-1', 'volume-1'], invalid: {} }
  }));
  assert.deepEqual(readWritingSession(storage), {
    recent: null, positions: { valid: position }, collapsed: { 'work-1': ['volume-1'] }, layout: { railCollapsed: false }
  });

  const unavailable = () => { throw new Error('Storage unavailable'); };
  assert.deepEqual(readWritingSession({ getItem: unavailable }), empty);
  assert.doesNotThrow(() => writeWritingSession(empty, { setItem: unavailable }));
  assert.doesNotThrow(() => clearWritingSession({ removeItem: unavailable }));
});

test('writing session evicts the oldest positions and collapsed volume entries', () => {
  let state = readWritingSession(memoryStorage());
  for (let i = 0; i < 100; i++) state = rememberPosition(state, `doc-${i}`, position);
  state = rememberPosition(state, 'doc-0', position);
  state = rememberPosition(state, 'doc-100', position);
  assert.equal(Object.keys(state.positions).length, 100);
  assert.ok(state.positions['doc-0']);
  assert.equal(state.positions['doc-1'], undefined);

  for (let i = 0; i < 101; i++) state = toggleCollapsedVolume(state, 'work-0', `volume-${i}`);
  assert.equal(state.collapsed['work-0'].length, 100);
  assert.equal(state.collapsed['work-0'][0], 'volume-1');
  for (let i = 1; i <= 20; i++) state = toggleCollapsedVolume(state, `work-${i}`, 'volume-1');
  assert.equal(Object.keys(state.collapsed).length, 20);
  assert.equal(state.collapsed['work-0'], undefined);
});

test('writing session persists layout railCollapsed boolean and resets invalid layout values', () => {
  const storage = memoryStorage();
  const base = readWritingSession(storage);
  assert.deepEqual(base.layout, { railCollapsed: false });

  writeWritingSession({ ...base, layout: { railCollapsed: true } }, storage);
  assert.deepEqual(readWritingSession(storage).layout, { railCollapsed: true });

  storage.setItem('', JSON.stringify({ layout: { railCollapsed: 'yes' } }));
  assert.deepEqual(readWritingSession(storage).layout, { railCollapsed: false });

  storage.setItem('', JSON.stringify({ layout: 'corrupt' }));
  assert.deepEqual(readWritingSession(storage).layout, { railCollapsed: false });
});
