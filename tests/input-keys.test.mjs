import test from 'node:test';
import assert from 'node:assert/strict';
import { sendIntent } from '../app/renderer/input-keys.mjs';

test('sendIntent: plain Enter and Ctrl/Meta+Enter return send', () => {
  assert.equal(sendIntent({ key: 'Enter' }), 'send');
  assert.equal(sendIntent({ key: 'Enter', ctrlKey: true }), 'send');
  assert.equal(sendIntent({ key: 'Enter', metaKey: true }), 'send');
});

test('sendIntent: Shift+Enter returns newline', () => {
  assert.equal(sendIntent({ key: 'Enter', shiftKey: true }), 'newline');
  assert.equal(sendIntent({ key: 'Enter', shiftKey: true, ctrlKey: true }), null);
});

test('sendIntent: IME composition and keyCode 229 return null', () => {
  assert.equal(sendIntent({ key: 'Enter', isComposing: true }), null);
  assert.equal(sendIntent({ key: 'Enter', nativeEvent: { isComposing: true } }), null);
  assert.equal(sendIntent({ key: 'Enter', keyCode: 229 }), null);
  assert.equal(sendIntent({ key: 'Enter', nativeEvent: { keyCode: 229 } }), null);
});

test('sendIntent: non-Enter or Alt+Enter returns null', () => {
  assert.equal(sendIntent({ key: 'a' }), null);
  assert.equal(sendIntent({ key: 'Enter', altKey: true }), null);
  assert.equal(sendIntent(null), null);
});
