import {
  buildCanonicalGeometry,
  renderTemplatePdf,
  renderTemplateStl,
  renderTemplateSvg
} from '@torrify/geometry-engine';
import type {
  CanonicalGeometry,
  ExportFormat,
  LayerPath,
  Point2,
  ShapeDefinition,
  SvgLayer,
  Units
} from '@torrify/shared-types';

const MM_PER_INCH = 25.4;
const EPSILON = 1e-9;

export type MaterialSizePreset =
  | 'none'
  | 'printer-letter'
  | 'printer-a4'
  | 'cricut-mat-12x12'
  | 'cricut-mat-12x24'
  | 'cricut-smart-13x24'
  | 'custom';

export type SplitJoinStyle = 'tabs' | 'tape';

export interface MaterialSizePresetOption {
  value: MaterialSizePreset;
  label: string;
  width?: number;
  height?: number;
  units?: Units;
}

export const MATERIAL_SIZE_PRESET_OPTIONS: MaterialSizePresetOption[] = [
  { value: 'none', label: 'No size constraint (raw SVG)' },
  { value: 'printer-letter', label: 'Printer Letter 8.5x11 in', width: 8.5, height: 11, units: 'in' },
  { value: 'printer-a4', label: 'Printer A4 210x297 mm', width: 210, height: 297, units: 'mm' },
  { value: 'cricut-mat-12x12', label: 'Cricut mat 12x12 in', width: 12, height: 12, units: 'in' },
  { value: 'cricut-mat-12x24', label: 'Cricut mat 12x24 in', width: 12, height: 24, units: 'in' },
  {
    value: 'cricut-smart-13x24',
    label: 'Cricut smart material 13x24 in chunk',
    width: 13,
    height: 24,
    units: 'in'
  },
  { value: 'custom', label: 'Custom size' }
];

export interface ExportSheetLayoutOptions {
  materialSizePreset: MaterialSizePreset;
  customSize?: {
    width: number;
    height: number;
    units: Units;
  };
  // Legacy split-join controls are ignored; split pages now always use straight cuts.
  joinStyle?: SplitJoinStyle;
  includeAlignmentKeys?: boolean;
}

export interface SvgPerforationOptions {
  enabled: boolean;
  layers?: SvgLayer[];
  cutLength: number;
  gapLength: number;
}

export interface GeneratedSvgPage {
  index: number;
  row: number;
  column: number;
  fileNameSuffix: string;
  label: string;
  content: string;
}

export interface GeneratedArtifacts {
  geometry: CanonicalGeometry;
  artifacts: Partial<Record<ExportFormat, string>>;
  svgPages: GeneratedSvgPage[];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ResolvedMaterialSize {
  width: number;
  height: number;
  label: string;
}

export function filterTemplateLayers(
  geometry: CanonicalGeometry,
  layers: SvgLayer[]
): CanonicalGeometry {
  if (!layers.length) {
    return geometry;
  }

  const allowed = new Set(layers);
  return {
    ...geometry,
    template: {
      ...geometry.template,
      paths: geometry.template.paths.filter((path) => allowed.has(path.layer))
    }
  };
}

function toMillimeters(value: number, units: Units): number {
  return units === 'mm' ? value : value * MM_PER_INCH;
}

function fromMillimeters(value: number, units: Units): number {
  return units === 'mm' ? value : value / MM_PER_INCH;
}

function convertUnits(value: number, from: Units, to: Units): number {
  if (from === to) {
    return value;
  }
  return fromMillimeters(toMillimeters(value, from), to);
}

function buildTemplateBounds(paths: LayerPath[]): Bounds | undefined {
  if (!paths.length) {
    return undefined;
  }

  const allPoints = paths.flatMap((path) => path.points);
  if (!allPoints.length) {
    return undefined;
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function clipSegmentToRect(start: Point2, end: Point2, rect: Rect): [Point2, Point2] | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const p = [-dx, dx, -dy, dy];
  const q = [start.x - rect.minX, rect.maxX - start.x, start.y - rect.minY, rect.maxY - start.y];

  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < 4; i += 1) {
    const pi = p[i];
    const qi = q[i];

    if (Math.abs(pi) <= EPSILON) {
      if (qi < 0) {
        return undefined;
      }
      continue;
    }

    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) {
        return undefined;
      }
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) {
        return undefined;
      }
      t1 = Math.min(t1, t);
    }
  }

  if (t0 > t1) {
    return undefined;
  }

  return [
    { x: start.x + t0 * dx, y: start.y + t0 * dy },
    { x: start.x + t1 * dx, y: start.y + t1 * dy }
  ];
}

function clipPathToRect(path: LayerPath, rect: Rect): LayerPath[] {
  if (path.points.length < 2) {
    return [];
  }

  const segments: LayerPath[] = [];
  const limit = path.closed ? path.points.length : path.points.length - 1;

  for (let i = 0; i < limit; i += 1) {
    const start = path.points[i];
    const end = path.points[(i + 1) % path.points.length];
    const clipped = clipSegmentToRect(start, end, rect);
    if (!clipped) {
      continue;
    }

    segments.push({
      layer: path.layer,
      closed: false,
      points: clipped
    });
  }

  return segments;
}

function translatePaths(paths: LayerPath[], dx: number, dy: number): LayerPath[] {
  return paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({ x: point.x + dx, y: point.y + dy }))
  }));
}

function withLayer(layer: SvgLayer, points: Point2[], closed = false): LayerPath {
  return { layer, points, closed };
}

function pointAlongSegment(start: Point2, end: Point2, t: number): Point2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function perforateSegment(
  start: Point2,
  end: Point2,
  layer: SvgLayer,
  cutLength: number,
  gapLength: number
): LayerPath[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length <= EPSILON) {
    return [];
  }

  const period = cutLength + gapLength;
  if (period <= EPSILON || cutLength >= length - EPSILON) {
    return [withLayer(layer, [start, end], false)];
  }

  const output: LayerPath[] = [];
  let offset = 0;

  while (offset < length - EPSILON) {
    const cutStart = offset;
    const cutEnd = Math.min(length, offset + cutLength);
    if (cutEnd - cutStart > EPSILON) {
      output.push(
        withLayer(
          layer,
          [pointAlongSegment(start, end, cutStart / length), pointAlongSegment(start, end, cutEnd / length)],
          false
        )
      );
    }
    offset += period;
  }

  return output.length > 0 ? output : [withLayer(layer, [start, end], false)];
}

function perforatePath(path: LayerPath, cutLength: number, gapLength: number): LayerPath[] {
  if (path.points.length < 2) {
    return [];
  }

  const output: LayerPath[] = [];
  const limit = path.closed ? path.points.length : path.points.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const start = path.points[i];
    const end = path.points[(i + 1) % path.points.length];
    output.push(...perforateSegment(start, end, path.layer, cutLength, gapLength));
  }

  return output;
}

function applySvgPerforation(
  geometry: CanonicalGeometry,
  options: SvgPerforationOptions | undefined
): CanonicalGeometry {
  if (!options?.enabled) {
    return geometry;
  }

  const layers = new Set(options.layers && options.layers.length > 0 ? options.layers : ['score']);
  const cutLength = Math.max(options.cutLength, EPSILON);
  const gapLength = Math.max(options.gapLength, EPSILON);

  return {
    ...geometry,
    template: {
      ...geometry.template,
      paths: geometry.template.paths.flatMap((path) =>
        layers.has(path.layer) ? perforatePath(path, cutLength, gapLength) : [path]
      )
    }
  };
}

function addSplitClosureCutLines(
  paths: LayerPath[],
  ctx: {
    margin: number;
    tileWidth: number;
    tileHeight: number;
    row: number;
    col: number;
    rows: number;
    cols: number;
  }
): LayerPath[] {
  const output = [...paths];
  const cutPaths = paths.filter((path) => path.layer === 'cut');
  if (!cutPaths.length) {
    return output;
  }

  const top = ctx.margin;
  const bottom = ctx.margin + ctx.tileHeight;
  const left = ctx.margin;
  const right = ctx.margin + ctx.tileWidth;
  const tileWidth = ctx.tileWidth;
  const tileHeight = ctx.tileHeight;
  const perimeter = 2 * (tileWidth + tileHeight);
  const boundaryEps = 1e-6;
  const vertexEps = 1e-4;
  if (perimeter <= boundaryEps) {
    return output;
  }

  type Side = 'left' | 'right' | 'top' | 'bottom';
  interface BoundaryPoint {
    key: string;
    t: number;
    point: Point2;
  }

  const allowedSides = new Set<Side>();
  if (ctx.col > 0) allowedSides.add('left');
  if (ctx.col < ctx.cols - 1) allowedSides.add('right');
  if (ctx.row > 0) allowedSides.add('top');
  if (ctx.row < ctx.rows - 1) allowedSides.add('bottom');
  if (allowedSides.size === 0) {
    return output;
  }

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

  const pointDistance = (a: Point2, b: Point2): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const normalizePerimeterT = (value: number): number => {
    let t = value % perimeter;
    if (t < 0) {
      t += perimeter;
    }
    if (t >= perimeter - boundaryEps || Math.abs(t) <= boundaryEps) {
      t = 0;
    }
    return t;
  };

  interface SideInterval {
    side: Side;
    start: number;
    end: number;
  }
  const sideIntervals: SideInterval[] = [
    { side: 'top', start: 0, end: tileWidth },
    { side: 'right', start: tileWidth, end: tileWidth + tileHeight },
    {
      side: 'bottom',
      start: tileWidth + tileHeight,
      end: tileWidth * 2 + tileHeight
    },
    {
      side: 'left',
      start: tileWidth * 2 + tileHeight,
      end: perimeter
    }
  ];

  const rangeOverlaps = (
    startA: number,
    endA: number,
    startB: number,
    endB: number
  ): boolean => Math.min(endA, endB) - Math.max(startA, startB) > boundaryEps;

  const rangeIncludesDisallowedSide = (start: number, end: number): boolean => {
    if (end <= start + boundaryEps) {
      return false;
    }

    for (const interval of sideIntervals) {
      if (allowedSides.has(interval.side)) {
        continue;
      }

      const minShift = Math.floor(start / perimeter) - 1;
      const maxShift = Math.floor(end / perimeter) + 1;
      for (let shift = minShift; shift <= maxShift; shift += 1) {
        const shiftedStart = interval.start + shift * perimeter;
        const shiftedEnd = interval.end + shift * perimeter;
        if (rangeOverlaps(start, end, shiftedStart, shiftedEnd)) {
          return true;
        }
      }
    }

    return false;
  };

  const pointAtPerimeterT = (rawT: number): Point2 => {
    const t = normalizePerimeterT(rawT);
    if (t <= tileWidth + boundaryEps) {
      return { x: left + clamp(t, 0, tileWidth), y: top };
    }
    if (t <= tileWidth + tileHeight + boundaryEps) {
      return { x: right, y: top + clamp(t - tileWidth, 0, tileHeight) };
    }
    if (t <= tileWidth * 2 + tileHeight + boundaryEps) {
      return {
        x: right - clamp(t - (tileWidth + tileHeight), 0, tileWidth),
        y: bottom
      };
    }
    return {
      x: left,
      y: bottom - clamp(t - (tileWidth * 2 + tileHeight), 0, tileHeight)
    };
  };

  const boundarySideForSegment = (a: Point2, b: Point2): Side | undefined => {
    if (Math.abs(a.y - top) <= boundaryEps && Math.abs(b.y - top) <= boundaryEps) {
      return 'top';
    }
    if (Math.abs(a.x - right) <= boundaryEps && Math.abs(b.x - right) <= boundaryEps) {
      return 'right';
    }
    if (Math.abs(a.y - bottom) <= boundaryEps && Math.abs(b.y - bottom) <= boundaryEps) {
      return 'bottom';
    }
    if (Math.abs(a.x - left) <= boundaryEps && Math.abs(b.x - left) <= boundaryEps) {
      return 'left';
    }
    return undefined;
  };

  const isFullBoundarySegment = (a: Point2, b: Point2): boolean => {
    const spansFullVertical =
      ((Math.abs(a.x - left) <= boundaryEps && Math.abs(b.x - left) <= boundaryEps) ||
        (Math.abs(a.x - right) <= boundaryEps && Math.abs(b.x - right) <= boundaryEps)) &&
      ((Math.abs(a.y - top) <= boundaryEps && Math.abs(b.y - bottom) <= boundaryEps) ||
        (Math.abs(a.y - bottom) <= boundaryEps && Math.abs(b.y - top) <= boundaryEps));

    const spansFullHorizontal =
      ((Math.abs(a.y - top) <= boundaryEps && Math.abs(b.y - top) <= boundaryEps) ||
        (Math.abs(a.y - bottom) <= boundaryEps && Math.abs(b.y - bottom) <= boundaryEps)) &&
      ((Math.abs(a.x - left) <= boundaryEps && Math.abs(b.x - right) <= boundaryEps) ||
        (Math.abs(a.x - right) <= boundaryEps && Math.abs(b.x - left) <= boundaryEps));

    return spansFullVertical || spansFullHorizontal;
  };

  const appendUniquePoint = (list: Point2[], point: Point2): void => {
    const last = list[list.length - 1];
    if (last && pointDistance(last, point) <= boundaryEps) {
      return;
    }
    list.push(point);
  };

  const pathLength = (points: Point2[]): number => {
    if (points.length < 2) {
      return 0;
    }
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += pointDistance(points[i - 1], points[i]);
    }
    return total;
  };

  const traceClockwiseBoundaryPath = (
    startPoint: BoundaryPoint,
    endPoint: BoundaryPoint
  ): Point2[] | undefined => {
    const path: Point2[] = [];
    appendUniquePoint(path, startPoint.point);

    const startT = startPoint.t;
    let endT = endPoint.t;
    if (endT <= startT + boundaryEps) {
      endT += perimeter;
    }

    const cornerTs = [
      tileWidth,
      tileWidth + tileHeight,
      tileWidth * 2 + tileHeight,
      perimeter
    ];
    for (const cornerBase of cornerTs) {
      let cornerT = cornerBase;
      if (cornerT <= startT + boundaryEps) {
        cornerT += perimeter;
      }
      if (cornerT > startT + boundaryEps && cornerT < endT - boundaryEps) {
        appendUniquePoint(path, pointAtPerimeterT(cornerT));
      }
    }

    appendUniquePoint(path, endPoint.point);
    if (path.length < 2) {
      return undefined;
    }

    for (let i = 1; i < path.length; i += 1) {
      if (pointDistance(path[i - 1], path[i]) <= boundaryEps) {
        continue;
      }
      const side = boundarySideForSegment(path[i - 1], path[i]);
      if (!side || !allowedSides.has(side) || isFullBoundarySegment(path[i - 1], path[i])) {
        return undefined;
      }
    }

    return path;
  };

  const traceBoundaryPath = (a: BoundaryPoint, b: BoundaryPoint): Point2[] | undefined => {
    const clockwise = traceClockwiseBoundaryPath(a, b);
    const counterClockwiseSeed = traceClockwiseBoundaryPath(b, a);
    const counterClockwise = counterClockwiseSeed ? [...counterClockwiseSeed].reverse() : undefined;

    if (!clockwise) {
      return counterClockwise;
    }
    if (!counterClockwise) {
      return clockwise;
    }
    return pathLength(clockwise) <= pathLength(counterClockwise) ? clockwise : counterClockwise;
  };

  const classifyBoundaryPoint = (point: Point2, key: string): BoundaryPoint | undefined => {
    const onLeft = Math.abs(point.x - left) <= boundaryEps;
    const onRight = Math.abs(point.x - right) <= boundaryEps;
    const onTop = Math.abs(point.y - top) <= boundaryEps;
    const onBottom = Math.abs(point.y - bottom) <= boundaryEps;

    if (onTop && allowedSides.has('top')) {
      return {
        key,
        t: normalizePerimeterT(clamp(point.x - left, 0, tileWidth)),
        point
      };
    }
    if (onRight && allowedSides.has('right')) {
      return {
        key,
        t: normalizePerimeterT(tileWidth + clamp(point.y - top, 0, tileHeight)),
        point
      };
    }
    if (onBottom && allowedSides.has('bottom')) {
      return {
        key,
        t: normalizePerimeterT(
          tileWidth + tileHeight + clamp(right - point.x, 0, tileWidth)
        ),
        point
      };
    }
    if (onLeft && allowedSides.has('left')) {
      return {
        key,
        t: normalizePerimeterT(
          tileWidth * 2 + tileHeight + clamp(bottom - point.y, 0, tileHeight)
        ),
        point
      };
    }

    return undefined;
  };

  interface VertexRecord {
    point: Point2;
    degree: number;
    neighbors: Set<string>;
  }

  const vertexKey = (point: Point2): string =>
    `${Math.round(point.x / vertexEps)}:${Math.round(point.y / vertexEps)}`;

  const vertexMap = new Map<string, VertexRecord>();
  const ensureVertex = (point: Point2): string => {
    const key = vertexKey(point);
    const existing = vertexMap.get(key);
    if (!existing) {
      vertexMap.set(key, { point: { ...point }, degree: 0, neighbors: new Set() });
    }
    return key;
  };

  for (const path of cutPaths) {
    if (path.points.length < 2) {
      continue;
    }

    const limit = path.closed ? path.points.length : path.points.length - 1;
    for (let i = 0; i < limit; i += 1) {
      const start = path.points[i];
      const end = path.points[(i + 1) % path.points.length];
      const startKey = ensureVertex(start);
      const endKey = ensureVertex(end);
      const startVertex = vertexMap.get(startKey)!;
      const endVertex = vertexMap.get(endKey)!;
      startVertex.degree += 1;
      endVertex.degree += 1;
      startVertex.neighbors.add(endKey);
      endVertex.neighbors.add(startKey);
    }
  }

  const pushClosureSegment = (a: Point2, b: Point2): void => {
    const length = pointDistance(a, b);
    if (length <= boundaryEps) {
      return;
    }
    output.push(withLayer('cut', [a, b], false));
  };

  const boundaryPoints: BoundaryPoint[] = [];
  for (const [key, vertex] of vertexMap) {
    if (vertex.degree % 2 === 0) {
      continue;
    }
    const boundary = classifyBoundaryPoint(vertex.point, key);
    if (!boundary) {
      continue;
    }
    boundaryPoints.push(boundary);
  }

  if (boundaryPoints.length < 2) {
    return output;
  }

  interface ResolvedPair {
    path: Point2[];
    length: number;
  }

  interface PairingCandidate {
    pairs: ResolvedPair[];
    pairCount: number;
    totalLength: number;
  }

  const evaluatePairing = (pairs: Array<[BoundaryPoint, BoundaryPoint]>): PairingCandidate | undefined => {
    const resolvedPairs: ResolvedPair[] = [];
    let totalLength = 0;
    for (const [a, b] of pairs) {
      const boundaryPath = traceBoundaryPath(a, b);
      if (!boundaryPath) {
        return undefined;
      }
      const length = pathLength(boundaryPath);
      resolvedPairs.push({ path: boundaryPath, length });
      totalLength += length;
    }

    return {
      pairs: resolvedPairs,
      pairCount: resolvedPairs.length,
      totalLength
    };
  };

  const chooseBestPairing = (
    candidates: Array<PairingCandidate | undefined>
  ): PairingCandidate | undefined => {
    let best: PairingCandidate | undefined;
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      if (!best || candidate.pairCount > best.pairCount) {
        best = candidate;
        continue;
      }
      if (
        candidate.pairCount === best.pairCount &&
        candidate.totalLength < best.totalLength - boundaryEps
      ) {
        best = candidate;
      }
    }
    return best;
  };

  const pairLinearPoints = (ordered: BoundaryPoint[]): PairingCandidate | undefined => {
    if (ordered.length < 2) {
      return undefined;
    }

    const pairsFromOffset = (offset: number): Array<[BoundaryPoint, BoundaryPoint]> => {
      const pairs: Array<[BoundaryPoint, BoundaryPoint]> = [];
      for (let i = offset; i + 1 < ordered.length; i += 2) {
        pairs.push([ordered[i], ordered[i + 1]]);
      }
      return pairs;
    };

    return chooseBestPairing([
      evaluatePairing(pairsFromOffset(0)),
      evaluatePairing(pairsFromOffset(1))
    ]);
  };

  const pairCircularPoints = (ordered: BoundaryPoint[]): PairingCandidate | undefined => {
    if (ordered.length < 2) {
      return undefined;
    }

    const optionA: Array<[BoundaryPoint, BoundaryPoint]> = [];
    for (let i = 0; i + 1 < ordered.length; i += 2) {
      optionA.push([ordered[i], ordered[i + 1]]);
    }

    const optionB: Array<[BoundaryPoint, BoundaryPoint]> = [];
    for (let i = 1; i + 1 < ordered.length; i += 2) {
      optionB.push([ordered[i], ordered[i + 1]]);
    }
    if (ordered.length % 2 === 0 && ordered.length > 1) {
      optionB.push([ordered[ordered.length - 1], ordered[0]]);
    }

    return chooseBestPairing([evaluatePairing(optionA), evaluatePairing(optionB)]);
  };

  const sorted = [...boundaryPoints].sort((a, b) => a.t - b.t);
  const disallowedGapIndexes: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    let endT = next.t;
    if (endT <= current.t + boundaryEps) {
      endT += perimeter;
    }
    if (rangeIncludesDisallowedSide(current.t, endT)) {
      disallowedGapIndexes.push(i);
    }
  }

  const resolved: ResolvedPair[] = [];

  if (disallowedGapIndexes.length === 0) {
    const candidate = pairCircularPoints(sorted);
    if (candidate) {
      resolved.push(...candidate.pairs);
    }
  } else {
    const splitAfter = disallowedGapIndexes[0];
    const rotated: Array<{ point: BoundaryPoint; t: number }> = [];
    for (let offset = 0; offset < sorted.length; offset += 1) {
      const index = (splitAfter + 1 + offset) % sorted.length;
      const wrapped = index <= splitAfter ? perimeter : 0;
      rotated.push({
        point: sorted[index],
        t: sorted[index].t + wrapped
      });
    }

    const groups: BoundaryPoint[][] = [];
    let currentGroup: BoundaryPoint[] = [rotated[0].point];
    for (let i = 1; i < rotated.length; i += 1) {
      const prev = rotated[i - 1];
      const next = rotated[i];
      if (rangeIncludesDisallowedSide(prev.t, next.t)) {
        groups.push(currentGroup);
        currentGroup = [next.point];
      } else {
        currentGroup.push(next.point);
      }
    }
    groups.push(currentGroup);

    for (const group of groups) {
      const candidate = pairLinearPoints(group);
      if (!candidate) {
        continue;
      }
      resolved.push(...candidate.pairs);
    }
  }

  for (const pair of resolved) {
    for (let i = 1; i < pair.path.length; i += 1) {
      pushClosureSegment(pair.path[i - 1], pair.path[i]);
    }
  }

  return output;
}

function resolveMaterialSheetSize(layout: ExportSheetLayoutOptions | undefined, outputUnits: Units):
  | ResolvedMaterialSize
  | undefined {
  if (!layout || layout.materialSizePreset === 'none') {
    return undefined;
  }

  if (layout.materialSizePreset === 'custom') {
    const custom = layout.customSize;
    if (!custom || !(custom.width > 0) || !(custom.height > 0)) {
      throw new Error('Custom material size requires width and height greater than 0');
    }

    return {
      width: convertUnits(custom.width, custom.units, outputUnits),
      height: convertUnits(custom.height, custom.units, outputUnits),
      label: `custom ${custom.width}x${custom.height} ${custom.units}`
    };
  }

  const preset = MATERIAL_SIZE_PRESET_OPTIONS.find((option) => option.value === layout.materialSizePreset);
  if (!preset || !preset.width || !preset.height || !preset.units) {
    throw new Error(`Unknown material size preset: ${layout.materialSizePreset}`);
  }

  return {
    width: convertUnits(preset.width, preset.units, outputUnits),
    height: convertUnits(preset.height, preset.units, outputUnits),
    label: preset.label
  };
}

function buildSvgPagesForLayout(
  geometry: CanonicalGeometry,
  layout: ExportSheetLayoutOptions | undefined
): GeneratedSvgPage[] {
  const material = resolveMaterialSheetSize(layout, geometry.template.units);
  if (!material) {
    return [];
  }

  const bounds = buildTemplateBounds(geometry.template.paths);
  if (!bounds) {
    return [];
  }

  const units = geometry.template.units;
  const margin = Math.min(
    convertUnits(8, 'mm', units),
    material.width * 0.2,
    material.height * 0.2
  );
  const usableWidth = material.width - margin * 2;
  const usableHeight = material.height - margin * 2;

  if (usableWidth <= EPSILON || usableHeight <= EPSILON) {
    throw new Error(`Material ${material.label} is too small after margins`);
  }

  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
  const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));
  const pages: GeneratedSvgPage[] = [];

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tileMinX = bounds.minX + col * usableWidth;
      const tileMinY = bounds.minY + row * usableHeight;
      const tileMaxX = Math.min(tileMinX + usableWidth, bounds.maxX);
      const tileMaxY = Math.min(tileMinY + usableHeight, bounds.maxY);

      const clipRect: Rect = {
        minX: tileMinX,
        minY: tileMinY,
        maxX: tileMaxX,
        maxY: tileMaxY
      };

      const clipped = geometry.template.paths.flatMap((path) => clipPathToRect(path, clipRect));
      const translated = translatePaths(clipped, margin - tileMinX, margin - tileMinY);
      const straightCutPaths = addSplitClosureCutLines(translated, {
        margin,
        tileWidth: tileMaxX - tileMinX,
        tileHeight: tileMaxY - tileMinY,
        row,
        col,
        rows,
        cols
      });

      const pageGeometry: CanonicalGeometry = {
        ...geometry,
        template: {
          ...geometry.template,
          width: material.width,
          height: material.height,
          paths: straightCutPaths
        }
      };

      index += 1;
      pages.push({
        index,
        row: row + 1,
        column: col + 1,
        fileNameSuffix: `sheet-r${row + 1}-c${col + 1}`,
        label: `Sheet ${index} (${row + 1}/${rows}, ${col + 1}/${cols})`,
        content: renderTemplateSvg(pageGeometry)
      });
    }
  }

  return pages;
}

export function generateExportArtifacts(options: {
  shapeDefinition: ShapeDefinition;
  exportFormats: ExportFormat[];
  svgLayers: SvgLayer[];
  sheetLayout?: ExportSheetLayoutOptions;
  svgPerforation?: SvgPerforationOptions;
}): GeneratedArtifacts {
  const { shapeDefinition, exportFormats, svgLayers, sheetLayout, svgPerforation } = options;

  if (exportFormats.length === 0) {
    throw new Error('Select at least one export format');
  }

  const geometry = buildCanonicalGeometry(shapeDefinition);
  const layeredGeometry = filterTemplateLayers(geometry, svgLayers);
  const layeredSvgGeometry = applySvgPerforation(layeredGeometry, svgPerforation);
  const artifacts: Partial<Record<ExportFormat, string>> = {};
  let svgPages: GeneratedSvgPage[] = [];

  if (exportFormats.includes('svg')) {
    svgPages = buildSvgPagesForLayout(layeredSvgGeometry, sheetLayout);
    artifacts.svg = svgPages.length > 0 ? svgPages[0].content : renderTemplateSvg(layeredSvgGeometry);
  }

  if (exportFormats.includes('pdf')) {
    artifacts.pdf = renderTemplatePdf(layeredGeometry);
  }

  if (exportFormats.includes('stl')) {
    artifacts.stl = renderTemplateStl(shapeDefinition);
  }

  return {
    geometry,
    artifacts,
    svgPages
  };
}

export function artifactMimeType(format: ExportFormat): string {
  if (format === 'svg') {
    return 'image/svg+xml;charset=utf-8';
  }

  if (format === 'pdf') {
    return 'application/pdf';
  }

  return 'model/stl;charset=utf-8';
}

export function artifactFileName(
  format: ExportFormat,
  kind: CanonicalGeometry['kind'],
  at = new Date(),
  suffix?: string
): string {
  const stamp = at.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  const suffixPart = suffix ? `-${suffix}` : '';
  return `torrify-${kind}-${stamp}${suffixPart}.${format}`;
}

export function availableArtifactFormats(
  artifacts: Partial<Record<ExportFormat, string>>
): ExportFormat[] {
  return (['svg', 'pdf', 'stl'] as const).filter((format) => Boolean(artifacts[format]));
}
