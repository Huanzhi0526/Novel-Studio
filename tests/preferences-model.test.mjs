import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaults, loadPreferences, normalizePreferences, savePreferences, storageKey, writingDefaults, writingSurface
} from '../app/renderer/preferences-model.mjs';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value))
  };
}

test('loadPreferences defaults fresh installs to limit width and honors reset defaults', () => {
  const storage = memoryStorage();
  const prefs = loadPreferences(storage);
  assert.equal(prefs.widthMode, 'limit');
  assert.equal(prefs.width, 680);
  assert.equal(writingDefaults.widthMode, 'limit');
  assert.equal(defaults.widthMode, 'limit');
});

test('loadPreferences preserves saved window mode and legacy widthMode fallback', () => {
  const savedWindow = memoryStorage({
    [storageKey]: JSON.stringify({ widthMode: 'window', width: 680 })
  });
  assert.equal(loadPreferences(savedWindow).widthMode, 'window');

  const legacyDefaultWidth = memoryStorage({
    [storageKey]: JSON.stringify({ width: 680 })
  });
  assert.equal(loadPreferences(legacyDefaultWidth).widthMode, 'window');

  const legacyCustomWidth = memoryStorage({
    [storageKey]: JSON.stringify({ width: 780 })
  });
  assert.equal(loadPreferences(legacyCustomWidth).widthMode, 'limit');

  const roundTrip = memoryStorage();
  const modified = normalizePreferences({ ...defaults, widthMode: 'window', width: 720 });
  savePreferences(modified, roundTrip);
  assert.equal(loadPreferences(roundTrip).widthMode, 'window');
  assert.equal(loadPreferences(roundTrip).width, 720);
});

test('writingSurface computes --writing-measure and --writing-focus-measure', () => {
  const limited = writingSurface(normalizePreferences({ widthMode: 'limit', width: 720, fontSize: 18 }));
  assert.equal(limited.style['--writing-measure'], '720px');
  assert.equal(limited.style['--writing-width'], '720px');
  assert.equal(limited.style['--writing-focus-measure'], '720px');

  const windowed = writingSurface(normalizePreferences({ widthMode: 'window', width: 720, fontSize: 16 }));
  assert.equal(windowed.style['--writing-measure'], '100%');
  assert.equal(windowed.style['--writing-width'], '100%');
  assert.equal(windowed.style['--writing-focus-measure'], `${16 * 42}px`);
});
