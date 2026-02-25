import assert from 'node:assert/strict';
import test from 'node:test';

import type { LayerPath } from '@polyhedral-nets/shared-types';
import {
  buildCutPolygonsFromLayerPaths,
  buildGridTileMeta,
  buildSplitPackTemplateGeometry
} from './split-pack-adapter';

function area(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

test('buildCutPolygonsFromLayerPaths reconstructs a closed polygon from open cut segments', () => {
  const paths: LayerPath[] = [
    { layer: 'cut', closed: false, points: [{ x: 10, y: 0 }, { x: 10, y: 10 }] },
    { layer: 'cut', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { layer: 'cut', closed: false, points: [{ x: 0, y: 10 }, { x: 0, y: 0 }] },
    { layer: 'cut', closed: false, points: [{ x: 10, y: 10 }, { x: 0, y: 10 }] },
    { layer: 'score', closed: false, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }
  ];

  const polygons = buildCutPolygonsFromLayerPaths(paths);
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].holes.length, 0);
  assert.equal(polygons[0].outer.length, 4);
  assert.ok(area(polygons[0].outer) > 0, 'outer ring should be ccw');
});

test('buildCutPolygonsFromLayerPaths throws on non-cycle cut graphs', () => {
  const invalid: LayerPath[] = [
    { layer: 'cut', closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { layer: 'cut', closed: false, points: [{ x: 10, y: 0 }, { x: 10, y: 10 }] },
    { layer: 'cut', closed: false, points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] }
  ];

  assert.throws(
    () => buildCutPolygonsFromLayerPaths(invalid),
    /simple cycle graph|Ambiguous cut graph traversal/
  );
});

test('buildSplitPackTemplateGeometry is deterministic and labels pieces stably', () => {
  const squareA: LayerPath[] = [
    { layer: 'cut', closed: false, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
    { layer: 'cut', closed: false, points: [{ x: 20, y: 0 }, { x: 20, y: 20 }] },
    { layer: 'cut', closed: false, points: [{ x: 20, y: 20 }, { x: 0, y: 20 }] },
    { layer: 'cut', closed: false, points: [{ x: 0, y: 20 }, { x: 0, y: 0 }] }
  ];
  const squareB: LayerPath[] = [
    { layer: 'cut', closed: false, points: [{ x: 30, y: 0 }, { x: 40, y: 0 }] },
    { layer: 'cut', closed: false, points: [{ x: 40, y: 0 }, { x: 40, y: 10 }] },
    { layer: 'cut', closed: false, points: [{ x: 40, y: 10 }, { x: 30, y: 10 }] },
    { layer: 'cut', closed: false, points: [{ x: 30, y: 10 }, { x: 30, y: 0 }] }
  ];

  const first = buildSplitPackTemplateGeometry([...squareB, ...squareA]);
  const second = buildSplitPackTemplateGeometry([...squareA, ...squareB]);

  assert.equal(first.template.cutPolygons.length, 2);
  assert.deepEqual(
    first.template.cutPolygons.map((polygon) => polygon.id),
    second.template.cutPolygons.map((polygon) => polygon.id)
  );
  assert.deepEqual([...first.pieceMetaById.keys()], [...second.pieceMetaById.keys()]);
});

test('buildGridTileMeta computes stable row/column ids and extents', () => {
  const tiles = buildGridTileMeta(
    {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 70
    },
    40,
    30
  );

  assert.equal(tiles.length, 9);
  assert.equal(tiles[0].row, 1);
  assert.equal(tiles[0].col, 1);
  assert.equal(tiles[8].row, 3);
  assert.equal(tiles[8].col, 3);
  assert.equal(tiles[8].rect.maxX, 100);
  assert.equal(tiles[8].rect.maxY, 70);
});
