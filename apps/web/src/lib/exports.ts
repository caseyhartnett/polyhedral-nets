import {
  buildCanonicalGeometry,
  buildBaselineGridSheets as buildBaselineGridSheetsInt,
  renderTemplatePdf,
  renderTemplateStl,
  renderTemplateSvg,
  scaleToInt,
  splitAndPack
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
import {
  SPLIT_PACK_SCALE_DEFAULT,
  buildAssignmentsFromPackedSheets,
  buildGridTileMeta,
  buildGridTilesInt,
  buildSplitPackConfig,
  buildSplitPackTemplateGeometry,
  splitSheetToLayerPaths
} from './split-pack-adapter';

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
  sheetOffset?: {
    col: number;
    row: number;
  };
  optimizePacking?: boolean;
  allowRotation?: boolean;
  includeAssemblyGuide?: boolean;
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
  kind: 'sheet' | 'assembly-guide';
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

interface SplitTileCandidate {
  row: number;
  col: number;
  rows: number;
  cols: number;
  globalDx: number;
  globalDy: number;
  paths: LayerPath[];
}

interface PackedComponent {
  paths: LayerPath[];
  bounds: Bounds;
  area: number;
}

interface PackingFreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PackingSheet {
  freeRects: PackingFreeRect[];
}

interface PackedSheetPlacement {
  component: PackableComponent;
  placement: PackingPlacementCandidate;
}

interface PackingPlacementCandidate {
  rectIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: boolean;
  waste: number;
  shortSide: number;
  longSide: number;
}

interface PackableComponent extends PackedComponent {
  hull: Point2[];
  footprintArea: number;
  fillRatio: number;
  pieceLabels: string[];
  sourceCenters: Point2[];
}

interface PackedComponentAssignment {
  pieceLabel: string;
  sourceCenter: Point2;
  sheetIndex: number;
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

function boundsArea(bounds: Bounds): number {
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}

function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function boundsCenter(bounds: Bounds): Point2 {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function boundsOverlap(a: Bounds, b: Bounds, padding = EPSILON): boolean {
  return !(
    a.maxX < b.minX - padding ||
    a.minX > b.maxX + padding ||
    a.maxY < b.minY - padding ||
    a.minY > b.maxY + padding
  );
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

function boundsToPolygon(bounds: Bounds): Point2[] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
}

function convexHull(points: Point2[]): Point2[] {
  if (points.length <= 1) {
    return [...points];
  }

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point2, a: Point2, b: Point2): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point2[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return hull.length > 0 ? hull : [sorted[0]];
}

function polygonArea(points: Point2[]): number {
  if (points.length < 3) {
    return 0;
  }

  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

function estimateComponentHull(component: PackedComponent): Point2[] {
  const points = component.paths.flatMap((path) => path.points);
  if (points.length < 3) {
    return boundsToPolygon(component.bounds);
  }

  const hull = convexHull(points);
  if (hull.length < 3 || polygonArea(hull) <= EPSILON) {
    return boundsToPolygon(component.bounds);
  }
  return hull;
}

function estimateComponentFootprintArea(component: PackedComponent): number {
  const hull = estimateComponentHull(component);
  const hullArea = polygonArea(hull);
  if (hullArea <= EPSILON) {
    return component.area;
  }
  return Math.min(component.area, hullArea);
}

function recomputePackableMetrics(component: PackableComponent): void {
  component.area = boundsArea(component.bounds);
  component.hull = estimateComponentHull(component);
  component.footprintArea = Math.max(0, estimateComponentFootprintArea(component));
  component.fillRatio = component.area > EPSILON ? Math.min(1, component.footprintArea / component.area) : 1;
}

function clonePackableComponent(component: PackableComponent): PackableComponent {
  return {
    ...component,
    paths: [...component.paths],
    bounds: { ...component.bounds },
    hull: component.hull.map((point) => ({ ...point })),
    footprintArea: component.footprintArea,
    fillRatio: component.fillRatio,
    pieceLabels: [...component.pieceLabels],
    sourceCenters: component.sourceCenters.map((center) => ({ ...center }))
  };
}

function mergeTinyPackableComponents(
  components: PackableComponent[],
  tinyAreaThreshold: number
): PackableComponent[] {
  if (components.length < 2 || tinyAreaThreshold <= EPSILON) {
    return components.map(clonePackableComponent);
  }

  const regular: PackableComponent[] = [];
  const tiny: PackableComponent[] = [];

  for (const component of components) {
    const cloned = clonePackableComponent(component);
    if (cloned.area < tinyAreaThreshold) {
      tiny.push(cloned);
    } else {
      regular.push(cloned);
    }
  }

  if (tiny.length === 0 || regular.length === 0) {
    return components.map(clonePackableComponent);
  }

  const sortedTiny = [...tiny].sort(
    (a, b) => a.area - b.area || (a.pieceLabels[0] ?? '').localeCompare(b.pieceLabels[0] ?? '')
  );
  for (const tinyComponent of sortedTiny) {
    const tinyCenter = boundsCenter(tinyComponent.bounds);
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < regular.length; i += 1) {
      const regularCenter = boundsCenter(regular[i].bounds);
      const dx = regularCenter.x - tinyCenter.x;
      const dy = regularCenter.y - tinyCenter.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    const target = regular[bestIndex];
    target.paths.push(...tinyComponent.paths);
    target.bounds = mergeBounds(target.bounds, tinyComponent.bounds);
    recomputePackableMetrics(target);
    target.pieceLabels.push(...tinyComponent.pieceLabels);
    target.sourceCenters.push(...tinyComponent.sourceCenters);
  }

  return regular;
}

function extractConnectedSplitComponents(paths: LayerPath[]): PackedComponent[] {
  if (paths.length === 0) {
    return [];
  }

  const cutPaths = paths
    .map((path, index) => ({ path, index }))
    .filter(({ path }) => path.layer === 'cut' && path.points.length >= 2);

  if (cutPaths.length === 0) {
    const bounds = buildTemplateBounds(paths);
    if (!bounds) {
      return [];
    }

    return [{ paths: [...paths], bounds, area: boundsArea(bounds) }];
  }

  const vertexEps = 1e-4;
  const vertexKey = (point: Point2): string =>
    `${Math.round(point.x / vertexEps)}:${Math.round(point.y / vertexEps)}`;

  interface VertexNode {
    neighbors: Set<string>;
  }

  const vertices = new Map<string, VertexNode>();
  const ensureVertex = (point: Point2): string => {
    const key = vertexKey(point);
    if (!vertices.has(key)) {
      vertices.set(key, { neighbors: new Set() });
    }
    return key;
  };

  const cutPathKeys = new Map<number, string[]>();
  for (const { path, index } of cutPaths) {
    const keys: string[] = [];
    const limit = path.closed ? path.points.length : path.points.length - 1;
    for (let i = 0; i < limit; i += 1) {
      const start = path.points[i];
      const end = path.points[(i + 1) % path.points.length];
      const startKey = ensureVertex(start);
      const endKey = ensureVertex(end);
      vertices.get(startKey)!.neighbors.add(endKey);
      vertices.get(endKey)!.neighbors.add(startKey);
      keys.push(startKey, endKey);
    }

    if (keys.length === 0 && path.points.length > 0) {
      keys.push(ensureVertex(path.points[0]));
    }
    cutPathKeys.set(index, keys);
  }

  const vertexComponent = new Map<string, number>();
  let componentCount = 0;
  for (const startKey of vertices.keys()) {
    if (vertexComponent.has(startKey)) {
      continue;
    }

    const queue = [startKey];
    vertexComponent.set(startKey, componentCount);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const key = queue[cursor];
      for (const neighbor of vertices.get(key)?.neighbors ?? []) {
        if (vertexComponent.has(neighbor)) {
          continue;
        }
        vertexComponent.set(neighbor, componentCount);
        queue.push(neighbor);
      }
    }
    componentCount += 1;
  }

  const componentPaths = new Map<number, LayerPath[]>();
  for (const { path, index } of cutPaths) {
    const firstVertexKey = cutPathKeys.get(index)?.[0];
    if (!firstVertexKey) {
      continue;
    }
    const componentId = vertexComponent.get(firstVertexKey);
    if (componentId === undefined) {
      continue;
    }

    const list = componentPaths.get(componentId) ?? [];
    list.push(path);
    componentPaths.set(componentId, list);
  }

  const components: PackedComponent[] = [];
  for (const pathsForComponent of componentPaths.values()) {
    const bounds = buildTemplateBounds(pathsForComponent);
    if (!bounds) {
      continue;
    }
    components.push({
      paths: [...pathsForComponent],
      bounds,
      area: boundsArea(bounds)
    });
  }

  if (components.length === 0) {
    const bounds = buildTemplateBounds(paths);
    if (!bounds) {
      return [];
    }

    return [{ paths: [...paths], bounds, area: boundsArea(bounds) }];
  }

  const nonCutPaths = paths.filter((path) => path.layer !== 'cut');
  for (const path of nonCutPaths) {
    const pathBounds = buildTemplateBounds([path]);
    if (!pathBounds) {
      continue;
    }

    const overlappingIndexes: number[] = [];
    for (let i = 0; i < components.length; i += 1) {
      if (boundsOverlap(pathBounds, components[i].bounds, 1e-4)) {
        overlappingIndexes.push(i);
      }
    }

    const candidateIndexes =
      overlappingIndexes.length > 0
        ? overlappingIndexes
        : components.map((_component, index) => index);
    const pathCenter = boundsCenter(pathBounds);

    let bestIndex = candidateIndexes[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of candidateIndexes) {
      const componentCenter = boundsCenter(components[index].bounds);
      const dx = componentCenter.x - pathCenter.x;
      const dy = componentCenter.y - pathCenter.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    const target = components[bestIndex];
    target.paths.push(path);
    target.bounds = mergeBounds(target.bounds, pathBounds);
    target.area = boundsArea(target.bounds);
  }

  return components;
}

function isBetterPackingPlacement(
  candidate: PackingPlacementCandidate,
  best: PackingPlacementCandidate | undefined
): boolean {
  if (!best) {
    return true;
  }

  if (candidate.shortSide < best.shortSide - EPSILON) {
    return true;
  }
  if (candidate.shortSide > best.shortSide + EPSILON) {
    return false;
  }

  if (candidate.longSide < best.longSide - EPSILON) {
    return true;
  }
  if (candidate.longSide > best.longSide + EPSILON) {
    return false;
  }

  if (candidate.waste < best.waste - EPSILON) {
    return true;
  }
  if (candidate.waste > best.waste + EPSILON) {
    return false;
  }

  if (candidate.y < best.y - EPSILON) {
    return true;
  }
  if (candidate.y > best.y + EPSILON) {
    return false;
  }

  return candidate.x < best.x - EPSILON;
}

function choosePackingPlacement(
  freeRects: PackingFreeRect[],
  width: number,
  height: number,
  allowRotation: boolean
): PackingPlacementCandidate | undefined {
  const allowRotateForPiece = allowRotation && Math.abs(width - height) > EPSILON;
  const orientations = allowRotateForPiece
    ? [
        { width, height, rotate: false },
        { width: height, height: width, rotate: true }
      ]
    : [{ width, height, rotate: false }];

  let best: PackingPlacementCandidate | undefined;

  for (let rectIndex = 0; rectIndex < freeRects.length; rectIndex += 1) {
    const rect = freeRects[rectIndex];
    for (const option of orientations) {
      if (option.width > rect.width + EPSILON || option.height > rect.height + EPSILON) {
        continue;
      }

      const leftoverWidth = rect.width - option.width;
      const leftoverHeight = rect.height - option.height;
      const shortSide = Math.min(leftoverWidth, leftoverHeight);
      const longSide = Math.max(leftoverWidth, leftoverHeight);
      const waste = leftoverWidth * leftoverHeight;
      const candidate: PackingPlacementCandidate = {
        rectIndex,
        x: rect.x,
        y: rect.y,
        width: option.width,
        height: option.height,
        rotate: option.rotate,
        waste,
        shortSide,
        longSide
      };
      if (isBetterPackingPlacement(candidate, best)) {
        best = candidate;
      }
    }
  }

  return best;
}

function normalizePackingRects(rects: PackingFreeRect[]): PackingFreeRect[] {
  const filtered = rects.filter((rect) => rect.width > EPSILON && rect.height > EPSILON);

  const deduped: PackingFreeRect[] = [];
  for (const rect of filtered) {
    const duplicate = deduped.some(
      (other) =>
        Math.abs(other.x - rect.x) <= EPSILON &&
        Math.abs(other.y - rect.y) <= EPSILON &&
        Math.abs(other.width - rect.width) <= EPSILON &&
        Math.abs(other.height - rect.height) <= EPSILON
    );
    if (!duplicate) {
      deduped.push(rect);
    }
  }

  const withoutContained = deduped.filter((rect, index) => {
    for (let i = 0; i < deduped.length; i += 1) {
      if (i === index) {
        continue;
      }
      const other = deduped[i];
      const contained =
        rect.x >= other.x - EPSILON &&
        rect.y >= other.y - EPSILON &&
        rect.x + rect.width <= other.x + other.width + EPSILON &&
        rect.y + rect.height <= other.y + other.height + EPSILON;
      if (contained) {
        return false;
      }
    }
    return true;
  });

  return withoutContained;
}

function packingRectIntersects(a: PackingFreeRect, b: PackingFreeRect): boolean {
  return !(
    a.x + a.width <= b.x + EPSILON ||
    b.x + b.width <= a.x + EPSILON ||
    a.y + a.height <= b.y + EPSILON ||
    b.y + b.height <= a.y + EPSILON
  );
}

function applyPackingPlacement(
  freeRects: PackingFreeRect[],
  placement: PackingPlacementCandidate
): PackingFreeRect[] {
  const used: PackingFreeRect = {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height
  };

  const next: PackingFreeRect[] = [];

  for (const freeRect of freeRects) {
    if (!packingRectIntersects(freeRect, used)) {
      next.push(freeRect);
      continue;
    }

    const freeRight = freeRect.x + freeRect.width;
    const freeBottom = freeRect.y + freeRect.height;
    const usedRight = used.x + used.width;
    const usedBottom = used.y + used.height;

    if (used.x > freeRect.x + EPSILON) {
      next.push({
        x: freeRect.x,
        y: freeRect.y,
        width: used.x - freeRect.x,
        height: freeRect.height
      });
    }
    if (usedRight < freeRight - EPSILON) {
      next.push({
        x: usedRight,
        y: freeRect.y,
        width: freeRight - usedRight,
        height: freeRect.height
      });
    }
    if (used.y > freeRect.y + EPSILON) {
      next.push({
        x: freeRect.x,
        y: freeRect.y,
        width: freeRect.width,
        height: used.y - freeRect.y
      });
    }
    if (usedBottom < freeBottom - EPSILON) {
      next.push({
        x: freeRect.x,
        y: usedBottom,
        width: freeRect.width,
        height: freeBottom - usedBottom
      });
    }
  }

  return normalizePackingRects(next);
}

function transformPackedComponent(
  component: PackedComponent,
  placement: PackingPlacementCandidate
): LayerPath[] {
  const bounds = component.bounds;
  if (!placement.rotate) {
    return translatePaths(component.paths, placement.x - bounds.minX, placement.y - bounds.minY);
  }

  return component.paths.map((path) => ({
    ...path,
    points: path.points.map((point) => ({
      x: placement.x + (point.y - bounds.minY),
      y: placement.y + (bounds.maxX - point.x)
    }))
  }));
}

function transformPointForPlacement(
  point: Point2,
  bounds: Bounds,
  placement: Pick<PackingPlacementCandidate, 'x' | 'y' | 'rotate'>
): Point2 {
  if (!placement.rotate) {
    return {
      x: placement.x + (point.x - bounds.minX),
      y: placement.y + (point.y - bounds.minY)
    };
  }

  return {
    x: placement.x + (point.y - bounds.minY),
    y: placement.y + (bounds.maxX - point.x)
  };
}

function buildPlacementPolygon(
  component: PackableComponent,
  placement: PackingPlacementCandidate
): Point2[] {
  const source = component.hull.length >= 3 ? component.hull : boundsToPolygon(component.bounds);
  return source.map((point) => transformPointForPlacement(point, component.bounds, placement));
}

function polygonBounds(points: Point2[]): Bounds {
  if (points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function createPlacementForComponent(
  component: PackableComponent,
  x: number,
  y: number,
  rotate: boolean
): PackingPlacementCandidate {
  const width = component.bounds.maxX - component.bounds.minX;
  const height = component.bounds.maxY - component.bounds.minY;
  return {
    rectIndex: -1,
    x,
    y,
    width: rotate ? height : width,
    height: rotate ? width : height,
    rotate,
    waste: 0,
    shortSide: 0,
    longSide: 0
  };
}

function packSplitTilesOntoSheets(
  tiles: SplitTileCandidate[],
  opts: {
    margin: number;
    usableWidth: number;
    usableHeight: number;
    units: Units;
    allowRotation: boolean;
  }
): {
  sheets: LayerPath[][];
  assignments: PackedComponentAssignment[];
} {
  interface PackingRunResult {
    sheets: LayerPath[][];
    assignments: PackedComponentAssignment[];
    envelopeArea: number;
  }

  const components: PackableComponent[] = [];
  let pieceIndex = 0;
  for (const tile of tiles) {
    const extracted = extractConnectedSplitComponents(tile.paths);
    for (const component of extracted) {
      pieceIndex += 1;
      const localCenter = boundsCenter(component.bounds);
      const hull = estimateComponentHull(component);
      const footprintArea = estimateComponentFootprintArea(component);
      const fillRatio = component.area > EPSILON ? Math.min(1, footprintArea / component.area) : 1;
      components.push({
        ...component,
        hull,
        footprintArea,
        fillRatio,
        pieceLabels: [pieceLabelFromIndex(pieceIndex)],
        sourceCenters: [
          {
            x: localCenter.x + tile.globalDx,
            y: localCenter.y + tile.globalDy
          }
        ]
      });
    }
  }

  if (components.length === 0) {
    return { sheets: [], assignments: [] };
  }

  const tinyEdgeLength = convertUnits(10, 'mm', opts.units);
  const tinyAreaThreshold = tinyEdgeLength * tinyEdgeLength;
  const packedComponents = mergeTinyPackableComponents(components, tinyAreaThreshold);

  const minPackSize = 1e-6;
  const componentWidth = (component: PackableComponent): number =>
    Math.max(0, component.bounds.maxX - component.bounds.minX);
  const componentHeight = (component: PackableComponent): number =>
    Math.max(0, component.bounds.maxY - component.bounds.minY);
  const componentMaxSide = (component: PackableComponent): number =>
    Math.max(componentWidth(component), componentHeight(component));
  const componentPerimeter = (component: PackableComponent): number =>
    componentWidth(component) * 2 + componentHeight(component) * 2;
  const componentVoidArea = (component: PackableComponent): number =>
    Math.max(0, component.area - component.footprintArea);
  const primaryPieceLabel = (component: PackableComponent): string => component.pieceLabels[0] ?? '';
  const comparePieceLabel = (a: PackableComponent, b: PackableComponent): number =>
    primaryPieceLabel(a).localeCompare(primaryPieceLabel(b));

  interface SheetPlacementGeometry extends PackedSheetPlacement {
    polygon: Point2[];
    bounds: Bounds;
  }

  const collisionPadding = Math.max(EPSILON, convertUnits(0.5, 'mm', opts.units));

  const minSheetX = opts.margin;
  const minSheetY = opts.margin;
  const maxSheetX = opts.margin + opts.usableWidth;
  const maxSheetY = opts.margin + opts.usableHeight;

  const isPlacementInsideSheet = (placement: PackingPlacementCandidate): boolean =>
    placement.x >= minSheetX - EPSILON &&
    placement.y >= minSheetY - EPSILON &&
    placement.x + placement.width <= maxSheetX + EPSILON &&
    placement.y + placement.height <= maxSheetY + EPSILON;

  const buildSheetPlacementGeometry = (
    component: PackableComponent,
    placement: PackingPlacementCandidate
  ): SheetPlacementGeometry => {
    const polygon = buildPlacementPolygon(component, placement);
    return {
      component,
      placement,
      polygon,
      bounds: polygonBounds(polygon)
    };
  };

  const isCollidingWithSheet = (
    candidate: SheetPlacementGeometry,
    placed: SheetPlacementGeometry[]
  ): boolean => {
    for (const existing of placed) {
      if (boundsOverlap(candidate.bounds, existing.bounds, collisionPadding)) {
        return true;
      }
    }
    return false;
  };

  const normalizeCandidateAxis = (values: number[], min: number, max: number): number[] => {
    if (max < min - EPSILON) {
      return [];
    }
    const deduped: number[] = [];
    const sorted = values
      .map((value) => Math.min(max, Math.max(min, value)))
      .filter((value) => value >= min - EPSILON && value <= max + EPSILON)
      .sort((a, b) => a - b);

    for (const value of sorted) {
      if (deduped.length === 0 || Math.abs(value - deduped[deduped.length - 1]) > 1e-6) {
        deduped.push(value);
      }
    }
    return deduped;
  };

  const findPolygonAwarePlacement = (
    component: PackableComponent,
    targetSheet: SheetPlacementGeometry[]
  ): PackingPlacementCandidate | undefined => {
    const rawWidth = componentWidth(component);
    const rawHeight = componentHeight(component);
    const canRotate = opts.allowRotation && Math.abs(rawWidth - rawHeight) > EPSILON;
    const orientationOptions = canRotate ? [false, true] : [false];

    for (const rotate of orientationOptions) {
      const width = Math.max(minPackSize, rotate ? rawHeight : rawWidth);
      const height = Math.max(minPackSize, rotate ? rawWidth : rawHeight);
      if (width > opts.usableWidth + EPSILON || height > opts.usableHeight + EPSILON) {
        continue;
      }

      const maxX = maxSheetX - width;
      const maxY = maxSheetY - height;
      const xAnchors = [minSheetX, maxX];
      const yAnchors = [minSheetY, maxY];
      for (const existing of targetSheet) {
        const { x, y, width: existingWidth, height: existingHeight } = existing.placement;
        xAnchors.push(x - width, x, x + existingWidth - width, x + existingWidth);
        yAnchors.push(y - height, y, y + existingHeight - height, y + existingHeight);
      }

      const xs = normalizeCandidateAxis(xAnchors, minSheetX, maxX);
      const ys = normalizeCandidateAxis(yAnchors, minSheetY, maxY);

      let checks = 0;
      const maxAnchorChecks = 12000;
      for (const y of ys) {
        for (const x of xs) {
          checks += 1;
          if (checks > maxAnchorChecks) {
            break;
          }
          const placement = createPlacementForComponent(component, x, y, rotate);
          if (!isPlacementInsideSheet(placement)) {
            continue;
          }
          const candidate = buildSheetPlacementGeometry(component, placement);
          if (!isCollidingWithSheet(candidate, targetSheet)) {
            return placement;
          }
        }
        if (checks > maxAnchorChecks) {
          break;
        }
      }

      const scanStep = Math.max(convertUnits(6, 'mm', opts.units), minPackSize);
      const xSteps = Math.max(1, Math.ceil((maxX - minSheetX) / scanStep));
      const ySteps = Math.max(1, Math.ceil((maxY - minSheetY) / scanStep));
      let scanChecks = 0;
      const maxScanChecks = 18000;

      for (let yi = 0; yi <= ySteps; yi += 1) {
        const y = Math.min(maxY, minSheetY + yi * scanStep);
        for (let xi = 0; xi <= xSteps; xi += 1) {
          const x = Math.min(maxX, minSheetX + xi * scanStep);
          scanChecks += 1;
          if (scanChecks > maxScanChecks) {
            break;
          }
          const placement = createPlacementForComponent(component, x, y, rotate);
          if (!isPlacementInsideSheet(placement)) {
            continue;
          }
          const candidate = buildSheetPlacementGeometry(component, placement);
          if (!isCollidingWithSheet(candidate, targetSheet)) {
            return placement;
          }
        }
        if (scanChecks > maxScanChecks) {
          break;
        }
      }
    }

    return undefined;
  };

  const refinePackedSheetsByPolygonMigration = (
    seed: PackedSheetPlacement[][]
  ): PackedSheetPlacement[][] => {
    if (seed.length < 2) {
      return seed.map((sheet) =>
        sheet.map((placement) => ({
          component: placement.component,
          placement: { ...placement.placement }
        }))
      );
    }

    const placed: SheetPlacementGeometry[][] = seed.map((sheet) =>
      sheet.map(({ component, placement }) =>
        buildSheetPlacementGeometry(component, { ...placement })
      )
    );

    for (let sourceIndex = placed.length - 1; sourceIndex > 0; sourceIndex -= 1) {
      const sourceSheet = placed[sourceIndex];
      if (sourceSheet.length === 0) {
        placed.splice(sourceIndex, 1);
        continue;
      }

      const sourceCandidates = [...sourceSheet].sort(
        (a, b) => b.component.area - a.component.area || comparePieceLabel(a.component, b.component)
      );
      for (const sourcePlacement of sourceCandidates) {
        const currentSource = placed[sourceIndex];
        const sourcePlacementIndex = currentSource.indexOf(sourcePlacement);
        if (sourcePlacementIndex === -1) {
          continue;
        }

        let moved = false;
        for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex += 1) {
          const targetSheet = placed[targetIndex];
          const candidatePlacement = findPolygonAwarePlacement(sourcePlacement.component, targetSheet);
          if (!candidatePlacement) {
            continue;
          }

          const movedPlacement = buildSheetPlacementGeometry(
            sourcePlacement.component,
            candidatePlacement
          );
          if (isCollidingWithSheet(movedPlacement, targetSheet)) {
            continue;
          }

          targetSheet.push(movedPlacement);
          currentSource.splice(sourcePlacementIndex, 1);
          moved = true;
          break;
        }

        if (!moved) {
          continue;
        }
        if (currentSource.length === 0) {
          placed.splice(sourceIndex, 1);
          break;
        }
      }
    }

    return placed.map((sheet) =>
      sheet.map((entry) => ({
        component: entry.component,
        placement: { ...entry.placement }
      }))
    );
  };

  const buildRunResultFromPlacements = (placedSheets: PackedSheetPlacement[][]): PackingRunResult => {
    const sheets: LayerPath[][] = [];
    const assignments: PackedComponentAssignment[] = [];
    let envelopeArea = 0;

    for (let sheetIndex = 0; sheetIndex < placedSheets.length; sheetIndex += 1) {
      const placements = placedSheets[sheetIndex];
      if (placements.length === 0) {
        continue;
      }

      let maxX = opts.margin;
      let maxY = opts.margin;
      const paths: LayerPath[] = [];
      for (const { component, placement } of placements) {
        paths.push(...transformPackedComponent(component, placement));
        maxX = Math.max(maxX, placement.x + placement.width);
        maxY = Math.max(maxY, placement.y + placement.height);
        for (let i = 0; i < component.pieceLabels.length; i += 1) {
          assignments.push({
            pieceLabel: component.pieceLabels[i],
            sourceCenter: component.sourceCenters[i] ?? boundsCenter(component.bounds),
            sheetIndex: sheets.length + 1
          });
        }
      }

      envelopeArea += Math.max(0, maxX - opts.margin) * Math.max(0, maxY - opts.margin);
      sheets.push(paths);
    }

    return { sheets, assignments, envelopeArea };
  };

  const runPackingOrder = (ordered: PackableComponent[]): PackingRunResult | undefined => {
    const sheets: PackingSheet[] = [];
    const placedSheets: PackedSheetPlacement[][] = [];

    const createSheet = (): PackingSheet => ({
      freeRects: [
        {
          x: opts.margin,
          y: opts.margin,
          width: opts.usableWidth,
          height: opts.usableHeight
        }
      ]
    });

    for (const component of ordered) {
      const rawWidth = componentWidth(component);
      const rawHeight = componentHeight(component);
      const packWidth = Math.max(rawWidth, minPackSize);
      const packHeight = Math.max(rawHeight, minPackSize);

      let selectedSheetIndex = -1;
      let selectedPlacement: PackingPlacementCandidate | undefined;

      for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
        const placement = choosePackingPlacement(
          sheets[sheetIndex].freeRects,
          packWidth,
          packHeight,
          opts.allowRotation
        );
        if (!placement || !isBetterPackingPlacement(placement, selectedPlacement)) {
          continue;
        }
        selectedPlacement = placement;
        selectedSheetIndex = sheetIndex;
      }

      if (!selectedPlacement) {
        sheets.push(createSheet());
        placedSheets.push([]);
        selectedSheetIndex = sheets.length - 1;
        selectedPlacement = choosePackingPlacement(
          sheets[selectedSheetIndex].freeRects,
          packWidth,
          packHeight,
          opts.allowRotation
        );
        if (!selectedPlacement) {
          return undefined;
        }
      }

      sheets[selectedSheetIndex].freeRects = applyPackingPlacement(
        sheets[selectedSheetIndex].freeRects,
        selectedPlacement
      );
      placedSheets[selectedSheetIndex].push({
        component,
        placement: { ...selectedPlacement }
      });
    }

    const refinedPlacements = refinePackedSheetsByPolygonMigration(placedSheets);
    return buildRunResultFromPlacements(refinedPlacements);
  };

  const isRunBetter = (candidate: PackingRunResult, best: PackingRunResult | undefined): boolean => {
    if (!best) {
      return true;
    }
    if (candidate.sheets.length < best.sheets.length) {
      return true;
    }
    if (candidate.sheets.length > best.sheets.length) {
      return false;
    }
    return candidate.envelopeArea < best.envelopeArea - EPSILON;
  };

  const improveOrderByAdjacentSwaps = (
    seedOrder: PackableComponent[],
    seedRun: PackingRunResult
  ): PackingRunResult => {
    if (seedOrder.length < 2 || seedOrder.length > 80) {
      return seedRun;
    }

    let bestOrder = [...seedOrder];
    let bestRun = seedRun;
    let improved = true;
    let pass = 0;
    const maxPasses = 2;

    while (improved && pass < maxPasses) {
      improved = false;
      pass += 1;

      for (let i = 0; i < bestOrder.length - 1; i += 1) {
        const candidateOrder = [...bestOrder];
        const tmp = candidateOrder[i];
        candidateOrder[i] = candidateOrder[i + 1];
        candidateOrder[i + 1] = tmp;

        const candidateRun = runPackingOrder(candidateOrder);
        if (!candidateRun || !isRunBetter(candidateRun, bestRun)) {
          continue;
        }
        bestOrder = candidateOrder;
        bestRun = candidateRun;
        improved = true;
      }
    }

    return bestRun;
  };

  const strategyComparators: Array<(a: PackableComponent, b: PackableComponent) => number> = [
    (a, b) => b.area - a.area || componentPerimeter(b) - componentPerimeter(a) || comparePieceLabel(a, b),
    (a, b) =>
      componentMaxSide(b) - componentMaxSide(a) || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => componentWidth(b) - componentWidth(a) || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => componentHeight(b) - componentHeight(a) || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => componentPerimeter(b) - componentPerimeter(a) || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => componentVoidArea(b) - componentVoidArea(a) || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => a.fillRatio - b.fillRatio || b.area - a.area || comparePieceLabel(a, b),
    (a, b) => b.footprintArea - a.footprintArea || b.area - a.area || comparePieceLabel(a, b)
  ];

  let bestRun: PackingRunResult | undefined;
  for (const comparator of strategyComparators) {
    const ordered = [...packedComponents].sort(comparator);
    const run = runPackingOrder(ordered);
    if (!run || run.sheets.length === 0) {
      continue;
    }
    const refined = improveOrderByAdjacentSwaps(ordered, run);
    if (isRunBetter(refined, bestRun)) {
      bestRun = refined;
    }
  }

  if (!bestRun) {
    return { sheets: [], assignments: [] };
  }

  return {
    sheets: bestRun.sheets,
    assignments: bestRun.assignments
  };
}

function buildGeneratedSvgPage(
  geometry: CanonicalGeometry,
  material: ResolvedMaterialSize,
  page: {
    kind?: GeneratedSvgPage['kind'];
    index: number;
    row: number;
    column: number;
    fileNameSuffix: string;
    label: string;
    paths: LayerPath[];
  }
): GeneratedSvgPage {
  const pageGeometry: CanonicalGeometry = {
    ...geometry,
    template: {
      ...geometry.template,
      width: material.width,
      height: material.height,
      paths: page.paths
    }
  };

  return {
    kind: page.kind ?? 'sheet',
    index: page.index,
    row: page.row,
    column: page.column,
    fileNameSuffix: page.fileNameSuffix,
    label: page.label,
    content: renderTemplateSvg(pageGeometry)
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildAssemblyGuideSvg(
  geometry: CanonicalGeometry,
  bounds: Bounds,
  guides: { vertical: number[]; horizontal: number[] },
  assignments: PackedComponentAssignment[]
): string {
  const baseSvg = renderTemplateSvg(geometry);
  const gridLines = [
    ...guides.vertical.map(
      (x) =>
        `<line x1="${x.toFixed(3)}" y1="${bounds.minY.toFixed(3)}" x2="${x.toFixed(3)}" y2="${bounds.maxY.toFixed(3)}" />`
    ),
    ...guides.horizontal.map(
      (y) =>
        `<line x1="${bounds.minX.toFixed(3)}" y1="${y.toFixed(3)}" x2="${bounds.maxX.toFixed(3)}" y2="${y.toFixed(3)}" />`
    )
  ].join('\n    ');

  const labels = assignments
    .slice()
    .sort((a, b) => a.pieceLabel.localeCompare(b.pieceLabel))
    .map((assignment) => {
      const label = escapeXml(`Sheet ${assignment.sheetIndex} - Piece ${assignment.pieceLabel}`);
      return `<circle cx="${assignment.sourceCenter.x.toFixed(3)}" cy="${assignment.sourceCenter.y.toFixed(3)}" r="1.8" />
    <text x="${(assignment.sourceCenter.x + 2.6).toFixed(3)}" y="${(assignment.sourceCenter.y - 2.4).toFixed(3)}">${label}</text>`;
    })
    .join('\n    ');

  const overlay = `  <g id="assembly-grid" style="fill:none;stroke:#dc2626;stroke-width:0.7;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;opacity:0.9;">\n    ${gridLines}\n  </g>\n  <g id="assembly-labels" style="fill:#7f1d1d;stroke:none;font-size:4px;font-family:Arial,Helvetica,sans-serif;">\n    ${labels}\n  </g>\n`;
  return baseSvg.replace('</svg>', `${overlay}</svg>`);
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

interface OrientationEvaluation {
  geometry: CanonicalGeometry;
  bounds: Bounds;
  cols: number;
  rows: number;
  sheets: number;
  angleDeg: number;
}

function rotatePoint(point: Point2, pivot: Point2, cosTheta: number, sinTheta: number): Point2 {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cosTheta - dy * sinTheta,
    y: pivot.y + dx * sinTheta + dy * cosTheta
  };
}

function rotateGeometry(
  geometry: CanonicalGeometry,
  bounds: Bounds,
  angleDeg: number
): CanonicalGeometry {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  if (Math.abs(normalizedAngle) <= EPSILON) {
    return geometry;
  }

  const theta = (normalizedAngle * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const pivot: Point2 = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5
  };

  const rotatedPaths: LayerPath[] = geometry.template.paths.map((path) => ({
    ...path,
    points: path.points.map((point) => rotatePoint(point, pivot, cosTheta, sinTheta))
  }));
  const rotatedBounds = buildTemplateBounds(rotatedPaths);
  if (!rotatedBounds) {
    return geometry;
  }
  return {
    ...geometry,
    template: {
      ...geometry.template,
      width: rotatedBounds.maxX - rotatedBounds.minX,
      height: rotatedBounds.maxY - rotatedBounds.minY,
      paths: rotatedPaths
    }
  };
}

function evaluateOrientation(
  geometry: CanonicalGeometry,
  bounds: Bounds,
  usableWidth: number,
  usableHeight: number,
  angleDeg: number
): OrientationEvaluation {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
  const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));
  return {
    geometry,
    bounds,
    cols,
    rows,
    sheets: cols * rows,
    angleDeg
  };
}

interface OrientationScore {
  angleDeg: number;
  cols: number;
  rows: number;
  sheets: number;
  wastedArea: number;
}

interface SheetOffset {
  col: number;
  row: number;
}

interface GridTilingFrame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cols: number;
  rows: number;
}

function resolveSheetOffset(layout: ExportSheetLayoutOptions | undefined): SheetOffset {
  return {
    col: Math.round(layout?.sheetOffset?.col ?? 0),
    row: Math.round(layout?.sheetOffset?.row ?? 0)
  };
}

function buildGridTilingFrame(
  bounds: Bounds,
  usableWidth: number,
  usableHeight: number,
  offset: SheetOffset
): GridTilingFrame {
  const originX = bounds.minX - offset.col * usableWidth;
  const originY = bounds.minY - offset.row * usableHeight;

  const minCol = Math.floor((bounds.minX - originX) / usableWidth + EPSILON);
  const minRow = Math.floor((bounds.minY - originY) / usableHeight + EPSILON);

  const maxColExclusive = Math.max(minCol + 1, Math.ceil((bounds.maxX - originX) / usableWidth - EPSILON));
  const maxRowExclusive = Math.max(minRow + 1, Math.ceil((bounds.maxY - originY) / usableHeight - EPSILON));
  const frameMinCol = Math.min(minCol, minCol - offset.col);
  const frameMinRow = Math.min(minRow, minRow - offset.row);
  const frameMaxColExclusive = Math.max(maxColExclusive, maxColExclusive - offset.col);
  const frameMaxRowExclusive = Math.max(maxRowExclusive, maxRowExclusive - offset.row);

  return {
    minX: originX + frameMinCol * usableWidth,
    minY: originY + frameMinRow * usableHeight,
    maxX: originX + frameMaxColExclusive * usableWidth,
    maxY: originY + frameMaxRowExclusive * usableHeight,
    cols: frameMaxColExclusive - frameMinCol,
    rows: frameMaxRowExclusive - frameMinRow
  };
}

function evaluateOrientationScore(
  points: Point2[],
  pivot: Point2,
  usableWidth: number,
  usableHeight: number,
  angleDeg: number
): OrientationScore {
  const theta = (angleDeg * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const rotated = rotatePoint(point, pivot, cosTheta, sinTheta);
    if (rotated.x < minX) {
      minX = rotated.x;
    }
    if (rotated.y < minY) {
      minY = rotated.y;
    }
    if (rotated.x > maxX) {
      maxX = rotated.x;
    }
    if (rotated.y > maxY) {
      maxY = rotated.y;
    }
  }

  const contentWidth = Math.max(0, maxX - minX);
  const contentHeight = Math.max(0, maxY - minY);
  const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
  const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));
  const sheetArea = cols * usableWidth * rows * usableHeight;
  const contentArea = contentWidth * contentHeight;
  return {
    angleDeg,
    cols,
    rows,
    sheets: cols * rows,
    wastedArea: sheetArea - contentArea
  };
}

function compareOrientationScores(left: OrientationScore, right: OrientationScore): number {
  if (left.sheets !== right.sheets) {
    return left.sheets - right.sheets;
  }
  if (left.cols !== right.cols) {
    return left.cols - right.cols;
  }
  if (left.rows !== right.rows) {
    return left.rows - right.rows;
  }
  if (Math.abs(left.wastedArea - right.wastedArea) > EPSILON) {
    return left.wastedArea - right.wastedArea;
  }
  const leftAxisPenalty = Math.min(left.angleDeg % 90, 90 - (left.angleDeg % 90));
  const rightAxisPenalty = Math.min(right.angleDeg % 90, 90 - (right.angleDeg % 90));
  if (leftAxisPenalty !== rightAxisPenalty) {
    return leftAxisPenalty - rightAxisPenalty;
  }
  return left.angleDeg - right.angleDeg;
}

function chooseBestOrientation(
  geometry: CanonicalGeometry,
  bounds: Bounds,
  usableWidth: number,
  usableHeight: number
): OrientationEvaluation {
  const baseOrientation = evaluateOrientation(geometry, bounds, usableWidth, usableHeight, 0);
  if (baseOrientation.sheets <= 1) {
    return baseOrientation;
  }

  const points = geometry.template.paths.flatMap((path) => path.points);
  if (points.length === 0) {
    return baseOrientation;
  }

  const pivot: Point2 = {
    x: (bounds.minX + bounds.maxX) * 0.5,
    y: (bounds.minY + bounds.maxY) * 0.5
  };
  let best = evaluateOrientationScore(points, pivot, usableWidth, usableHeight, 0);

  for (let angleDeg = 1; angleDeg < 180; angleDeg += 1) {
    const candidate = evaluateOrientationScore(points, pivot, usableWidth, usableHeight, angleDeg);
    if (compareOrientationScores(candidate, best) < 0) {
      best = candidate;
    }
  }

  if (best.angleDeg === 0) {
    return baseOrientation;
  }

  const rotatedGeometry = rotateGeometry(geometry, bounds, best.angleDeg);
  const rotatedBounds = buildTemplateBounds(rotatedGeometry.template.paths);
  if (!rotatedBounds) {
    return baseOrientation;
  }
  return evaluateOrientation(rotatedGeometry, rotatedBounds, usableWidth, usableHeight, best.angleDeg);
}

function buildSvgPagesForLayoutLegacy(
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

  const offset = resolveSheetOffset(layout);
  const frame = buildGridTilingFrame(bounds, usableWidth, usableHeight, offset);
  const cols = frame.cols;
  const rows = frame.rows;
  const splitTiles: SplitTileCandidate[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tileMinX = frame.minX + col * usableWidth;
      const tileMinY = frame.minY + row * usableHeight;
      const tileMaxX = Math.min(tileMinX + usableWidth, frame.maxX);
      const tileMaxY = Math.min(tileMinY + usableHeight, frame.maxY);

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
      splitTiles.push({
        row: row + 1,
        col: col + 1,
        rows,
        cols,
        globalDx: tileMinX - margin,
        globalDy: tileMinY - margin,
        paths: straightCutPaths
      });
    }
  }

  const guideLines = {
    vertical: Array.from({ length: Math.max(0, cols - 1) }, (_value, idx) =>
      Math.min(frame.maxX, frame.minX + (idx + 1) * usableWidth)
    ),
    horizontal: Array.from({ length: Math.max(0, rows - 1) }, (_value, idx) =>
      Math.min(frame.maxY, frame.minY + (idx + 1) * usableHeight)
    )
  };

  const gridPages = splitTiles.map((tile, index) =>
    buildGeneratedSvgPage(geometry, material, {
      index: index + 1,
      row: tile.row,
      column: tile.col,
      fileNameSuffix: `sheet-r${tile.row}-c${tile.col}`,
      label: `Sheet ${index + 1} (${tile.row}/${tile.rows}, ${tile.col}/${tile.cols})`,
      paths: tile.paths
    })
  );

  if (!layout?.optimizePacking) {
    return gridPages;
  }

  const packed = packSplitTilesOntoSheets(splitTiles, {
    margin,
    usableWidth,
    usableHeight,
    units,
    allowRotation: layout.allowRotation !== false
  });
  if (packed.sheets.length === 0 || packed.sheets.length >= gridPages.length) {
    return gridPages;
  }

  const packedPages = packed.sheets.map((paths, index) =>
    buildGeneratedSvgPage(geometry, material, {
      index: index + 1,
      row: 1,
      column: index + 1,
      fileNameSuffix: `sheet-packed-${index + 1}`,
      label: `Sheet ${index + 1} (packed)`,
      paths
    })
  );

  if (layout.includeAssemblyGuide === false || packed.assignments.length === 0) {
    return packedPages;
  }

  return [
    ...packedPages,
    {
      kind: 'assembly-guide',
      index: packedPages.length + 1,
      row: 0,
      column: 0,
      fileNameSuffix: 'assembly-guide',
      label: 'Assembly Guide',
      content: buildAssemblyGuideSvg(geometry, bounds, guideLines, packed.assignments)
    }
  ];
}

const SPLIT_PACK_SCALE = SPLIT_PACK_SCALE_DEFAULT;

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
  const margin = Math.min(convertUnits(8, 'mm', units), material.width * 0.2, material.height * 0.2);
  const usableWidth = material.width - margin * 2;
  const usableHeight = material.height - margin * 2;
  if (usableWidth <= EPSILON || usableHeight <= EPSILON) {
    throw new Error(`Material ${material.label} is too small after margins`);
  }

  const orientation = chooseBestOrientation(geometry, bounds, usableWidth, usableHeight);
  const workingGeometry = orientation.geometry;
  const workingBounds = orientation.bounds;
  const offset = resolveSheetOffset(layout);
  const frame = buildGridTilingFrame(workingBounds, usableWidth, usableHeight, offset);

  const guideLines = {
    vertical: Array.from({ length: Math.max(0, frame.cols - 1) }, (_v, i) =>
      Math.min(frame.maxX, frame.minX + (i + 1) * usableWidth)
    ),
    horizontal: Array.from({ length: Math.max(0, frame.rows - 1) }, (_v, i) =>
      Math.min(frame.maxY, frame.minY + (i + 1) * usableHeight)
    )
  };

  try {
    const { template, pieceMetaById } = buildSplitPackTemplateGeometry(workingGeometry.template.paths);
    if (template.cutPolygons.length === 0) {
      return buildSvgPagesForLayoutLegacy(workingGeometry, layout);
    }

    const templateInt = scaleToInt(template, SPLIT_PACK_SCALE);
    const gridTiles = buildGridTileMeta(
      {
        minX: frame.minX,
        minY: frame.minY,
        maxX: frame.maxX,
        maxY: frame.maxY
      },
      usableWidth,
      usableHeight
    );
    const gridTilesInt = buildGridTilesInt(gridTiles, SPLIT_PACK_SCALE);

    const dimEps = convertUnits(0.1, 'mm', units);
    const areaEps = convertUnits(0.2, 'mm', units) * convertUnits(0.2, 'mm', units);
    const spacing = convertUnits(0.6, 'mm', units);

    const config = buildSplitPackConfig({
      scale: SPLIT_PACK_SCALE,
      materialWidth: material.width,
      materialHeight: material.height,
      margin,
      dimEps,
      areaEps,
      spacing,
      allowRotation: layout?.allowRotation !== false
    });

    const baselineSheets = buildBaselineGridSheetsInt(templateInt, gridTilesInt, config);
    const baselineById = new Map(baselineSheets.map((sheet) => [sheet.id, sheet]));

    const gridPages = gridTiles.map((tile, index) =>
      buildGeneratedSvgPage(workingGeometry, material, {
        index: index + 1,
        row: tile.row,
        column: tile.col,
        fileNameSuffix: `sheet-r${tile.row}-c${tile.col}`,
        label: `Sheet ${index + 1} (${tile.row}/${tile.rows}, ${tile.col}/${tile.cols})`,
        paths: splitSheetToLayerPaths(
          baselineById.get(`grid-${tile.id}`) ?? {
            id: `grid-${tile.id}`,
            rect: {
              left: 0,
              top: 0,
              right: Math.round(material.width * SPLIT_PACK_SCALE),
              bottom: Math.round(material.height * SPLIT_PACK_SCALE)
            },
            placed: []
          },
          SPLIT_PACK_SCALE
        )
      })
    );

    if (!layout?.optimizePacking) {
      return gridPages;
    }

    const packed = splitAndPack(
      {
        ...templateInt,
        fallbackGridSheets: baselineSheets
      },
      gridTilesInt,
      config
    );

    if (packed.mode !== 'optimized' || packed.sheets.length === 0 || packed.sheets.length >= gridPages.length) {
      return gridPages;
    }

    const packedPages = packed.sheets.map((sheet, index) =>
      buildGeneratedSvgPage(workingGeometry, material, {
        index: index + 1,
        row: 1,
        column: index + 1,
        fileNameSuffix: `sheet-packed-${index + 1}`,
        label: `Sheet ${index + 1} (packed)`,
        paths: splitSheetToLayerPaths(sheet, SPLIT_PACK_SCALE)
      })
    );

    if (layout.includeAssemblyGuide === false) {
      return packedPages;
    }

    const assignments = buildAssignmentsFromPackedSheets(packed.sheets, pieceMetaById);
    if (assignments.length === 0) {
      return packedPages;
    }

    return [
      ...packedPages,
      {
        kind: 'assembly-guide',
        index: packedPages.length + 1,
        row: 0,
        column: 0,
        fileNameSuffix: 'assembly-guide',
        label: 'Assembly Guide',
        content: buildAssemblyGuideSvg(workingGeometry, workingBounds, guideLines, assignments)
      }
    ];
  } catch {
    return buildSvgPagesForLayoutLegacy(workingGeometry, layout);
  }
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
