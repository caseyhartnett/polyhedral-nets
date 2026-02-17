import type {
  Path,
  PathInt,
  Point,
  PointInt,
  PolygonWithHolesInt,
  RectInt,
  Rotation
} from "./types.js";

const EPS = 1e-9;

export function rectWidth(rect: RectInt): number {
  return rect.right - rect.left;
}

export function rectHeight(rect: RectInt): number {
  return rect.bottom - rect.top;
}

export function rectContainsRect(outer: RectInt, inner: RectInt): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}

export function rectIntersects(a: RectInt, b: RectInt): boolean {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export function rectToPath(rect: RectInt): PathInt {
  return [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom }
  ];
}

export function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

export function pointEquals(a: Point | PointInt, b: Point | PointInt): boolean {
  return almostEqual(a.x, b.x) && almostEqual(a.y, b.y);
}

export function normalizeRingInt(path: PathInt): PathInt {
  const deduped: PathInt = [];
  for (const point of path) {
    if (deduped.length === 0 || !pointEquals(deduped[deduped.length - 1], point)) {
      deduped.push({ x: Math.trunc(point.x), y: Math.trunc(point.y) });
    }
  }
  if (deduped.length > 1 && pointEquals(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }
  return deduped;
}

export function signedArea(path: Path | PathInt): number {
  if (path.length < 3) {
    return 0;
  }
  let acc = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    acc += a.x * b.y - b.x * a.y;
  }
  return acc / 2;
}

export function ensureRingOrientationInt(path: PathInt, ccw: boolean): PathInt {
  const normalized = normalizeRingInt(path);
  const area = signedArea(normalized);
  if (normalized.length < 3) {
    return normalized;
  }
  if ((ccw && area < 0) || (!ccw && area > 0)) {
    return [...normalized].reverse();
  }
  return normalized;
}

function rotateStartToLexicographicMin(path: PathInt): PathInt {
  if (path.length === 0) {
    return [];
  }
  let start = 0;
  for (let i = 1; i < path.length; i += 1) {
    const p = path[i];
    const s = path[start];
    if (p.x < s.x || (p.x === s.x && p.y < s.y)) {
      start = i;
    }
  }
  return [...path.slice(start), ...path.slice(0, start)];
}

export function canonicalizeRingInt(path: PathInt, ccw: boolean): PathInt {
  return rotateStartToLexicographicMin(ensureRingOrientationInt(path, ccw));
}

export function bboxOfPath(path: Path | PathInt): RectInt {
  if (path.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  let left = path[0].x;
  let top = path[0].y;
  let right = path[0].x;
  let bottom = path[0].y;
  for (const point of path) {
    if (point.x < left) {
      left = point.x;
    }
    if (point.y < top) {
      top = point.y;
    }
    if (point.x > right) {
      right = point.x;
    }
    if (point.y > bottom) {
      bottom = point.y;
    }
  }
  return {
    left: Math.trunc(left),
    top: Math.trunc(top),
    right: Math.trunc(right),
    bottom: Math.trunc(bottom)
  };
}

export function bboxOfPolygonInt(poly: PolygonWithHolesInt): RectInt {
  const allPoints = [poly.outer, ...poly.holes].flat();
  return bboxOfPath(allPoints);
}

export function translatePathInt(path: PathInt, dx: number, dy: number): PathInt {
  return path.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

export function translatePolygonInt(poly: PolygonWithHolesInt, dx: number, dy: number): PolygonWithHolesInt {
  return {
    ...poly,
    outer: translatePathInt(poly.outer, dx, dy),
    holes: poly.holes.map((hole) => translatePathInt(hole, dx, dy))
  };
}

export function translateRect(rect: RectInt, dx: number, dy: number): RectInt {
  return {
    left: rect.left + dx,
    top: rect.top + dy,
    right: rect.right + dx,
    bottom: rect.bottom + dy
  };
}

export function centroidOfPathInt(path: PathInt): PointInt {
  if (path.length < 3) {
    const box = bboxOfPath(path);
    return { x: Math.trunc((box.left + box.right) / 2), y: Math.trunc((box.top + box.bottom) / 2) };
  }
  let crossSum = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < path.length; i += 1) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const cross = a.x * b.y - b.x * a.y;
    crossSum += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (almostEqual(crossSum, 0)) {
    const box = bboxOfPath(path);
    return { x: Math.trunc((box.left + box.right) / 2), y: Math.trunc((box.top + box.bottom) / 2) };
  }
  return {
    x: Math.trunc(cx / (3 * crossSum)),
    y: Math.trunc(cy / (3 * crossSum))
  };
}

function rotatePointInBox(point: PointInt, width: number, height: number, rotation: Rotation): PointInt {
  switch (rotation) {
    case 0:
      return { x: point.x, y: point.y };
    case 90:
      return { x: height - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: width - point.x };
    default:
      return { x: point.x, y: point.y };
  }
}

export function rotatedDims(width: number, height: number, rotation: Rotation): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

export function rotatePathInBox(path: PathInt, width: number, height: number, rotation: Rotation): PathInt {
  return path.map((point) => rotatePointInBox(point, width, height, rotation));
}

export function rotatePolygonInBox(
  poly: PolygonWithHolesInt,
  width: number,
  height: number,
  rotation: Rotation
): PolygonWithHolesInt {
  return {
    ...poly,
    outer: rotatePathInBox(poly.outer, width, height, rotation),
    holes: poly.holes.map((hole) => rotatePathInBox(hole, width, height, rotation))
  };
}

export function pathKey(path: PathInt): string {
  return path.map((point) => `${point.x},${point.y}`).join(";");
}

export function polygonKey(poly: PolygonWithHolesInt): string {
  const holeKeys = [...poly.holes].map(pathKey).sort();
  return `${pathKey(poly.outer)}|${holeKeys.join("|")}`;
}

export function distanceSquared(a: PointInt, b: PointInt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function midpoint(a: PointInt, b: PointInt): PointInt {
  return { x: Math.trunc((a.x + b.x) / 2), y: Math.trunc((a.y + b.y) / 2) };
}

export function pointToSegmentDistanceSquared(point: PointInt, a: PointInt, b: PointInt): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom === 0) {
    return distanceSquared(point, a);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  const dx = point.x - proj.x;
  const dy = point.y - proj.y;
  return dx * dx + dy * dy;
}

export function ringEdges(path: PathInt): Array<[PointInt, PointInt]> {
  const edges: Array<[PointInt, PointInt]> = [];
  for (let i = 0; i < path.length; i += 1) {
    edges.push([path[i], path[(i + 1) % path.length]]);
  }
  return edges;
}

export function sortByKey<T>(values: T[], key: (value: T) => string): T[] {
  return [...values].sort((a, b) => key(a).localeCompare(key(b)));
}

export function roundInt(value: number): number {
  return Math.round(value);
}
