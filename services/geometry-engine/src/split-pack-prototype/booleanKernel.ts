import {
  ClipType,
  Clipper64,
  EndType,
  FillRule,
  JoinType,
  PathType,
  PolyTree64,
  PointInPolygonResult,
  area as clipperArea,
  getBoundsPaths,
  inflatePaths,
  intersect as clipperIntersect,
  pointInPolygon as clipperPointInPolygon,
  union as clipperUnion
} from "@countertype/clipper2-ts";

import {
  bboxOfPath,
  canonicalizeRingInt,
  normalizeRingInt,
  pathKey,
  rectHeight,
  rectWidth,
  signedArea
} from "./geometryUtils.js";
import type { PathInt, PointInt, PolygonWithHolesInt, RectInt } from "./types.js";

export const DEFAULT_FILL_RULE: "EvenOdd" | "NonZero" = "EvenOdd";

function toFillRule(fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE): FillRule {
  return fillRuleName === "NonZero" ? FillRule.NonZero : FillRule.EvenOdd;
}

function toClipperPath(path: PathInt): PathInt {
  return path.map((point) => ({ x: Math.trunc(point.x), y: Math.trunc(point.y) }));
}

function sanitizePath(path: PathInt): PathInt {
  const normalized = normalizeRingInt(path);
  if (normalized.length < 3) {
    return [];
  }
  if (Math.abs(signedArea(normalized)) === 0) {
    return [];
  }
  return normalized;
}

function sortPathsDeterministic(paths: PathInt[]): PathInt[] {
  return [...paths].sort((a, b) => {
    const areaDelta = Math.abs(signedArea(b)) - Math.abs(signedArea(a));
    if (areaDelta !== 0) {
      return areaDelta;
    }
    const boxA = bboxOfPath(a);
    const boxB = bboxOfPath(b);
    if (boxA.top !== boxB.top) {
      return boxA.top - boxB.top;
    }
    if (boxA.left !== boxB.left) {
      return boxA.left - boxB.left;
    }
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return pathKey(a).localeCompare(pathKey(b));
  });
}

function sanitizeAndSortPaths(paths: PathInt[]): PathInt[] {
  return sortPathsDeterministic(
    paths
      .map((path) => sanitizePath(path))
      .filter((path) => path.length >= 3)
      .map((path) => {
        const forwardKey = pathKey(canonicalizeRingInt(path, true));
        const reverseKey = pathKey(canonicalizeRingInt(path, false));
        return forwardKey < reverseKey ? canonicalizeRingInt(path, true) : canonicalizeRingInt(path, false);
      })
  );
}

interface PolyNodeLike {
  count: number;
  child: (index: number) => PolyNodeLike;
  poly?: PathInt | null;
  isHole?: boolean;
}

function collectChildren(node: PolyNodeLike): PolyNodeLike[] {
  const children: PolyNodeLike[] = [];
  for (let i = 0; i < node.count; i += 1) {
    children.push(node.child(i));
  }
  return children;
}

function polygonArea(poly: PolygonWithHolesInt): number {
  const outerArea = Math.abs(signedArea(poly.outer));
  const holeArea = poly.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
  return outerArea - holeArea;
}

function sortPolygonsDeterministic(polygons: PolygonWithHolesInt[]): PolygonWithHolesInt[] {
  return [...polygons].sort((a, b) => {
    const areaDelta = polygonArea(b) - polygonArea(a);
    if (areaDelta !== 0) {
      return areaDelta;
    }
    const boxA = bboxOfPath(a.outer);
    const boxB = bboxOfPath(b.outer);
    if (boxA.top !== boxB.top) {
      return boxA.top - boxB.top;
    }
    if (boxA.left !== boxB.left) {
      return boxA.left - boxB.left;
    }
    return pathKey(a.outer).localeCompare(pathKey(b.outer));
  });
}

function isValidPolygon(poly: PolygonWithHolesInt): boolean {
  if (poly.outer.length < 3 || polygonArea(poly) <= 0) {
    return false;
  }
  const box = bboxOfPath(poly.outer);
  return rectWidth(box) > 0 && rectHeight(box) > 0;
}

export function polygonToPaths(polygon: PolygonWithHolesInt): PathInt[] {
  return [polygon.outer, ...polygon.holes];
}

export function polygonsToPaths(polygons: PolygonWithHolesInt[]): PathInt[] {
  return polygons.flatMap(polygonToPaths);
}

export function intersect(
  subject: PathInt[],
  clip: PathInt[],
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): PathInt[] {
  const solution = clipperIntersect(
    subject.map(toClipperPath),
    clip.map(toClipperPath),
    toFillRule(fillRuleName)
  );
  return sanitizeAndSortPaths(solution.map((path) => path.map((point) => ({ x: point.x, y: point.y }))));
}

export function unionAll(
  pathSets: PathInt[][],
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): PathInt[] {
  const merged = pathSets.flat();
  if (merged.length === 0) {
    return [];
  }
  const solution = clipperUnion(
    merged.map(toClipperPath),
    toFillRule(fillRuleName)
  );
  return sanitizeAndSortPaths(solution.map((path) => path.map((point) => ({ x: point.x, y: point.y }))));
}

export function offset(paths: PathInt[], delta: number): PathInt[] {
  if (paths.length === 0 || delta === 0) {
    return sanitizeAndSortPaths(paths);
  }
  const solution = inflatePaths(
    paths.map(toClipperPath),
    delta,
    JoinType.Round,
    EndType.Polygon
  );
  return sanitizeAndSortPaths(solution.map((path) => path.map((point) => ({ x: point.x, y: point.y }))));
}

export function area(path: PathInt): number {
  return Math.abs(clipperArea(toClipperPath(path)));
}

export function bbox(path: PathInt): RectInt {
  if (path.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  const bounds = getBoundsPaths([toClipperPath(path)]);
  return {
    left: Math.trunc(bounds.left),
    top: Math.trunc(bounds.top),
    right: Math.trunc(bounds.right),
    bottom: Math.trunc(bounds.bottom)
  };
}

export function pointInRing(point: PointInt, ring: PathInt): boolean {
  const result = clipperPointInPolygon({ x: point.x, y: point.y }, toClipperPath(ring));
  return result !== PointInPolygonResult.IsOutside;
}

export function pointInPolygonWithHoles(point: PointInt, polygon: PolygonWithHolesInt): boolean {
  if (!pointInRing(point, polygon.outer)) {
    return false;
  }
  for (const hole of polygon.holes) {
    if (pointInRing(point, hole)) {
      return false;
    }
  }
  return true;
}

function polygonsFromPolyTree(tree: PolyNodeLike): PolygonWithHolesInt[] {
  const polygons: PolygonWithHolesInt[] = [];

  const walk = (node: PolyNodeLike): void => {
    for (const child of collectChildren(node)) {
      const poly = child.poly ? sanitizePath(child.poly) : [];
      if (!child.isHole && poly.length >= 3) {
        const holes = collectChildren(child)
          .filter((holeNode) => holeNode.isHole && holeNode.poly)
          .map((holeNode) => sanitizePath(holeNode.poly ?? []))
          .filter((holePath) => holePath.length >= 3)
          .map((holePath) => canonicalizeRingInt(holePath, false))
          .sort((a, b) => pathKey(a).localeCompare(pathKey(b)));

        polygons.push({
          id: "",
          outer: canonicalizeRingInt(poly, true),
          holes
        });
      }
      walk(child);
    }
  };

  walk(tree);

  return sortPolygonsDeterministic(polygons.filter((polygon) => isValidPolygon(polygon)));
}

export function intersectionPolygons(
  subject: PathInt[],
  clip: PathInt[],
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): PolygonWithHolesInt[] {
  const clipper = new Clipper64();
  clipper.addPaths(subject.map(toClipperPath), PathType.Subject, false);
  clipper.addPaths(clip.map(toClipperPath), PathType.Clip, false);

  const tree = new PolyTree64();
  const succeeded = clipper.execute(ClipType.Intersection, toFillRule(fillRuleName), tree);
  if (!succeeded) {
    throw new Error("Clipper intersection failed");
  }

  return polygonsFromPolyTree(tree).map((polygon, index) => ({
    ...polygon,
    id: `poly-${index}`
  }));
}

export function unionPolygons(
  paths: PathInt[],
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): PolygonWithHolesInt[] {
  if (paths.length === 0) {
    return [];
  }
  const clipper = new Clipper64();
  clipper.addPaths(paths.map(toClipperPath), PathType.Subject, false);

  const tree = new PolyTree64();
  const succeeded = clipper.execute(ClipType.Union, toFillRule(fillRuleName), tree);
  if (!succeeded) {
    throw new Error("Clipper union failed");
  }

  return polygonsFromPolyTree(tree).map((polygon, index) => ({
    ...polygon,
    id: `union-${index}`
  }));
}

export function offsetPolygon(
  polygon: PolygonWithHolesInt,
  delta: number,
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): PolygonWithHolesInt[] {
  const inflatedPaths = offset(polygonToPaths(polygon), delta);
  return unionPolygons(inflatedPaths, fillRuleName);
}

export function polygonsOverlap(
  a: PolygonWithHolesInt[],
  b: PolygonWithHolesInt[],
  fillRuleName: "EvenOdd" | "NonZero" = DEFAULT_FILL_RULE
): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const intersections = intersect(polygonsToPaths(a), polygonsToPaths(b), fillRuleName);
  return intersections.some((path) => area(path) > 0);
}
