import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSheetGuideOverlayForPaths,
  resolveSheetSizeForLayout
} from './sheet-guides';
import { MATERIAL_SIZE_PRESET_OPTIONS } from './export-contracts';

test('resolveSheetSizeForLayout returns converted dimensions for letter preset', () => {
  const size = resolveSheetSizeForLayout(
    {
      materialSizePreset: 'printer-letter'
    },
    'mm',
    MATERIAL_SIZE_PRESET_OPTIONS
  );

  assert.ok(size);
  assert.ok(size && size.width > 215 && size.width < 216);
  assert.ok(size && size.height > 279 && size.height < 280);
});

test('buildSheetGuideOverlayForPaths creates split lines when content exceeds sheet area', () => {
  const overlay = buildSheetGuideOverlayForPaths(
    [
      {
        points: [
          { x: 0, y: 0 },
          { x: 500, y: 0 },
          { x: 500, y: 500 },
          { x: 0, y: 500 }
        ]
      }
    ],
    'mm',
    { materialSizePreset: 'printer-letter' },
    MATERIAL_SIZE_PRESET_OPTIONS
  );

  assert.ok(overlay);
  assert.ok((overlay?.vertical.length ?? 0) > 0 || (overlay?.horizontal.length ?? 0) > 0);
});
