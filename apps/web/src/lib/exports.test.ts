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

test('svg perforation converts score lines into short cut-and-gap score segments', () => {
  const shapeDefinition = makeShape();

  const plain = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score']
  });
  const perforated = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score'],
    svgPerforation: {
      enabled: true,
      layers: ['score'],
      cutLength: 1,
      gapLength: 1
    }
  });

  const plainSvg = plain.artifacts.svg ?? '';
  const perforatedSvg = perforated.artifacts.svg ?? '';

  const plainScoreSegments = Array.from(plainSvg.matchAll(/<path class="score"[^>]* d="M /g)).length;
  const perforatedScoreSegments = Array.from(
    perforatedSvg.matchAll(/<path class="score"[^>]* d="M /g)
  ).length;

  assert.ok(plainScoreSegments > 0, 'expected baseline score lines to exist');
  assert.ok(
    perforatedScoreSegments > plainScoreSegments,
    'expected perforated output to split score lines into more segments'
  );

  const segmentLengths = Array.from(
    perforatedSvg.matchAll(/<path class="score"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g)
  ).map((match) => {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  });

  assert.ok(segmentLengths.length > 0, 'expected perforated score path segments');
  assert.ok(
    Math.max(...segmentLengths) <= 1.05,
    'perforated score segment lengths should track configured cut length'
  );
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

test('optional packing optimization reduces split sheet count for fragmented layouts', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 50,
      faceMode: 'uniform'
    }
  });

  const baseline = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: false
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  const baselineSheetCount = baseline.svgPages.filter((page) => page.kind === 'sheet').length;
  const optimizedSheetCount = optimized.svgPages.filter((page) => page.kind === 'sheet').length;

  assert.ok(
    baselineSheetCount >= 2,
    'baseline split should produce multiple pages before optimization'
  );
  assert.ok(optimizedSheetCount >= 1, 'optimized split should produce at least one page');
  assert.ok(
    optimizedSheetCount < baselineSheetCount,
    'optional packing should reduce the final split sheet count for fragmented layouts'
  );
});

test('pre-split orientation can fit dodecahedron-45 onto a single 12x24 sheet', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 45,
      faceMode: 'uniform'
    }
  });

  const baseline = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'cricut-mat-12x24',
      optimizePacking: false
    }
  });

  const sheetPages = baseline.svgPages.filter((page) => page.kind === 'sheet');
  assert.equal(sheetPages.length, 1, 'expected orientation pre-pass to avoid unnecessary split');
  assert.equal(sheetPages[0]?.fileNameSuffix, 'sheet-r1-c1');
});

test('packing optimization remains deterministic across repeated runs', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 70,
      faceMode: 'uniform'
    }
  });

  const options: Parameters<typeof generateExportArtifacts>[0] = {
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  };

  const first = generateExportArtifacts(options);
  const second = generateExportArtifacts(options);

  const firstSheets = first.svgPages.filter((page) => page.kind === 'sheet');
  const secondSheets = second.svgPages.filter((page) => page.kind === 'sheet');
  assert.equal(firstSheets.length, secondSheets.length, 'sheet count should be stable across runs');

  const firstHashes = firstSheets.map((page) => createHash('sha256').update(page.content).digest('hex'));
  const secondHashes = secondSheets.map((page) => createHash('sha256').update(page.content).digest('hex'));
  assert.deepEqual(secondHashes, firstHashes, 'packed sheet content should be deterministic');

  assert.ok(
    firstSheets.every((page) => page.content.includes('width="215.900mm" height="279.400mm"')),
    'optimized pages should preserve letter material dimensions'
  );
});

test('packing optimization can append an assembly guide page', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 70,
      faceMode: 'uniform'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: true
    }
  });

  const sheetPages = optimized.svgPages.filter((page) => page.kind === 'sheet');
  const assembly = optimized.svgPages.find((page) => page.kind === 'assembly-guide');

  assert.ok(sheetPages.length >= 2, 'expected packed output to include multiple sheet pages');
  assert.ok(assembly, 'expected an assembly guide page to be generated');
  assert.equal(assembly?.fileNameSuffix, 'assembly-guide');
  assert.ok(assembly?.content.includes('id="assembly-grid"'), 'expected assembly grid overlay');
  assert.ok(
    /Sheet [0-9]+ - Piece [A-Z]+/.test(assembly?.content ?? ''),
    'expected assembly guide labels to map pieces back to packed sheet numbers'
  );
});

test('assembly guide page is optional in packing optimization', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 70,
      faceMode: 'uniform'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  assert.equal(
    optimized.svgPages.some((page) => page.kind === 'assembly-guide'),
    false,
    'assembly guide should be omitted when disabled'
  );
});

test('assembly guide labels remain unique even when tiny shards are grouped', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'truncatedOctahedron',
      edgeLength: 85,
      faceMode: 'mixed'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: true
    }
  });

  const assembly = optimized.svgPages.find((page) => page.kind === 'assembly-guide');
  assert.ok(assembly, 'expected assembly guide page');

  const labels = Array.from((assembly?.content ?? '').matchAll(/Piece ([A-Z]+)/g)).map((match) => match[1]);
  assert.ok(labels.length > 0, 'expected at least one piece label in assembly guide');
  assert.equal(new Set(labels).size, labels.length, 'assembly guide piece labels should be unique');
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

test('split sheet output does not add synthetic boundary closure cuts', () => {
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

  assert.equal(
    boundaryPartialCount,
    0,
    'polygon-first split should not inject synthetic boundary closure cut segments'
  );
});

test('split output does not add disconnected boundary closure connectors', () => {
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

  assert.ok(generated.svgPages.length >= 4);
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

  assert.equal(
    rightBoundaryCuts.length,
    0,
    'polygon-first split should avoid synthetic right-edge closure cuts entirely'
  );
});

test('top-row split avoids synthetic outer top-edge routing', () => {
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

  assert.ok(generated.svgPages.length >= 4);
  const target = generated.svgPages.find((page) => page.fileNameSuffix === 'sheet-r1-c2');
  assert.ok(target, 'expected sheet-r1-c2 in split output');

  const topEdge = 8;
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

  assert.equal(
    topBoundaryCuts.length,
    0,
    'polygon-first split should not inject synthetic top-edge closure segments'
  );
});

function extractCutSegmentBounds(svgContent: string): Array<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> {
  return Array.from(
    svgContent.matchAll(
      /<path class="cut"[^>]* d="M ([0-9.-]+) ([0-9.-]+) L ([0-9.-]+) ([0-9.-]+)"/g
    )
  ).map((match) => {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2)
    };
  });
}

function groupSegmentsIntoComponents(
  segments: Array<{ minX: number; minY: number; maxX: number; maxY: number }>
): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
  if (segments.length === 0) {
    return [];
  }

  const eps = 0.2;
  const parent = segments.map((_segment, index) => index);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  };

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      const overlap =
        a.maxX >= b.minX - eps &&
        b.maxX >= a.minX - eps &&
        a.maxY >= b.minY - eps &&
        b.maxY >= a.minY - eps;
      if (overlap) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, typeof segments>();
  for (let i = 0; i < segments.length; i += 1) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(segments[i]);
    groups.set(root, list);
  }

  return [...groups.values()].map((group) => ({
    minX: Math.min(...group.map((b) => b.minX)),
    minY: Math.min(...group.map((b) => b.minY)),
    maxX: Math.max(...group.map((b) => b.maxX)),
    maxY: Math.max(...group.map((b) => b.maxY))
  }));
}

function detectComponentOverlaps(
  svgContent: string,
  gapThreshold: number
): Array<{ i: number; j: number; overlapX: number; overlapY: number }> {
  const segments = extractCutSegmentBounds(svgContent);
  const components = groupSegmentsIntoComponents(segments);
  const overlaps: Array<{ i: number; j: number; overlapX: number; overlapY: number }> = [];

  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      const a = components[i];
      const b = components[j];
      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
      if (overlapX > gapThreshold && overlapY > gapThreshold) {
        overlaps.push({ i, j, overlapX, overlapY });
      }
    }
  }

  return overlaps;
}

test('packed dodecahedron-70 sheets have no overlapping cut components', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 70,
      faceMode: 'uniform'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  const sheetPages = optimized.svgPages.filter((page) => page.kind === 'sheet');
  assert.ok(sheetPages.length >= 2, 'expected multiple packed sheets');

  for (const page of sheetPages) {
    const overlaps = detectComponentOverlaps(page.content, 0.5);
    assert.deepEqual(
      overlaps,
      [],
      `packed page ${page.fileNameSuffix} has ${overlaps.length} cut component bounding-box overlap(s)`
    );
  }
});

test('packed dodecahedron-50 sheets have no overlapping cut components', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 50,
      faceMode: 'uniform'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  const sheetPages = optimized.svgPages.filter((page) => page.kind === 'sheet');
  assert.ok(sheetPages.length >= 1, 'expected at least one packed sheet');

  for (const page of sheetPages) {
    const overlaps = detectComponentOverlaps(page.content, 0.5);
    assert.deepEqual(
      overlaps,
      [],
      `packed page ${page.fileNameSuffix} has cut component bounding-box overlap(s)`
    );
  }
});

test('packed truncatedOctahedron-85 sheets have no overlapping cut components', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'truncatedOctahedron',
      edgeLength: 85,
      faceMode: 'mixed'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  const sheetPages = optimized.svgPages.filter((page) => page.kind === 'sheet');
  assert.ok(sheetPages.length >= 1, 'expected at least one packed sheet');

  for (const page of sheetPages) {
    const overlaps = detectComponentOverlaps(page.content, 0.5);
    assert.deepEqual(
      overlaps,
      [],
      `packed page ${page.fileNameSuffix} has cut component bounding-box overlap(s)`
    );
  }
});

test('packed sheets keep all content within page boundaries', () => {
  const shapeDefinition = makeShape({
    generationMode: 'polyhedron',
    polyhedron: {
      preset: 'dodecahedron',
      edgeLength: 70,
      faceMode: 'uniform'
    }
  });

  const optimized = generateExportArtifacts({
    shapeDefinition,
    exportFormats: ['svg'],
    svgLayers: ['cut', 'score', 'guide'],
    sheetLayout: {
      materialSizePreset: 'printer-letter',
      optimizePacking: true,
      allowRotation: true,
      includeAssemblyGuide: false
    }
  });

  const pageWidth = 215.9;
  const pageHeight = 279.4;

  for (const page of optimized.svgPages.filter((p) => p.kind === 'sheet')) {
    const segments = extractCutSegmentBounds(page.content);
    for (const segment of segments) {
      assert.ok(
        segment.minX >= -0.5 && segment.maxX <= pageWidth + 0.5,
        `page ${page.fileNameSuffix}: cut segment X [${segment.minX.toFixed(1)}, ${segment.maxX.toFixed(1)}] outside page width ${pageWidth}`
      );
      assert.ok(
        segment.minY >= -0.5 && segment.maxY <= pageHeight + 0.5,
        `page ${page.fileNameSuffix}: cut segment Y [${segment.minY.toFixed(1)}, ${segment.maxY.toFixed(1)}] outside page height ${pageHeight}`
      );
    }
  }
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

  assert.ok(generated.svgPages.length >= 4);
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
