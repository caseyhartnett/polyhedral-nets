import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JOHNSON_SOLID_CATALOG,
  ShapeDefinitionSchema,
  type ShapeDefinition
} from './index.js';

function makeBaseShape(partial: Partial<ShapeDefinition> = {}): ShapeDefinition {
  return {
    schemaVersion: '1.0',
    height: 120,
    bottomWidth: 80,
    topWidth: 80,
    thickness: 4,
    units: 'mm',
    seamMode: 'straight',
    allowance: 0,
    notches: [],
    profilePoints: [],
    generationMode: 'legacy',
    includeTopCap: true,
    segments: 6,
    bottomSegments: 6,
    topSegments: 6,
    ...partial
  };
}

test('legacy shape parsing keeps matching split segments valid', () => {
  const parsed = ShapeDefinitionSchema.parse(
    makeBaseShape({
      segments: 12,
      bottomSegments: 12,
      topSegments: 12
    })
  );

  assert.equal(parsed.segments, 12);
  assert.equal(parsed.bottomSegments, 12);
  assert.equal(parsed.topSegments, 12);
});

test('legacy parsing rejects mismatched top and bottom split segments', () => {
  assert.throws(
    () =>
      ShapeDefinitionSchema.parse(
        makeBaseShape({
          segments: 8,
          bottomSegments: 8,
          topSegments: 6
        })
      ),
    /Unsupported shape: top edge count must be 1/
  );
});

test('johnson preset requires a johnsonId', () => {
  assert.throws(
    () =>
      ShapeDefinitionSchema.parse(
        makeBaseShape({
          generationMode: 'polyhedron',
          polyhedron: {
            preset: 'johnson',
            edgeLength: 40,
            faceMode: 'mixed'
          }
        })
      ),
    /requires johnsonId/
  );
});

test('regularBipyramid enforces ring side bounds for equal-edge geometry', () => {
  assert.throws(
    () =>
      ShapeDefinitionSchema.parse(
        makeBaseShape({
          generationMode: 'polyhedron',
          polyhedron: {
            preset: 'regularBipyramid',
            edgeLength: 40,
            faceMode: 'mixed',
            ringSides: 6
          }
        })
      ),
    /regularBipyramid supports ringSides 3-5/
  );
});

test('johnson catalog ids are unique and complete', () => {
  assert.equal(JOHNSON_SOLID_CATALOG.length, 92);
  const ids = JOHNSON_SOLID_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'j1');
  assert.equal(ids[ids.length - 1], 'j92');
});
