import assert from 'node:assert/strict';
import test from 'node:test';
import { ShapeDefinitionSchema, type ShapeDefinition } from '@torrify/shared-types';
import {
  availableArtifactFormats,
  artifactFileName,
  artifactMimeType,
  filterTemplateLayers,
  generateExportArtifacts
} from './exports';

function makeShape(partial: Partial<ShapeDefinition> = {}): ShapeDefinition {
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
    segments: 6,
    ...partial
  });
}

test('generateExportArtifacts builds only selected artifact formats', () => {
  const shapeDefinition = makeShape();
  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg', 'pdf'],
    svgLayers: ['cut', 'score']
  });

  assert.ok(generated.artifacts.svg?.includes('<svg'));
  assert.ok(generated.artifacts.pdf?.startsWith('%PDF-1.4'));
  assert.equal(generated.artifacts.stl, undefined);
  assert.equal(generated.geometry.kind, 'prism');
});

test('filterTemplateLayers removes unselected template layers', () => {
  const shapeDefinition = makeShape({ seamMode: 'tabbed', allowance: 8 });
  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide']
  });

  const filtered = filterTemplateLayers(generated.geometry, ['cut']);
  assert.ok(filtered.template.paths.length > 0);
  assert.ok(filtered.template.paths.every((path) => path.layer === 'cut'));
});

test('artifact metadata helpers return stable values', () => {
  const when = new Date('2026-02-15T03:04:05.999Z');

  assert.equal(artifactMimeType('svg'), 'image/svg+xml;charset=utf-8');
  assert.equal(artifactMimeType('pdf'), 'application/pdf');
  assert.equal(artifactMimeType('stl'), 'model/stl;charset=utf-8');

  assert.equal(
    artifactFileName('pdf', 'polyhedron', when),
    'torrify-polyhedron-2026-02-15T03-04-05.pdf'
  );
});

test('generateExportArtifacts rejects empty export selection', () => {
  const shapeDefinition = makeShape();

  assert.throws(
    () =>
      generateExportArtifacts({
        shapeDefinition,
        exportFormats: [],
        svgLayers: ['cut']
      }),
    /Select at least one export format/
  );
});

test('availableArtifactFormats returns deterministic download order', () => {
  assert.deepEqual(
    availableArtifactFormats({
      stl: 'stl-content',
      svg: 'svg-content'
    }),
    ['svg', 'stl']
  );
});
