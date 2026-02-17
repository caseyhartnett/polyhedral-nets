import SVGPathCommander from "svg-path-commander";

import { pointEquals, roundInt, signedArea } from "./geometryUtils.js";
import type {
  LineFeature,
  Path,
  Point,
  PointInt,
  PolygonWithHoles,
  PolygonWithHolesInt,
  TemplateGeometry,
  TemplateGeometryInt
} from "./types.js";

interface ParsedPathTag {
  d: string;
  role: "cut" | "score" | "guide";
  id: string;
}

interface SampledPath {
  path: Path;
  closed: boolean;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null = attrRegex.exec(tag);
  while (match) {
    attrs[match[1]] = match[2];
    match = attrRegex.exec(tag);
  }
  return attrs;
}

function inferRole(attrs: Record<string, string>): "cut" | "score" | "guide" {
  const fromData = attrs["data-role"]?.toLowerCase();
  if (fromData === "score" || fromData === "guide" || fromData === "cut") {
    return fromData;
  }

  const className = attrs.class?.toLowerCase() ?? "";
  if (className.includes("score")) {
    return "score";
  }
  if (className.includes("guide")) {
    return "guide";
  }
  return "cut";
}

function cubicPoint(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const oneMinus = 1 - t;
  const x =
    oneMinus * oneMinus * oneMinus * start.x +
    3 * oneMinus * oneMinus * t * c1.x +
    3 * oneMinus * t * t * c2.x +
    t * t * t * end.x;
  const y =
    oneMinus * oneMinus * oneMinus * start.y +
    3 * oneMinus * oneMinus * t * c1.y +
    3 * oneMinus * t * t * c2.y +
    t * t * t * end.y;
  return { x, y };
}

function isClosedPath(path: Path): boolean {
  if (path.length < 3) {
    return false;
  }
  return pointEquals(path[0], path[path.length - 1]);
}

function stripClosingPoint(path: Path): Path {
  if (path.length > 1 && pointEquals(path[0], path[path.length - 1])) {
    return path.slice(0, -1);
  }
  return path;
}

function pointInRingFloat(point: Point, ring: Path): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const intersects =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function groupRingsToPolygons(rings: Array<{ id: string; ring: Path }>): PolygonWithHoles[] {
  const sorted = [...rings]
    .map((entry) => ({ ...entry, ring: stripClosingPoint(entry.ring) }))
    .filter((entry) => entry.ring.length >= 3)
    .sort((a, b) => Math.abs(signedArea(b.ring)) - Math.abs(signedArea(a.ring)));

  type RingNode = {
    id: string;
    ring: Path;
    parentIndex: number | null;
    depth: number;
  };

  const nodes: RingNode[] = [];
  for (const entry of sorted) {
    let parentIndex: number | null = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const parent = nodes[i];
      if (pointInRingFloat(entry.ring[0], parent.ring)) {
        parentIndex = i;
        break;
      }
    }
    const depth =
      parentIndex === null
        ? 0
        : nodes[parentIndex].depth + 1;

    nodes.push({
      id: entry.id,
      ring: entry.ring,
      parentIndex,
      depth
    });
  }

  const polygons: PolygonWithHoles[] = [];

  nodes.forEach((node, index) => {
    if (node.depth % 2 === 0) {
      const holes = nodes
        .filter((candidate) => candidate.parentIndex === index && candidate.depth === node.depth + 1)
        .map((candidate) => candidate.ring);

      polygons.push({
        id: node.id,
        outer: node.ring,
        holes
      });
    }
  });

  return polygons;
}

export function flattenTransformsIfNeeded(svg: string): string {
  return svg;
}

export function sampleCurvesToPolylines(pathD: string, samplesPerCurve = 10): Path[] {
  const sampled = sampleCurvesToPolylinesWithClosure(pathD, samplesPerCurve);
  return sampled.map((entry) => entry.path);
}

function sampleCurvesToPolylinesWithClosure(pathD: string, samplesPerCurve = 10): SampledPath[] {
  const commander = new SVGPathCommander(pathD, { round: "off" });
  commander.normalize().toCurve().toAbsolute();

  const segments = commander.segments as Array<[string, ...number[]]>;
  const sampled: SampledPath[] = [];

  let current: Path = [];
  let currentPoint: Point = { x: 0, y: 0 };
  let startPoint: Point | null = null;
  let closed = false;

  const flush = (): void => {
    if (current.length > 1) {
      sampled.push({ path: [...current], closed });
    }
    current = [];
    closed = false;
    startPoint = null;
  };

  for (const segment of segments) {
    const cmd = segment[0].toUpperCase();

    if (cmd === "M") {
      flush();
      const x = segment[1];
      const y = segment[2];
      currentPoint = { x, y };
      startPoint = { x, y };
      current.push({ x, y });
      continue;
    }

    if (cmd === "C") {
      const c1 = { x: segment[1], y: segment[2] };
      const c2 = { x: segment[3], y: segment[4] };
      const end = { x: segment[5], y: segment[6] };
      for (let step = 1; step <= samplesPerCurve; step += 1) {
        const t = step / samplesPerCurve;
        current.push(cubicPoint(currentPoint, c1, c2, end, t));
      }
      currentPoint = end;
      continue;
    }

    if (cmd === "L") {
      const x = segment[1];
      const y = segment[2];
      current.push({ x, y });
      currentPoint = { x, y };
      continue;
    }

    if (cmd === "Z" && startPoint) {
      if (!pointEquals(current[current.length - 1], startPoint)) {
        current.push({ ...startPoint });
      }
      closed = true;
      continue;
    }
  }

  flush();
  commander.dispose();

  return sampled;
}

export function normalizeSvgToGeometry(svg: string): TemplateGeometry {
  const flattened = flattenTransformsIfNeeded(svg);
  const pathTagRegex = /<path\b[^>]*>/gi;

  const cutRings: Array<{ id: string; ring: Path }> = [];
  const scoreLines: LineFeature[] = [];
  const guideLines: LineFeature[] = [];

  let match: RegExpExecArray | null = pathTagRegex.exec(flattened);
  let index = 0;

  while (match) {
    const tag = match[0];
    const attrs = parseAttributes(tag);
    const d = attrs.d;
    if (!d) {
      match = pathTagRegex.exec(flattened);
      continue;
    }

    const role = inferRole(attrs);
    const id = attrs.id ?? `path-${index}`;
    const sampled = sampleCurvesToPolylinesWithClosure(d);

    for (let polylineIndex = 0; polylineIndex < sampled.length; polylineIndex += 1) {
      const entry = sampled[polylineIndex];
      const lineId = `${id}-${polylineIndex}`;

      if (role === "cut" && (entry.closed || isClosedPath(entry.path))) {
        cutRings.push({
          id: lineId,
          ring: entry.path
        });
      } else if (role === "score") {
        scoreLines.push({ id: lineId, kind: "score", path: entry.path });
      } else if (role === "guide") {
        guideLines.push({ id: lineId, kind: "guide", path: entry.path });
      }
    }

    index += 1;
    match = pathTagRegex.exec(flattened);
  }

  return {
    cutPolygons: groupRingsToPolygons(cutRings),
    scoreLines,
    guideLines
  };
}

function scalePathToInt(path: Path, SCALE: number): PointInt[] {
  return path.map((point) => ({
    x: roundInt(point.x * SCALE),
    y: roundInt(point.y * SCALE)
  }));
}

function scalePolygonToInt(polygon: PolygonWithHoles, SCALE: number): PolygonWithHolesInt {
  return {
    id: polygon.id,
    outer: scalePathToInt(polygon.outer, SCALE),
    holes: polygon.holes.map((hole) => scalePathToInt(hole, SCALE))
  };
}

export function scaleToInt(geometry: TemplateGeometry, SCALE: number): TemplateGeometryInt {
  return {
    cutPolygons: geometry.cutPolygons.map((polygon) => scalePolygonToInt(polygon, SCALE)),
    scoreLines: geometry.scoreLines.map((line) => ({
      ...line,
      path: scalePathToInt(line.path, SCALE)
    })),
    guideLines: geometry.guideLines.map((line) => ({
      ...line,
      path: scalePathToInt(line.path, SCALE)
    }))
  };
}

export function parseSvgPathTags(svg: string): ParsedPathTag[] {
  const flattened = flattenTransformsIfNeeded(svg);
  const pathTagRegex = /<path\b[^>]*>/gi;
  const tags: ParsedPathTag[] = [];

  let match: RegExpExecArray | null = pathTagRegex.exec(flattened);
  let index = 0;

  while (match) {
    const attrs = parseAttributes(match[0]);
    if (attrs.d) {
      tags.push({
        d: attrs.d,
        role: inferRole(attrs),
        id: attrs.id ?? `path-${index}`
      });
    }
    match = pathTagRegex.exec(flattened);
    index += 1;
  }

  return tags;
}
