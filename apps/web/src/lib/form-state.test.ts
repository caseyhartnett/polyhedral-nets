import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampInt,
  toggleExportFormat,
  toggleSvgLayerSelection
} from './form-state';

test('toggleExportFormat adds and removes formats', () => {
  assert.deepEqual(toggleExportFormat(['svg'], 'pdf'), ['svg', 'pdf']);
  assert.deepEqual(toggleExportFormat(['svg', 'pdf'], 'pdf'), ['svg']);
});

test('toggleSvgLayerSelection never removes final layer', () => {
  assert.deepEqual(toggleSvgLayerSelection(['cut'], 'cut'), ['cut']);
  assert.deepEqual(toggleSvgLayerSelection(['cut', 'score'], 'cut'), ['score']);
  assert.deepEqual(toggleSvgLayerSelection(['cut'], 'guide'), ['cut', 'guide']);
});

test('clampInt enforces integer bounds and fallback', () => {
  assert.equal(clampInt(7.9, 3, 10, 6), 7);
  assert.equal(clampInt(100, 3, 10, 6), 10);
  assert.equal(clampInt(1, 3, 10, 6), 3);
  assert.equal(clampInt(Number.NaN, 3, 10, 6), 6);
});
