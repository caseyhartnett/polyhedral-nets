import assert from 'node:assert/strict';
import test from 'node:test';
import { ShapeDefinitionSchema } from '@torrify/shared-types';
import { assessGenerationComplexity } from './performance-guard';

function makeShape(overrides: Record<string, unknown> = {}) {
  return ShapeDefinitionSchema.parse({
    schemaVersion: '1.0',
    height: 120,
    bottomWidth: 90,
    topWidth: 90,
    thickness: 4,
    units: 'mm',
    seamMode: 'straight',
    allowance: 0,
    notches: [],
    profilePoints: [],
    generationMode: 'legacy',
    segments: 8,
    ...overrides
  });
}

test('assessGenerationComplexity returns null for small/default geometry', () => {
  const shape = makeShape();
  assert.equal(assessGenerationComplexity(shape, 'none', false), null);
});

test('assessGenerationComplexity flags very complex legacy configuration', () => {
  const shape = makeShape({
    seamMode: 'tabbed',
    segments: 64,
    bottomSegments: 64,
    topSegments: 64
  });
  const guard = assessGenerationComplexity(shape, 'printer-letter', true);
  assert.ok(guard);
  assert.ok(guard && guard.score >= 220);
});

test('assessGenerationComplexity flags johnson solids as heavy', () => {
  const shape = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'johnson',
      johnsonId: 'j1',
      edgeLength: 40,
      faceMode: 'mixed'
    }
  });
  const guard = assessGenerationComplexity(shape, 'none', false);
  assert.ok(guard);
});
