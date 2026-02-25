import type {
  Config as SplitPackConfig,
  GridTile as SplitPackGridTile,
  LineFeature as SplitPackLineFeature,
  PolygonWithHoles as SplitPackPolygonWithHoles,
  Sheet as SplitPackSheet,
  TemplateGeometry as SplitPackTemplateGeometry
} from '@polyhedral-nets/geometry-engine';
import type { LayerPath, Point2, SvgLayer } from '@polyhedral-nets/shared-types';

const EPSILON = 1e-9;
export const SPLIT_PACK_SCALE_DEFAULT = 10_000;

export interface BoundsLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RectLike {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PieceMeta {
  label: string;
  sourceCenter: Point2;
}

export interface GridTileMeta {
  id: string;
  row: number;
  col: number;
  rows: number;
  cols: number;
  rect: RectLike;
}

export interface PieceAssignment {
  pieceLabel: string;
  sourceCenter: Point2;
  sheetIndex: number;
}

function signedArea(points: Point2[]): number {
  if (points.length < 3) {
    return 0;
  }
  let areaTwice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    areaTwice += a.x * b.y - b.x * a.y;
  }
  return areaTwice / 2;
}

function ensureRingOrientation(points: Point2[], ccw: boolean): Point2[] {
  if (points.length < 3) {
    return [...points];
  }
  const area = signedArea(points);
  if ((ccw && area < 0) || (!ccw && area > 0)) {
    return [...points].reverse();
  }
  return [...points];
}

function pointInRing(point: Point2, ring: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || EPSILON) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function ringBounds(points: Point2[]): BoundsLike {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function ringKey(points: Point2[]): string {
  return points.map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`).join(';');
}

function normalizeClosedRingPoints(points: Point2[]): Point2[] {
  if (points.length < 3) {
    return [];
  }
  const deduped: Point2[] = [];
  for (const point of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.x - point.x) > EPSILON || Math.abs(last.y - point.y) > EPSILON) {
      deduped.push({ x: point.x, y: point.y });
    }
  }
  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.abs(first.x - last.x) <= EPSILON && Math.abs(first.y - last.y) <= EPSILON) {
      deduped.pop();
    }
  }
  return deduped.length >= 3 ? deduped : [];
}

export function buildCutPolygonsFromLayerPaths(paths: LayerPath[]): SplitPackPolygonWithHoles[] {
  const cutPaths = paths.filter((path) => path.layer === 'cut' && path.points.length >= 2);
  if (cutPaths.length === 0) {
    return [];
  }

  const vertexEps = 1e-4;
  const vertexKey = (point: Point2): string =>
    `${Math.round(point.x / vertexEps)}:${Math.round(point.y / vertexEps)}`;
  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  interface VertexNode {
    point: Point2;
    neighbors: Set<string>;
  }

  const vertices = new Map<string, VertexNode>();
  const edges = new Map<string, { a: string; b: string }>();

  const ensureVertex = (point: Point2): string => {
    const key = vertexKey(point);
    if (!vertices.has(key)) {
      vertices.set(key, { point: { x: point.x, y: point.y }, neighbors: new Set() });
    }
    return key;
  };

  const addSegment = (a: Point2, b: Point2): void => {
    if (Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON) {
      return;
    }
    const aKey = ensureVertex(a);
    const bKey = ensureVertex(b);
    const eKey = edgeKey(aKey, bKey);
    if (edges.has(eKey)) {
      return;
    }
    edges.set(eKey, { a: aKey, b: bKey });
    vertices.get(aKey)?.neighbors.add(bKey);
    vertices.get(bKey)?.neighbors.add(aKey);
  };

  for (const path of cutPaths) {
    if (path.closed && path.points.length >= 3) {
      const closedPoints = normalizeClosedRingPoints(path.points);
      for (let i = 0; i < closedPoints.length; i += 1) {
        addSegment(closedPoints[i], closedPoints[(i + 1) % closedPoints.length]);
      }
      continue;
    }

    for (let i = 0; i < path.points.length - 1; i += 1) {
      addSegment(path.points[i], path.points[i + 1]);
    }
  }

  if (edges.size === 0) {
    return [];
  }

  for (const vertex of vertices.values()) {
    if (vertex.neighbors.size !== 2) {
      throw new Error('Cut graph is not a simple cycle graph; cannot build closed polygons deterministically');
    }
  }

  const visitedEdges = new Set<string>();
  const rings: Point2[][] = [];
  const sortedEdgeKeys = [...edges.keys()].sort();
  const maxSteps = edges.size + vertices.size + 10;

  for (const startEdgeKey of sortedEdgeKeys) {
    if (visitedEdges.has(startEdgeKey)) {
      continue;
    }
    const startEdge = edges.get(startEdgeKey);
    if (!startEdge) {
      continue;
    }

    const start = startEdge.a;
    let prev = startEdge.a;
    let current = startEdge.b;
    const cycleKeys: string[] = [start];
    visitedEdges.add(startEdgeKey);

    let steps = 0;
    while (steps < maxSteps) {
      steps += 1;
      cycleKeys.push(current);
      if (current === start) {
        break;
      }

      const neighbors = [...(vertices.get(current)?.neighbors ?? [])].sort();
      const options = neighbors.filter((neighbor) => neighbor !== prev);
      if (options.length !== 1) {
        throw new Error('Ambiguous cut graph traversal while reconstructing polygon rings');
      }

      const next = options[0];
      const nextEdgeKey = edgeKey(current, next);
      if (visitedEdges.has(nextEdgeKey) && next !== start) {
        throw new Error('Encountered reused edge while reconstructing cut polygon ring');
      }
      visitedEdges.add(nextEdgeKey);
      prev = current;
      current = next;
    }

    if (current !== start) {
      throw new Error('Failed to close reconstructed cut polygon ring');
    }

    const ringPoints = normalizeClosedRingPoints(
      cycleKeys.slice(0, -1).map((key) => vertices.get(key)?.point ?? { x: 0, y: 0 })
    );
    if (ringPoints.length >= 3 && Math.abs(signedArea(ringPoints)) > EPSILON) {
      rings.push(ringPoints);
    }
  }

  if (rings.length === 0) {
    return [];
  }

  const sortedRings = [...rings].sort((a, b) => {
    const areaDelta = Math.abs(signedArea(b)) - Math.abs(signedArea(a));
    if (Math.abs(areaDelta) > EPSILON) {
      return areaDelta;
    }
    const boundsA = ringBounds(a);
    const boundsB = ringBounds(b);
    if (Math.abs(boundsA.minY - boundsB.minY) > EPSILON) {
      return boundsA.minY - boundsB.minY;
    }
    if (Math.abs(boundsA.minX - boundsB.minX) > EPSILON) {
      return boundsA.minX - boundsB.minX;
    }
    return ringKey(a).localeCompare(ringKey(b));
  });

  interface RingNode {
    ring: Point2[];
    parent: number | null;
    depth: number;
  }

  const nodes: RingNode[] = [];
  for (const ring of sortedRings) {
    let parent: number | null = null;
    for (let i = 0; i < nodes.length; i += 1) {
      if (pointInRing(ring[0], nodes[i].ring)) {
        parent = i;
        break;
      }
    }
    const depth = parent === null ? 0 : nodes[parent].depth + 1;
    nodes.push({ ring, parent, depth });
  }

  const polygons: SplitPackPolygonWithHoles[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.depth % 2 !== 0) {
      continue;
    }
    const holes = nodes
      .filter((candidate) => candidate.parent === i && candidate.depth === node.depth + 1)
      .map((candidate) => ensureRingOrientation(candidate.ring, false));

    polygons.push({
      id: '',
      outer: ensureRingOrientation(node.ring, true),
      holes
    });
  }

  return polygons.sort((a, b) => {
    const areaDelta = Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer));
    if (Math.abs(areaDelta) > EPSILON) {
      return areaDelta;
    }
    const boundsA = ringBounds(a.outer);
    const boundsB = ringBounds(b.outer);
    if (Math.abs(boundsA.minY - boundsB.minY) > EPSILON) {
      return boundsA.minY - boundsB.minY;
    }
    if (Math.abs(boundsA.minX - boundsB.minX) > EPSILON) {
      return boundsA.minX - boundsB.minX;
    }
    return ringKey(a.outer).localeCompare(ringKey(b.outer));
  });
}

function toSplitPackLineFeatures(paths: LayerPath[], layer: 'score' | 'guide'): SplitPackLineFeature[] {
  const selected = paths.filter((path) => path.layer === layer && path.points.length >= 2);
  const features: SplitPackLineFeature[] = [];

  for (let i = 0; i < selected.length; i += 1) {
    const path = selected[i];
    const points = path.closed ? [...path.points, path.points[0]] : [...path.points];
    if (points.length < 2) {
      continue;
    }
    features.push({
      id: `${layer}-${String(i + 1).padStart(4, '0')}`,
      kind: layer,
      path: points
    });
  }

  return features;
}

function boundsCenter(bounds: BoundsLike): Point2 {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function pieceLabelFromIndex(index: number): string {
  let n = Math.max(1, Math.floor(index));
  let label = '';
  while (n > 0) {
    const digit = (n - 1) % 26;
    label = String.fromCharCode(65 + digit) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function buildSplitPackTemplateGeometry(paths: LayerPath[]): {
  template: SplitPackTemplateGeometry;
  pieceMetaById: Map<string, PieceMeta>;
} {
  const cutPolygonsRaw = buildCutPolygonsFromLayerPaths(paths);
  const pieceMetaById = new Map<string, PieceMeta>();

  const cutPolygons = cutPolygonsRaw.map((polygon, index) => {
    const id = `piece-${String(index + 1).padStart(4, '0')}`;
    const bounds = ringBounds(polygon.outer);
    pieceMetaById.set(id, {
      label: pieceLabelFromIndex(index + 1),
      sourceCenter: boundsCenter(bounds)
    });
    return {
      ...polygon,
      id
    };
  });

  return {
    template: {
      cutPolygons,
      scoreLines: toSplitPackLineFeatures(paths, 'score'),
      guideLines: toSplitPackLineFeatures(paths, 'guide')
    },
    pieceMetaById
  };
}

export function splitSheetToLayerPaths(sheet: SplitPackSheet, scale: number): LayerPath[] {
  const paths: LayerPath[] = [];
  const layerOrder: Record<SvgLayer, number> = { cut: 0, score: 1, guide: 2 };

  const pointFromInt = (point: { x: number; y: number }): Point2 => ({
    x: point.x / scale,
    y: point.y / scale
  });

  const placed = [...sheet.placed].sort((a, b) => a.shard.id.localeCompare(b.shard.id));
  for (const placedShard of placed) {
    paths.push({
      layer: 'cut',
      closed: true,
      points: placedShard.drawGeoPlaced.outer.map(pointFromInt)
    });
    for (const hole of placedShard.drawGeoPlaced.holes) {
      paths.push({
        layer: 'cut',
        closed: true,
        points: hole.map(pointFromInt)
      });
    }

    const lines = [...placedShard.linesPlaced].sort((a, b) => a.id.localeCompare(b.id));
    for (const line of lines) {
      paths.push({
        layer: line.kind,
        closed: false,
        points: line.path.map(pointFromInt)
      });
    }
  }

  return paths.sort((a, b) => {
    if (layerOrder[a.layer] !== layerOrder[b.layer]) {
      return layerOrder[a.layer] - layerOrder[b.layer];
    }
    const aKey = ringKey(a.points);
    const bKey = ringKey(b.points);
    return aKey.localeCompare(bKey);
  });
}

export function buildGridTileMeta(bounds: BoundsLike, usableWidth: number, usableHeight: number): GridTileMeta[] {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
  const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));
  const tiles: GridTileMeta[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tileMinX = bounds.minX + col * usableWidth;
      const tileMinY = bounds.minY + row * usableHeight;
      const tileMaxX = Math.min(tileMinX + usableWidth, bounds.maxX);
      const tileMaxY = Math.min(tileMinY + usableHeight, bounds.maxY);
      tiles.push({
        id: `tile-r${String(row + 1).padStart(3, '0')}-c${String(col + 1).padStart(3, '0')}`,
        row: row + 1,
        col: col + 1,
        rows,
        cols,
        rect: {
          minX: tileMinX,
          minY: tileMinY,
          maxX: tileMaxX,
          maxY: tileMaxY
        }
      });
    }
  }

  return tiles;
}

export function rectToIntRect(rect: RectLike, scale: number): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.round(rect.minX * scale),
    top: Math.round(rect.minY * scale),
    right: Math.round(rect.maxX * scale),
    bottom: Math.round(rect.maxY * scale)
  };
}

export function buildGridTilesInt(gridTiles: GridTileMeta[], scale: number): SplitPackGridTile[] {
  return gridTiles.map((tile) => ({
    id: tile.id,
    rect: rectToIntRect(tile.rect, scale)
  }));
}

export function buildSplitPackConfig(options: {
  scale: number;
  materialWidth: number;
  materialHeight: number;
  margin: number;
  dimEps: number;
  areaEps: number;
  spacing: number;
  allowRotation: boolean;
}): SplitPackConfig {
  return {
    SCALE: options.scale,
    AREA_EPS: Math.max(1, Math.round(options.areaEps * options.scale * options.scale)),
    DIM_EPS: Math.max(1, Math.round(options.dimEps * options.scale)),
    spacing: Math.max(0, Math.round(options.spacing * options.scale)),
    fillRule: 'EvenOdd',
    allowedRotations: options.allowRotation ? [0, 90] : [0],
    sheet: {
      width: Math.round(options.materialWidth * options.scale),
      height: Math.round(options.materialHeight * options.scale),
      margins: {
        left: Math.round(options.margin * options.scale),
        top: Math.round(options.margin * options.scale),
        right: Math.round(options.margin * options.scale),
        bottom: Math.round(options.margin * options.scale)
      }
    }
  };
}

export function buildAssignmentsFromPackedSheets(
  sheets: SplitPackSheet[],
  pieceMetaById: Map<string, PieceMeta>
): PieceAssignment[] {
  const byPiece = new Map<string, PieceAssignment>();

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const placed = [...sheet.placed].sort((a, b) => a.shard.id.localeCompare(b.shard.id));
    for (const placedShard of placed) {
      const pieceId = placedShard.shard.sourcePolygonId;
      if (byPiece.has(pieceId)) {
        continue;
      }
      const meta = pieceMetaById.get(pieceId);
      if (!meta) {
        continue;
      }
      byPiece.set(pieceId, {
        pieceLabel: meta.label,
        sourceCenter: meta.sourceCenter,
        sheetIndex: sheetIndex + 1
      });
    }
  }

  return [...byPiece.values()].sort((a, b) => a.pieceLabel.localeCompare(b.pieceLabel));
}
