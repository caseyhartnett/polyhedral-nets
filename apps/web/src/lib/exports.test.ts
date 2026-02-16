import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  assert.equal(generated.svgPages.length, 0);
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
  assert.equal(
    artifactFileName('svg', 'prism', when, 'sheet-r1-c2'),
    'torrify-prism-2026-02-15T03-04-05-sheet-r1-c2.svg'
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

test('sheet layout split generates multiple svg pages when content exceeds target size', () => {
  const shapeDefinition = makeShape({
    height: 240,
    bottomWidth: 240,
    topWidth: 240,
    segments: 14
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      joinStyle: 'tabs',
      includeAlignmentKeys: true
    }
  });

  assert.ok(generated.svgPages.length >= 2);
  assert.ok(generated.svgPages.every((page) => page.content.includes('<svg')));
  assert.equal(generated.artifacts.svg, generated.svgPages[0]?.content);
});

test('sheet layout none keeps raw single-svg behavior', () => {
  const shapeDefinition = makeShape({
    height: 240,
    bottomWidth: 240,
    topWidth: 240,
    segments: 14
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'none',
      joinStyle: 'tabs',
      includeAlignmentKeys: true
    }
  });

  assert.equal(generated.svgPages.length, 0);
  assert.ok(generated.artifacts.svg?.includes('<svg'));
});

test('custom layout validates dimensions', () => {
  const shapeDefinition = makeShape();

  assert.throws(
    () =>
      generateExportArtifacts({
        shapeDefinition,
        exportFormats: ['svg'],
        svgLayers: ['cut'],
        sheetLayout: {
          materialSizePreset: 'custom',
          customSize: { width: 0, height: 10, units: 'in' }
        }
      }),
    /Custom material size requires width and height greater than 0/
  );
});

test('letter split for oversized cube yields multiple unique svg sheets', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'cube',
      edgeLength: 120,
      faceMode: 'uniform'
    }
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      joinStyle: 'tabs',
      includeAlignmentKeys: true
    }
  });

  assert.ok(generated.svgPages.length >= 2, 'cube should split across at least 2 letter sheets');
  assert.equal(generated.svgPages.length, 4, '120mm cube net currently tiles to 2x2 sheets');
  assert.ok(
    generated.svgPages.every((page) =>
      page.content.includes('width="215.900mm" height="279.400mm"')
    ),
    'all pages should render to letter dimensions in mm'
  );

  const suffixes = generated.svgPages.map((page) => page.fileNameSuffix);
  assert.equal(new Set(suffixes).size, generated.svgPages.length, 'sheet suffixes should be unique');

  const contentHashes = generated.svgPages.map((page) =>
    createHash('sha256').update(page.content).digest('hex')
  );
  assert.equal(
    new Set(contentHashes).size,
    generated.svgPages.length,
    'split pages should not be identical copies'
  );
});

test('split sheet output ignores legacy join options and remains straight-cut only', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'cube',
      edgeLength: 120,
      faceMode: 'uniform'
    }
  });

  const withTabs = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      joinStyle: 'tabs',
      includeAlignmentKeys: true
    }
  });

  const withTape = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      joinStyle: 'tape',
      includeAlignmentKeys: false
    }
  });

  assert.equal(withTabs.svgPages.length, withTape.svgPages.length);
  assert.deepEqual(
    withTabs.svgPages.map((page) => page.content),
    withTape.svgPages.map((page) => page.content),
    'legacy split-join options should not affect straight-cut split output'
  );
});

test('split sheet output adds closure cut lines on internal boundaries', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'cube',
      edgeLength: 120,
      faceMode: 'uniform'
    }
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter'
    }
  });

  assert.equal(generated.svgPages.length, 4);
  const pageWidth = 215.9;
  const pageHeight = 279.4;
  const left = 8;
  const right = pageWidth - 8;
  const top = 8;
  const bottom = pageHeight - 8;
  let boundaryPartialCount = 0;

  for (const page of generated.svgPages) {
    const cutSegments = Array.from(
      page.content.matchAll(
        /<path class="cut"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g
      )
    ).map((match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4])
    }));

    const fullBoundaryCut = cutSegments.some((segment) => {
      const isFullLeft =
        Math.abs(segment.x1 - left) < 1e-3 &&
        Math.abs(segment.x2 - left) < 1e-3 &&
        Math.abs(segment.y1 - top) < 1e-3 &&
        Math.abs(segment.y2 - bottom) < 1e-3;
      const isFullRight =
        Math.abs(segment.x1 - right) < 1e-3 &&
        Math.abs(segment.x2 - right) < 1e-3 &&
        Math.abs(segment.y1 - top) < 1e-3 &&
        Math.abs(segment.y2 - bottom) < 1e-3;
      const isFullTop =
        Math.abs(segment.y1 - top) < 1e-3 &&
        Math.abs(segment.y2 - top) < 1e-3 &&
        Math.abs(segment.x1 - left) < 1e-3 &&
        Math.abs(segment.x2 - right) < 1e-3;
      const isFullBottom =
        Math.abs(segment.y1 - bottom) < 1e-3 &&
        Math.abs(segment.y2 - bottom) < 1e-3 &&
        Math.abs(segment.x1 - left) < 1e-3 &&
        Math.abs(segment.x2 - right) < 1e-3;
      return isFullLeft || isFullRight || isFullTop || isFullBottom;
    });

    assert.equal(fullBoundaryCut, false, `page ${page.fileNameSuffix} should not cut a full sheet edge`);

    const partialBoundaryCuts = cutSegments.filter((segment) => {
      const onVerticalBoundary =
        (Math.abs(segment.x1 - left) < 1e-3 && Math.abs(segment.x2 - left) < 1e-3) ||
        (Math.abs(segment.x1 - right) < 1e-3 && Math.abs(segment.x2 - right) < 1e-3);
      const onHorizontalBoundary =
        (Math.abs(segment.y1 - top) < 1e-3 && Math.abs(segment.y2 - top) < 1e-3) ||
        (Math.abs(segment.y1 - bottom) < 1e-3 && Math.abs(segment.y2 - bottom) < 1e-3);
      return onVerticalBoundary || onHorizontalBoundary;
    });

    boundaryPartialCount += partialBoundaryCuts.length;
  }

  assert.ok(boundaryPartialCount > 0, 'expected localized boundary closure cuts across split pages');
});

test('split closure does not bridge disconnected boundary components', () => {
  const shapeDefinition = makeShape({
    height: 140,
    bottomWidth: 180,
    topWidth: 100,
    thickness: 6,
    seamMode: 'straight',
    allowance: 0,
    segments: 8
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter'
    }
  });

  assert.equal(generated.svgPages.length, 6);
  const target = generated.svgPages.find((page) => page.fileNameSuffix === 'sheet-r2-c1');
  assert.ok(target, 'expected sheet-r2-c1 in 2x3 split output');

  const rightEdge = 215.9 - 8;
  const eps = 1e-3;
  const rightBoundaryCuts = Array.from(
    target!.content.matchAll(
      /<path class="cut"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g
    )
  )
    .map((match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4])
    }))
    .filter(
      (segment) => Math.abs(segment.x1 - rightEdge) < eps && Math.abs(segment.x2 - rightEdge) < eps
    )
    .map((segment) => Math.abs(segment.y2 - segment.y1));

  assert.ok(rightBoundaryCuts.length >= 1, 'expected localized right-edge closure cuts');
  assert.ok(
    Math.max(...rightBoundaryCuts) < 80,
    'right-edge closure should be localized, not one long bridged cut'
  );
});

test('top-row split closure avoids non-split outer top edge routing', () => {
  const shapeDefinition = makeShape({
    height: 160,
    bottomWidth: 90,
    topWidth: 120,
    thickness: 6,
    seamMode: 'straight',
    allowance: 8,
    segments: 6
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter'
    }
  });

  assert.equal(generated.svgPages.length, 6);
  const target = generated.svgPages.find((page) => page.fileNameSuffix === 'sheet-r1-c2');
  assert.ok(target, 'expected sheet-r1-c2 in split output');

  const topEdge = 8;
  const leftEdge = 8;
  const rightEdge = 215.9 - 8;
  const eps = 1e-3;
  const topBoundaryCuts = Array.from(
    target!.content.matchAll(
      /<path class="cut"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g
    )
  )
    .map((match) => ({
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4])
    }))
    .filter((segment) => Math.abs(segment.y1 - topEdge) < eps && Math.abs(segment.y2 - topEdge) < eps)
    .map((segment) => Math.abs(segment.x2 - segment.x1));

  assert.ok(topBoundaryCuts.length > 0, 'expected at least one top-edge cut segment');
  assert.ok(
    Math.max(...topBoundaryCuts) < rightEdge - leftEdge - 1,
    'top-row closure should not create a full-width outer top-edge cut'
  );
});

test('frustum top-middle sheet closes all odd endpoints on internal boundaries', () => {
  const shapeDefinition = makeShape({
    height: 160,
    bottomWidth: 90,
    topWidth: 120,
    thickness: 6,
    seamMode: 'straight',
    allowance: 8,
    segments: 6
  });

  const generated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter'
    }
  });

  assert.equal(generated.svgPages.length, 6);
  const target = generated.svgPages.find((page) => page.fileNameSuffix === 'sheet-r1-c2');
  assert.ok(target, 'expected sheet-r1-c2 in split output');

  const left = 8;
  const right = 215.9 - 8;
  const bottom = 279.4 - 8;
  const eps = 1e-3;
  const quantize = (value: number): number => Math.round(value / eps);
  const vertexMap = new Map<string, { x: number; y: number; degree: number }>();

  const addVertex = (x: number, y: number): void => {
    const key = `${quantize(x)}:${quantize(y)}`;
    const existing = vertexMap.get(key);
    if (existing) {
      existing.degree += 1;
      return;
    }
    vertexMap.set(key, { x, y, degree: 1 });
  };

  for (const match of target!.content.matchAll(
    /<path class="cut"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g
  )) {
    addVertex(Number(match[1]), Number(match[2]));
    addVertex(Number(match[3]), Number(match[4]));
  }

  const oddInternalBoundaryVertices = [...vertexMap.values()].filter((vertex) => {
    const onLeft = Math.abs(vertex.x - left) < eps;
    const onRight = Math.abs(vertex.x - right) < eps;
    const onBottom = Math.abs(vertex.y - bottom) < eps;
    return (onLeft || onRight || onBottom) && vertex.degree % 2 === 1;
  });

  assert.deepEqual(
    oddInternalBoundaryVertices,
    [],
    'internal split boundaries should not leave odd-degree dangling cut endpoints'
  );
});
