import type {
  CanonicalGeometry,
  FlattenedTemplate,
  LayerPath,
  Point2,
  PolyhedronPreset,
  ShapeDefinition,
  SvgLayer
} from "@torrify/shared-types";

const TWO_PI = Math.PI * 2;
const EPSILON = 1e-9;
const NET_EPSILON = 1e-6;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Face3D {
  id: number;
  kind: "side" | "bottom" | "top" | "poly";
  vertexIndices: number[];
}

interface MeshModel {
  vertices: Vec3[];
  faces: Face3D[];
  triangles: Array<[number, number, number]>;
}

interface NetFace {
  faceId: number;
  points: Point2[];
}

interface NetModel {
  faces: NetFace[];
}

interface SeamOptions {
  mode: ShapeDefinition["seamMode"];
  allowance: number;
}

interface SegmentCounts {
  bottom: number;
  top: number;
}

export interface ShapeDebugModel {
  kind: "prism" | "frustum" | "pyramid" | "polyhedron";
  counts: SegmentCounts;
  mesh: MeshModel;
  net: NetModel;
  template: FlattenedTemplate;
  warnings: string[];
  metrics: {
    bottomRadius: number;
    topRadius: number;
    slantHeight: number;
    surfaceArea: number;
    faceCount: number;
  };
}

export interface WireframeLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WireframePreview {
  width: number;
  height: number;
  lines: WireframeLine[];
}

export interface WireframeCamera {
  yaw?: number;
  pitch?: number;
}

export interface SvgLayerStyle {
  fill?: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeOpacity?: number;
}

export interface TemplateSvgRenderOptions {
  backgroundColor?: string;
  layerStyles?: Partial<Record<SvgLayer, Partial<SvgLayerStyle>>>;
}

export interface WireframeSvgRenderOptions {
  backgroundColor?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface Pt2 {
  x: number;
  y: number;
}

interface PlacedTriangle {
  a: Pt2;
  b: Pt2;
  c: Pt2;
}

function resolveSegmentCounts(shape: {
  segments?: number;
  bottomSegments?: number;
  topSegments?: number;
}): SegmentCounts {
  const base = Math.max(1, Math.floor(shape.segments ?? 1));
  return {
    bottom: Math.max(1, Math.floor(shape.bottomSegments ?? base)),
    top: Math.max(1, Math.floor(shape.topSegments ?? base))
  };
}

function validateShapeDefinition(def: ShapeDefinition, counts: SegmentCounts): void {
  if (def.generationMode === "polyhedron") {
    if (!def.polyhedron) {
      throw new Error("Invalid shape: polyhedron mode requires a polyhedron preset definition");
    }
    if (!(def.polyhedron.edgeLength > 0)) {
      throw new Error("Invalid shape: polyhedron edgeLength must be greater than 0");
    }
    if (
      def.polyhedron.preset === "regularPrism" ||
      def.polyhedron.preset === "regularAntiprism" ||
      def.polyhedron.preset === "regularBipyramid"
    ) {
      const ringSides = def.polyhedron.ringSides ?? 0;
      if (!Number.isInteger(ringSides) || ringSides < 3 || ringSides > 64) {
        throw new Error(`Invalid shape: ${def.polyhedron.preset} requires ringSides between 3 and 64`);
      }
      if (def.polyhedron.preset === "regularBipyramid" && ringSides > 5) {
        throw new Error("Invalid shape: regularBipyramid requires ringSides between 3 and 5");
      }
    }
    return;
  }

  if (!(def.height > 0)) {
    throw new Error("Invalid shape: height must be greater than 0");
  }

  if (!(def.bottomWidth > 0) || !(def.topWidth > 0)) {
    throw new Error("Invalid shape: width values must be greater than 0");
  }

  if (counts.bottom < 3) {
    throw new Error("Invalid shape: bottom edge count must be >= 3");
  }

  const isPyramid = counts.top === 1;
  const isMatching = counts.top >= 3 && counts.top === counts.bottom;

  if (!isPyramid && !isMatching) {
    throw new Error(
      "Unsupported shape family: top edge count must be 1 (pyramid) or match bottom edge count"
    );
  }
}

function buildBounds(paths: LayerPath[]): Bounds {
  const all = paths.flatMap((path) => path.points);
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function withLayer(layer: SvgLayer, points: Point2[], closed = false): LayerPath {
  return { layer, points, closed };
}

function translatePoints(points: Point2[], dx: number, dy: number): Point2[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function normalizePaths(paths: LayerPath[], padding = 10): LayerPath[] {
  const bounds = buildBounds(paths);
  const dx = padding - bounds.minX;
  const dy = padding - bounds.minY;
  return paths.map((path) => ({ ...path, points: translatePoints(path.points, dx, dy) }));
}

function pointKey(p: Point2): string {
  const qx = Math.round(p.x / NET_EPSILON) * NET_EPSILON;
  const qy = Math.round(p.y / NET_EPSILON) * NET_EPSILON;
  return `${qx.toFixed(6)},${qy.toFixed(6)}`;
}

function edgeKey(a: Point2, b: Point2): string {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function edgeLength2D(a: Pt2, b: Pt2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function edgeLength3D(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function sub2(a: Pt2, b: Pt2): Pt2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add2(a: Pt2, b: Pt2): Pt2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale2(v: Pt2, s: number): Pt2 {
  return { x: v.x * s, y: v.y * s };
}

function dot2(a: Pt2, b: Pt2): number {
  return a.x * b.x + a.y * b.y;
}

function len2(v: Pt2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function unit2(v: Pt2): Pt2 {
  const mag = len2(v);
  if (mag <= EPSILON) return { x: 1, y: 0 };
  return scale2(v, 1 / mag);
}

function rotate2(v: Pt2, angle: number): Pt2 {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle)
  };
}

function centroid2(points: Pt2[]): Pt2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function mapTriangleToEdge(local: PlacedTriangle, edgeStart: Pt2, edgeEnd: Pt2): PlacedTriangle {
  const l0 = local.a;
  const l1 = local.c;
  const vL = sub2(l1, l0);
  const vW = sub2(edgeEnd, edgeStart);
  const ul = unit2(vL);
  const vl = { x: -ul.y, y: ul.x };
  const uw = unit2(vW);
  const vw = { x: -uw.y, y: uw.x };
  const s = len2(vW) / Math.max(len2(vL), EPSILON);

  const mapPoint = (p: Pt2): Pt2 => {
    const d = sub2(p, l0);
    const a = dot2(d, ul);
    const b = dot2(d, vl);
    return add2(edgeStart, add2(scale2(uw, a * s), scale2(vw, b * s)));
  };

  return {
    a: mapPoint(local.a),
    b: mapPoint(local.b),
    c: mapPoint(local.c)
  };
}

function polygonFromAttachedEdge(edgeStart: Pt2, edgeEnd: Pt2, sides: number, outwardHint: Pt2): Pt2[] {
  const edge = sub2(edgeEnd, edgeStart);
  const exterior = TWO_PI / sides;

  const build = (sign: number): Pt2[] => {
    const points: Pt2[] = [edgeStart, edgeEnd];
    let currVec = edge;
    let currPt = edgeEnd;

    for (let i = 2; i < sides; i += 1) {
      currVec = rotate2(currVec, sign * exterior);
      currPt = add2(currPt, currVec);
      points.push(currPt);
    }

    return points;
  };

  const mid = scale2(add2(edgeStart, edgeEnd), 0.5);
  const polyA = build(1);
  const polyB = build(-1);
  const scoreA = dot2(sub2(centroid2(polyA), mid), outwardHint);
  const scoreB = dot2(sub2(centroid2(polyB), mid), outwardHint);
  return scoreA >= scoreB ? polyA : polyB;
}

function triangulateFace(face: Face3D): Array<[number, number, number]> {
  const triangles: Array<[number, number, number]> = [];
  const [v0, ...rest] = face.vertexIndices;
  for (let i = 0; i < rest.length - 1; i += 1) {
    triangles.push([v0, rest[i], rest[i + 1]]);
  }
  return triangles;
}

function buildMesh(def: ShapeDefinition, counts: SegmentCounts): MeshModel {
  const n = counts.bottom;
  const h = def.height;
  const bottomRadius = def.bottomWidth / 2;
  const topRadius = counts.top === 1 ? 0 : def.topWidth / 2;

  const vertices: Vec3[] = [];
  const faces: Face3D[] = [];

  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI;
    vertices.push({ x: Math.cos(t) * bottomRadius, y: Math.sin(t) * bottomRadius, z: 0 });
  }

  const topOffset = vertices.length;
  if (counts.top === 1) {
    vertices.push({ x: 0, y: 0, z: h });
  } else {
    for (let i = 0; i < n; i += 1) {
      const t = (i / n) * TWO_PI;
      vertices.push({ x: Math.cos(t) * topRadius, y: Math.sin(t) * topRadius, z: h });
    }
  }

  let faceId = 0;
  for (let i = 0; i < n; i += 1) {
    const b0 = i;
    const b1 = (i + 1) % n;

    if (counts.top === 1) {
      const apex = topOffset;
      faces.push({ id: faceId, kind: "side", vertexIndices: [b0, b1, apex] });
    } else {
      const t0 = topOffset + i;
      const t1 = topOffset + ((i + 1) % n);
      faces.push({ id: faceId, kind: "side", vertexIndices: [b0, b1, t1, t0] });
    }

    faceId += 1;
  }

  const bottomFace: Face3D = {
    id: faceId,
    kind: "bottom",
    vertexIndices: [...Array(n).keys()].reverse()
  };
  faces.push(bottomFace);
  faceId += 1;

  if (counts.top > 1) {
    const topFace: Face3D = {
      id: faceId,
      kind: "top",
      vertexIndices: Array.from({ length: n }, (_, i) => topOffset + i)
    };
    faces.push(topFace);
  }

  const triangles = faces.flatMap((face) => triangulateFace(face));

  return { vertices, faces, triangles };
}

function buildFrustumLikeNet(mesh: MeshModel, counts: SegmentCounts): NetModel {
  const n = counts.bottom;

  const sideFaces = mesh.faces.filter((face) => face.kind === "side");
  const bottomFace = mesh.faces.find((face) => face.kind === "bottom");
  const topFace = mesh.faces.find((face) => face.kind === "top");

  if (!bottomFace) {
    throw new Error("Invariant violation: bottom face missing");
  }

  const bottomSide = edgeLength3D(mesh.vertices[0], mesh.vertices[1]);
  const topSide = topFace
    ? edgeLength3D(mesh.vertices[topFace.vertexIndices[0]], mesh.vertices[topFace.vertexIndices[1]])
    : 0;

  const firstSide = sideFaces[0];
  const lateral = edgeLength3D(
    mesh.vertices[firstSide.vertexIndices[0]],
    mesh.vertices[firstSide.vertexIndices[firstSide.vertexIndices.length - 1]]
  );

  const inset = (bottomSide - topSide) / 2;
  const riseSquared = lateral * lateral - inset * inset;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: side face collapsed during net construction");
  }
  const rise = Math.sqrt(riseSquared);
  const bottomCap: Point2[] = Array.from({ length: n }, (_, i) => ({
    x: mesh.vertices[i].x,
    y: mesh.vertices[i].y
  }));
  const bottomCentroid = centroid2(bottomCap);

  interface RadialPanelPlacement {
    points: Point2[];
    topStart: Point2;
    topEnd: Point2;
    outward: Pt2;
  }

  const panels: RadialPanelPlacement[] = [];

  for (let i = 0; i < n; i += 1) {
    const b0 = bottomCap[i];
    const b1 = bottomCap[(i + 1) % n];
    const edge = sub2(b1, b0);
    const along = unit2(edge);
    const midpoint = scale2(add2(b0, b1), 0.5);
    const n1 = unit2({ x: -edge.y, y: edge.x });
    const n2 = scale2(n1, -1);
    const toMid = sub2(midpoint, bottomCentroid);
    const outward = dot2(toMid, n1) >= dot2(toMid, n2) ? n1 : n2;

    const t0 = add2(b0, add2(scale2(along, inset), scale2(outward, rise)));
    const t1 = add2(b0, add2(scale2(along, bottomSide - inset), scale2(outward, rise)));

    panels.push({
      points: [b0, b1, t1, t0],
      topStart: t0,
      topEnd: t1,
      outward
    });
  }

  const netFaces: NetFace[] = panels.map((panel, i) => ({
    faceId: sideFaces[i].id,
    points: panel.points
  }));

  netFaces.push({ faceId: bottomFace.id, points: bottomCap });

  if (topFace) {
    const attachPanel = panels[Math.floor((n - 1) / 2)];
    const topCap = polygonFromAttachedEdge(attachPanel.topStart, attachPanel.topEnd, n, attachPanel.outward);
    netFaces.push({ faceId: topFace.id, points: topCap });
  }

  return { faces: netFaces };
}

function buildPyramidNet(mesh: MeshModel, counts: SegmentCounts): NetModel {
  const n = counts.bottom;
  const sideFaces = mesh.faces.filter((face) => face.kind === "side");
  const bottomFace = mesh.faces.find((face) => face.kind === "bottom");

  if (!bottomFace) {
    throw new Error("Invariant violation: bottom face missing");
  }

  const firstSide = sideFaces[0];
  const bottom0 = mesh.vertices[firstSide.vertexIndices[0]];
  const bottom1 = mesh.vertices[firstSide.vertexIndices[1]];
  const apex = mesh.vertices[firstSide.vertexIndices[2]];

  const sideBottom = edgeLength3D(bottom0, bottom1);
  const lateral = edgeLength3D(bottom0, apex);

  if (lateral <= EPSILON) {
    throw new Error("Invalid shape: pyramid lateral edge collapsed");
  }

  const ratio = Math.max(-1, Math.min(1, sideBottom / (2 * lateral)));
  const apexSweep = 2 * Math.asin(ratio);

  const local: PlacedTriangle = {
    a: { x: 0, y: 0 },
    b: { x: lateral * Math.cos(apexSweep), y: lateral * Math.sin(apexSweep) },
    c: { x: lateral, y: 0 }
  };

  const triangles: PlacedTriangle[] = [{ ...local }];
  for (let i = 1; i < n; i += 1) {
    const prev = triangles[i - 1];
    triangles.push(mapTriangleToEdge(local, prev.a, prev.b));
  }

  const netFaces: NetFace[] = triangles.map((tri, i) => ({
    faceId: sideFaces[i].id,
    points: [tri.a, tri.b, tri.c]
  }));

  const stripCentroid = centroid2(triangles.flatMap((tri) => [tri.a, tri.b, tri.c]));
  const attachIndex = Math.floor((n - 1) / 2);
  const tri = triangles[attachIndex];
  const baseAttach = { p0: tri.c, p1: tri.b };
  const out = sub2(scale2(add2(baseAttach.p0, baseAttach.p1), 0.5), stripCentroid);
  const baseCap = polygonFromAttachedEdge(baseAttach.p0, baseAttach.p1, n, out);

  netFaces.push({ faceId: bottomFace.id, points: baseCap });

  return { faces: netFaces };
}

function buildNet(mesh: MeshModel, counts: SegmentCounts): NetModel {
  return counts.top === 1 ? buildPyramidNet(mesh, counts) : buildFrustumLikeNet(mesh, counts);
}

interface FaceProjection2D {
  points: Pt2[];
  centroid: Pt2;
  byVertex: Map<number, Pt2>;
}

interface EdgeAdjacency {
  faceId: number;
  a: number;
  b: number;
}

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dotVec(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function polygonArea2(points: Pt2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function ensureCounterClockwise2(points: Pt2[]): Pt2[] {
  return polygonArea2(points) >= 0 ? points : [...points].reverse();
}

function cross2d(a: Pt2, b: Pt2, c: Pt2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function lineIntersection2(p1: Pt2, p2: Pt2, q1: Pt2, q2: Pt2): Pt2 {
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = a1 * p1.x + b1 * p1.y;
  const a2 = q2.y - q1.y;
  const b2 = q1.x - q2.x;
  const c2 = a2 * q1.x + b2 * q1.y;
  const det = a1 * b2 - a2 * b1;

  if (Math.abs(det) <= EPSILON) {
    return { x: p2.x, y: p2.y };
  }

  return {
    x: (b2 * c1 - b1 * c2) / det,
    y: (a1 * c2 - a2 * c1) / det
  };
}

function clipConvexPolygon2(subject: Pt2[], clip: Pt2[]): Pt2[] {
  let output = ensureCounterClockwise2(subject);
  const clipPoly = ensureCounterClockwise2(clip);

  for (let i = 0; i < clipPoly.length; i += 1) {
    const cp1 = clipPoly[i];
    const cp2 = clipPoly[(i + 1) % clipPoly.length];
    const input = output;
    output = [];

    if (input.length === 0) {
      break;
    }

    let s = input[input.length - 1];
    for (const e of input) {
      const insideE = cross2d(cp1, cp2, e) >= -1e-8;
      const insideS = cross2d(cp1, cp2, s) >= -1e-8;

      if (insideE) {
        if (!insideS) {
          output.push(lineIntersection2(s, e, cp1, cp2));
        }
        output.push(e);
      } else if (insideS) {
        output.push(lineIntersection2(s, e, cp1, cp2));
      }

      s = e;
    }
  }

  return output;
}

function overlapAreaConvex2(a: Pt2[], b: Pt2[]): number {
  const clipped = clipConvexPolygon2(a, b);
  if (clipped.length < 3) {
    return 0;
  }
  return Math.abs(polygonArea2(clipped));
}

function mapPolygonToEdge(
  localPoints: Pt2[],
  localEdgeStart: Pt2,
  localEdgeEnd: Pt2,
  worldEdgeStart: Pt2,
  worldEdgeEnd: Pt2,
  mirror = false
): Pt2[] {
  const localEdge = sub2(localEdgeEnd, localEdgeStart);
  const worldEdge = sub2(worldEdgeEnd, worldEdgeStart);
  const ul = unit2(localEdge);
  const vl = { x: -ul.y, y: ul.x };
  const uw = unit2(worldEdge);
  const vw = { x: -uw.y, y: uw.x };
  const scale = len2(worldEdge) / Math.max(len2(localEdge), EPSILON);

  return localPoints.map((point) => {
    const delta = sub2(point, localEdgeStart);
    const along = dot2(delta, ul);
    const across = dot2(delta, vl) * (mirror ? -1 : 1);
    return add2(worldEdgeStart, add2(scale2(uw, along * scale), scale2(vw, across * scale)));
  });
}

function faceProjection2D(mesh: MeshModel, face: Face3D): FaceProjection2D {
  const ids = face.vertexIndices;
  const a = mesh.vertices[ids[0]];
  const b = mesh.vertices[ids[1]];
  const c = mesh.vertices[ids[2]];
  const u = normalize(subVec(b, a));
  const n = normalize(cross(subVec(b, a), subVec(c, a)));
  const v = normalize(cross(n, u));

  const points = ids.map((id) => {
    const p = mesh.vertices[id];
    const rel = subVec(p, a);
    return {
      x: dotVec(rel, u),
      y: dotVec(rel, v)
    };
  });

  const byVertex = new Map<number, Pt2>();
  for (let i = 0; i < ids.length; i += 1) {
    byVertex.set(ids[i], points[i]);
  }

  return {
    points,
    centroid: centroid2(points),
    byVertex
  };
}

function edgePlaneSide(edgeStart: Pt2, edgeEnd: Pt2, point: Pt2): number {
  const edge = sub2(edgeEnd, edgeStart);
  const normal = { x: -edge.y, y: edge.x };
  const rel = sub2(point, scale2(add2(edgeStart, edgeEnd), 0.5));
  return dot2(rel, normal);
}

function buildFaceAdjacency(mesh: MeshModel): Map<number, EdgeAdjacency[]> {
  const edgeOwners = new Map<string, EdgeAdjacency[]>();

  for (const face of mesh.faces) {
    const ids = face.vertexIndices;
    for (let i = 0; i < ids.length; i += 1) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      const key = edgeKeyFromIndexPair(a, b);
      const existing = edgeOwners.get(key);
      if (existing) {
        existing.push({ faceId: face.id, a, b });
      } else {
        edgeOwners.set(key, [{ faceId: face.id, a, b }]);
      }
    }
  }

  const adjacency = new Map<number, EdgeAdjacency[]>();
  for (const entries of edgeOwners.values()) {
    if (entries.length !== 2) {
      continue;
    }
    const [left, right] = entries;
    const leftNeighbors = adjacency.get(left.faceId) ?? [];
    const rightNeighbors = adjacency.get(right.faceId) ?? [];
    leftNeighbors.push({ faceId: right.faceId, a: left.a, b: left.b });
    rightNeighbors.push({ faceId: left.faceId, a: right.a, b: right.b });
    adjacency.set(left.faceId, leftNeighbors);
    adjacency.set(right.faceId, rightNeighbors);
  }

  return adjacency;
}

function quantize(value: number, precision = 1e-6): number {
  return Math.round(value / precision) * precision;
}

function planeKey(normal: Vec3, d: number): string {
  return `${quantize(normal.x)}|${quantize(normal.y)}|${quantize(normal.z)}|${quantize(d)}`;
}

function sortFaceVertices(vertices: Vec3[], indices: number[], normal: Vec3): number[] {
  const center = indices
    .map((index) => vertices[index])
    .reduce((acc, v) => addVec(acc, v), vec(0, 0, 0));
  const centroid = scaleVec(center, 1 / indices.length);

  const ref = Math.abs(normal.z) < 0.9 ? vec(0, 0, 1) : vec(0, 1, 0);
  const u = normalize(cross(ref, normal));
  const v = normalize(cross(normal, u));

  const ordered = [...indices].sort((a, b) => {
    const pa = subVec(vertices[a], centroid);
    const pb = subVec(vertices[b], centroid);
    const angleA = Math.atan2(dotVec(pa, v), dotVec(pa, u));
    const angleB = Math.atan2(dotVec(pb, v), dotVec(pb, u));
    return angleA - angleB;
  });

  if (ordered.length >= 3) {
    const p0 = vertices[ordered[0]];
    const p1 = vertices[ordered[1]];
    const p2 = vertices[ordered[2]];
    const winding = dotVec(normalize(cross(subVec(p1, p0), subVec(p2, p1))), normal);
    if (winding < 0) {
      ordered.reverse();
    }
  }

  return ordered;
}

function buildConvexHullFaces(vertices: Vec3[]): number[][] {
  const center = scaleVec(vertices.reduce((acc, v) => addVec(acc, v), vec(0, 0, 0)), 1 / vertices.length);
  const planeBuckets = new Map<string, { normal: Vec3; d: number; vertices: Set<number> }>();
  const planeTolerance = 1e-6;

  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        let normal = cross(subVec(b, a), subVec(c, a));
        if (Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z) <= EPSILON) {
          continue;
        }
        normal = normalize(normal);

        if (dotVec(normal, subVec(a, center)) < 0) {
          normal = scaleVec(normal, -1);
        }

        const d = dotVec(normal, a);
        let isHullPlane = true;
        for (let p = 0; p < vertices.length; p += 1) {
          if (dotVec(normal, vertices[p]) - d > planeTolerance) {
            isHullPlane = false;
            break;
          }
        }
        if (!isHullPlane) {
          continue;
        }

        const key = planeKey(normal, d);
        const bucket = planeBuckets.get(key) ?? { normal, d, vertices: new Set<number>() };

        for (let p = 0; p < vertices.length; p += 1) {
          if (Math.abs(dotVec(normal, vertices[p]) - d) <= planeTolerance * 4) {
            bucket.vertices.add(p);
          }
        }

        planeBuckets.set(key, bucket);
      }
    }
  }

  const faces: number[][] = [];
  for (const bucket of planeBuckets.values()) {
    const indices = Array.from(bucket.vertices);
    if (indices.length < 3) {
      continue;
    }
    faces.push(sortFaceVertices(vertices, indices, bucket.normal));
  }

  return faces;
}

function signedPermutationsOf0102(): Vec3[] {
  const perms: Array<[number, number, number]> = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ];
  const dedupe = new Map<string, Vec3>();

  for (const perm of perms) {
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const values = perm.map((value) => {
          if (value === 0) return 0;
          if (value === 1) return s1;
          return s2 * 2;
        });
        const v = vec(values[0], values[1], values[2]);
        dedupe.set(`${v.x},${v.y},${v.z}`, v);
      }
    }
  }

  return Array.from(dedupe.values());
}

function rawPresetVertices(preset: PolyhedronPreset): Vec3[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const invPhi = 1 / phi;

  switch (preset) {
    case "tetrahedron":
      return [
        vec(1, 1, 1),
        vec(-1, -1, 1),
        vec(-1, 1, -1),
        vec(1, -1, -1)
      ];
    case "cube": {
      const out: Vec3[] = [];
      for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
          for (const z of [-1, 1]) {
            out.push(vec(x, y, z));
          }
        }
      }
      return out;
    }
    case "octahedron":
      return [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0), vec(0, 0, 1), vec(0, 0, -1)];
    case "icosahedron":
      return [
        vec(0, 1, phi),
        vec(0, -1, phi),
        vec(0, 1, -phi),
        vec(0, -1, -phi),
        vec(1, phi, 0),
        vec(-1, phi, 0),
        vec(1, -phi, 0),
        vec(-1, -phi, 0),
        vec(phi, 0, 1),
        vec(phi, 0, -1),
        vec(-phi, 0, 1),
        vec(-phi, 0, -1)
      ];
    case "dodecahedron":
      return [
        vec(1, 1, 1),
        vec(1, 1, -1),
        vec(1, -1, 1),
        vec(1, -1, -1),
        vec(-1, 1, 1),
        vec(-1, 1, -1),
        vec(-1, -1, 1),
        vec(-1, -1, -1),
        vec(0, invPhi, phi),
        vec(0, invPhi, -phi),
        vec(0, -invPhi, phi),
        vec(0, -invPhi, -phi),
        vec(invPhi, phi, 0),
        vec(invPhi, -phi, 0),
        vec(-invPhi, phi, 0),
        vec(-invPhi, -phi, 0),
        vec(phi, 0, invPhi),
        vec(phi, 0, -invPhi),
        vec(-phi, 0, invPhi),
        vec(-phi, 0, -invPhi)
      ];
    case "cuboctahedron": {
      const out: Vec3[] = [];
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          out.push(vec(a, b, 0));
          out.push(vec(a, 0, b));
          out.push(vec(0, a, b));
        }
      }
      return out;
    }
    case "truncatedOctahedron":
      return signedPermutationsOf0102();
    case "regularPrism":
      return [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0)];
    default:
      return [vec(1, 1, 1), vec(-1, -1, 1), vec(-1, 1, -1), vec(1, -1, -1)];
  }
}

function minNonZeroEdge(vertices: Vec3[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const distance = edgeLength3D(vertices[i], vertices[j]);
      if (distance > EPSILON && distance < min) {
        min = distance;
      }
    }
  }
  return min;
}

function scalePresetVertices(vertices: Vec3[], edgeLength: number): Vec3[] {
  const baseEdge = minNonZeroEdge(vertices);
  if (!Number.isFinite(baseEdge) || baseEdge <= EPSILON) {
    throw new Error("Invalid polyhedron preset: unable to resolve edge length");
  }
  const scale = edgeLength / baseEdge;
  return vertices.map((v) => scaleVec(v, scale));
}

function buildRegularPrismMesh(ringSides: number, edgeLength: number): MeshModel {
  const n = Math.max(3, Math.floor(ringSides));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const halfHeight = edgeLength / 2;
  const vertices: Vec3[] = [];

  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: -halfHeight });
  }
  const topOffset = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: halfHeight });
  }

  const faces: Face3D[] = [];
  let faceId = 0;

  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    faces.push({
      id: faceId,
      kind: "poly",
      vertexIndices: [i, next, topOffset + next, topOffset + i]
    });
    faceId += 1;
  }

  faces.push({
    id: faceId,
    kind: "poly",
    vertexIndices: Array.from({ length: n }, (_, i) => i).reverse()
  });
  faceId += 1;
  faces.push({
    id: faceId,
    kind: "poly",
    vertexIndices: Array.from({ length: n }, (_, i) => topOffset + i)
  });

  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}

function buildRegularAntiprismMesh(ringSides: number, edgeLength: number): MeshModel {
  const n = Math.max(3, Math.floor(ringSides));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const planarOffset = 2 * radius * Math.sin(Math.PI / (2 * n));
  const riseSquared = edgeLength * edgeLength - planarOffset * planarOffset;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: regularAntiprism side rise collapsed");
  }
  const halfHeight = Math.sqrt(riseSquared) / 2;
  const vertices: Vec3[] = [];

  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: -halfHeight });
  }
  const topOffset = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI + Math.PI / n;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: halfHeight });
  }

  const faces: Face3D[] = [];
  let faceId = 0;

  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const prev = (i - 1 + n) % n;
    faces.push({ id: faceId, kind: "poly", vertexIndices: [i, next, topOffset + i] });
    faceId += 1;
    faces.push({ id: faceId, kind: "poly", vertexIndices: [i, topOffset + i, topOffset + prev] });
    faceId += 1;
  }

  faces.push({
    id: faceId,
    kind: "poly",
    vertexIndices: Array.from({ length: n }, (_, i) => i).reverse()
  });
  faceId += 1;
  faces.push({
    id: faceId,
    kind: "poly",
    vertexIndices: Array.from({ length: n }, (_, i) => topOffset + i)
  });

  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}

function buildRegularBipyramidMesh(ringSides: number, edgeLength: number): MeshModel {
  const n = Math.max(3, Math.min(5, Math.floor(ringSides)));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const riseSquared = edgeLength * edgeLength - radius * radius;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: regularBipyramid apex height collapsed");
  }
  const apexHeight = Math.sqrt(riseSquared);

  const vertices: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: 0 });
  }
  const topApex = vertices.length;
  vertices.push({ x: 0, y: 0, z: apexHeight });
  const bottomApex = vertices.length;
  vertices.push({ x: 0, y: 0, z: -apexHeight });

  const faces: Face3D[] = [];
  let faceId = 0;
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    faces.push({ id: faceId, kind: "poly", vertexIndices: [topApex, i, next] });
    faceId += 1;
    faces.push({ id: faceId, kind: "poly", vertexIndices: [bottomApex, next, i] });
    faceId += 1;
  }

  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}

function buildPolyhedronMesh(preset: PolyhedronPreset, edgeLength: number, ringSides?: number): MeshModel {
  if (preset === "regularPrism") {
    return buildRegularPrismMesh(ringSides ?? 6, edgeLength);
  }
  if (preset === "regularAntiprism") {
    return buildRegularAntiprismMesh(ringSides ?? 6, edgeLength);
  }
  if (preset === "regularBipyramid") {
    return buildRegularBipyramidMesh(ringSides ?? 5, edgeLength);
  }

  const vertices = scalePresetVertices(rawPresetVertices(preset), edgeLength);
  const faceIndices = buildConvexHullFaces(vertices);
  if (faceIndices.length < 4) {
    throw new Error(`Polyhedron preset ${preset} failed convex hull extraction`);
  }

  const faces: Face3D[] = faceIndices.map((indices, id) => ({
    id,
    kind: "poly",
    vertexIndices: indices
  }));
  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}

function buildPolyhedronNet(mesh: MeshModel): NetModel {
  const byId = new Map(mesh.faces.map((face) => [face.id, face]));
  const projections = new Map<number, FaceProjection2D>(
    mesh.faces.map((face) => [face.id, faceProjection2D(mesh, face)])
  );
  const adjacency = buildFaceAdjacency(mesh);
  const rootFace = mesh.faces.reduce((best, current) =>
    current.vertexIndices.length > best.vertexIndices.length ? current : best
  );

  const placed = new Map<number, FaceProjection2D>();
  placed.set(rootFace.id, projections.get(rootFace.id)!);

  while (placed.size < mesh.faces.length) {
    let bestPlacement:
      | {
          faceId: number;
          projection: FaceProjection2D;
          score: number;
        }
      | undefined;

    for (const [parentId, parentProjection] of placed.entries()) {
      const neighbors = adjacency.get(parentId) ?? [];

      for (const neighbor of neighbors) {
        if (placed.has(neighbor.faceId)) {
          continue;
        }
        const neighborFace = byId.get(neighbor.faceId);
        const localNeighbor = projections.get(neighbor.faceId);
        if (!neighborFace || !localNeighbor) {
          continue;
        }

        const worldA = parentProjection.byVertex.get(neighbor.a);
        const worldB = parentProjection.byVertex.get(neighbor.b);
        const localA = localNeighbor.byVertex.get(neighbor.a);
        const localB = localNeighbor.byVertex.get(neighbor.b);
        if (!worldA || !worldB || !localA || !localB) {
          continue;
        }

        const candidates = [false, true].map((mirror) => {
          const points = mapPolygonToEdge(localNeighbor.points, localA, localB, worldA, worldB, mirror);
          const byVertex = new Map<number, Pt2>();
          for (let i = 0; i < neighborFace.vertexIndices.length; i += 1) {
            byVertex.set(neighborFace.vertexIndices[i], points[i]);
          }
          const centroid = centroid2(points);
          const parentSide = edgePlaneSide(worldA, worldB, parentProjection.centroid);
          const childSide = edgePlaneSide(worldA, worldB, centroid);
          const sidePenalty =
            Math.abs(parentSide) < 1e-8 || Math.abs(childSide) < 1e-8 || parentSide * childSide < 0 ? 0 : 10_000;
          let overlapPenalty = 0;
          for (const existing of placed.values()) {
            overlapPenalty += overlapAreaConvex2(points, existing.points);
          }

          return {
            faceId: neighbor.faceId,
            projection: { points, centroid, byVertex },
            score: overlapPenalty + sidePenalty
          };
        });

        for (const candidate of candidates) {
          if (!bestPlacement || candidate.score < bestPlacement.score) {
            bestPlacement = candidate;
          }
        }
      }
    }

    if (!bestPlacement) {
      throw new Error("Unable to unfold polyhedron net without disconnected faces");
    }

    placed.set(bestPlacement.faceId, bestPlacement.projection);
  }

  const faces = mesh.faces.map((face) => {
    const projection = placed.get(face.id);
    if (!projection) {
      throw new Error(`Missing unfolded face ${face.id}`);
    }
    return { faceId: face.id, points: projection.points };
  });

  return { faces };
}

interface BoundaryEdge {
  key: string;
  a: Point2;
  b: Point2;
}

function pickSeamBoundaryEdge(edges: BoundaryEdge[]): BoundaryEdge | undefined {
  return [...edges].sort((left, right) => {
    const lengthDiff = edgeLength2D(right.a, right.b) - edgeLength2D(left.a, left.b);
    if (Math.abs(lengthDiff) > EPSILON) {
      return lengthDiff;
    }

    const leftMidX = (left.a.x + left.b.x) / 2;
    const rightMidX = (right.a.x + right.b.x) / 2;
    if (Math.abs(leftMidX - rightMidX) > EPSILON) {
      return leftMidX - rightMidX;
    }

    const leftMidY = (left.a.y + left.b.y) / 2;
    const rightMidY = (right.a.y + right.b.y) / 2;
    if (Math.abs(leftMidY - rightMidY) > EPSILON) {
      return leftMidY - rightMidY;
    }

    return left.key.localeCompare(right.key);
  })[0];
}

function seamNormal(a: Point2, b: Point2, netCentroid: Point2): Pt2 {
  const edge = sub2(b, a);
  const n1 = unit2({ x: -edge.y, y: edge.x });
  const n2 = scale2(n1, -1);
  const midpoint = scale2(add2(a, b), 0.5);
  const toMid = sub2(midpoint, netCentroid);
  return dot2(toMid, n1) >= dot2(toMid, n2) ? n1 : n2;
}

function seamDepth(edgeLength: number, allowance: number): number {
  const defaultDepth = edgeLength * 0.08;
  const requestedDepth = allowance > 0 ? allowance : defaultDepth;
  const maxDepth = edgeLength * 0.35;
  return Math.min(Math.max(requestedDepth, edgeLength * 0.03), maxDepth);
}

function buildOverlapFlap(a: Point2, b: Point2, normal: Pt2, depth: number): Point2[] {
  const aOut = add2(a, scale2(normal, depth));
  const bOut = add2(b, scale2(normal, depth));
  return [a, aOut, bOut, b];
}

function buildTabbedFlap(a: Point2, b: Point2, normal: Pt2, depth: number): Point2[] {
  const edge = sub2(b, a);
  const length = len2(edge);
  const along = unit2(edge);
  const segmentCount = Math.max(4, Math.min(10, Math.round(length / 30) * 2));
  const points: Point2[] = [a];

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const base = add2(a, scale2(along, length * t));
    const toothDepth =
      i === 0 || i === segmentCount ? depth : i % 2 === 0 ? depth * 0.6 : depth * 1.15;
    points.push(add2(base, scale2(normal, toothDepth)));
  }

  points.push(b);
  return points;
}

function buildTemplatePathsFromNet(net: NetModel, seam: SeamOptions): LayerPath[] {
  const edgeMap = new Map<string, { a: Point2; b: Point2; count: number; key: string }>();

  for (const face of net.faces) {
    const pts = face.points;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const key = edgeKey(a, b);
      const existing = edgeMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        edgeMap.set(key, { a, b, count: 1, key });
      }
    }
  }

  const boundaryEdges = Array.from(edgeMap.values())
    .filter((edge) => edge.count === 1)
    .map((edge) => ({ key: edge.key, a: edge.a, b: edge.b }));
  const cutEdges: LayerPath[] = [];
  const scoreEdges: LayerPath[] = [];
  const seamEdge = seam.mode === "straight" ? undefined : pickSeamBoundaryEdge(boundaryEdges);

  for (const edge of edgeMap.values()) {
    if (edge.count === 1) {
      if (seamEdge && seamEdge.key === edge.key) {
        scoreEdges.push(withLayer("score", [edge.a, edge.b], false));
      } else {
        cutEdges.push(withLayer("cut", [edge.a, edge.b], false));
      }
    } else if (edge.count === 2) {
      scoreEdges.push(withLayer("score", [edge.a, edge.b], false));
    } else {
      throw new Error("Invalid net: more than two faces share the same unfolded edge");
    }
  }

  if (seamEdge && seam.mode !== "straight") {
    const allPoints = net.faces.flatMap((face) => face.points);
    const centroid = centroid2(allPoints);
    const normal = seamNormal(seamEdge.a, seamEdge.b, centroid);
    const length = edgeLength2D(seamEdge.a, seamEdge.b);
    const depth = seamDepth(length, seam.allowance);
    const flapPoints =
      seam.mode === "tabbed"
        ? buildTabbedFlap(seamEdge.a, seamEdge.b, normal, depth)
        : buildOverlapFlap(seamEdge.a, seamEdge.b, normal, depth);

    cutEdges.push(withLayer("cut", flapPoints, false));
  }

  return [...cutEdges, ...scoreEdges];
}

function determineKind(def: ShapeDefinition, counts: SegmentCounts): "prism" | "frustum" | "pyramid" {
  if (counts.top === 1) {
    return "pyramid";
  }

  if (Math.abs(def.topWidth - def.bottomWidth) < EPSILON) {
    return "prism";
  }

  return "frustum";
}

function meshSurfaceArea(mesh: MeshModel): number {
  let area = 0;

  for (const [aIndex, bIndex, cIndex] of mesh.triangles) {
    const a = mesh.vertices[aIndex];
    const b = mesh.vertices[bIndex];
    const c = mesh.vertices[cIndex];
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cross = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    area += 0.5 * Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);
  }

  return area;
}

function computeMetrics(def: ShapeDefinition, mesh: MeshModel, counts: SegmentCounts): ShapeDebugModel["metrics"] {
  const bottomRadius = def.bottomWidth / 2;
  const topRadius = counts.top === 1 ? 0 : def.topWidth / 2;
  const slantHeight = Math.sqrt((topRadius - bottomRadius) ** 2 + def.height ** 2);

  return {
    bottomRadius,
    topRadius,
    slantHeight,
    surfaceArea: meshSurfaceArea(mesh),
    faceCount: mesh.faces.length
  };
}

function computePolyhedronMetrics(mesh: MeshModel): ShapeDebugModel["metrics"] {
  const maxRadius = mesh.vertices.reduce(
    (max, vertex) => Math.max(max, Math.sqrt(vertex.x ** 2 + vertex.y ** 2 + vertex.z ** 2)),
    0
  );
  const edgeLength = minNonZeroEdge(mesh.vertices);

  return {
    bottomRadius: Math.max(maxRadius, EPSILON),
    topRadius: 0,
    slantHeight: Math.max(edgeLength, EPSILON),
    surfaceArea: meshSurfaceArea(mesh),
    faceCount: mesh.faces.length
  };
}

function buildWarnings(def: ShapeDefinition): string[] {
  const warnings: string[] = [];
  if (def.profilePoints.length > 0) {
    warnings.push("profilePoints are ignored in polygonal v2 geometry");
  }
  if (def.thickness >= def.bottomWidth / 2) {
    warnings.push("thickness is high relative to base radius; fabrication may be difficult");
  }
  if (def.generationMode === "polyhedron" && def.polyhedron?.faceMode === "mixed") {
    warnings.push("Mixed-face polyhedron presets are experimental and may need manual net adjustments");
  }

  return warnings;
}

export function buildShapeDebugModel(def: ShapeDefinition): ShapeDebugModel {
  const counts = resolveSegmentCounts(def);
  validateShapeDefinition(def, counts);
  const warnings = buildWarnings(def);

  if (def.generationMode === "polyhedron") {
    const polyhedron = def.polyhedron;
    if (!polyhedron) {
      throw new Error("Invalid shape: polyhedron definition missing");
    }

    const mesh = buildPolyhedronMesh(polyhedron.preset, polyhedron.edgeLength, polyhedron.ringSides);
    const net = buildPolyhedronNet(mesh);
    const rawPaths = buildTemplatePathsFromNet(net, { mode: def.seamMode, allowance: def.allowance });
    const normalizedPaths = normalizePaths(rawPaths, 10);
    const bounds = buildBounds(normalizedPaths);
    const template: FlattenedTemplate = {
      units: def.units,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
      paths: normalizedPaths
    };

    return {
      kind: "polyhedron",
      counts: { bottom: mesh.faces.length, top: mesh.faces.length },
      mesh,
      net,
      template,
      warnings,
      metrics: computePolyhedronMetrics(mesh)
    };
  }

  const mesh = buildMesh(def, counts);
  const net = buildNet(mesh, counts);
  const rawPaths = buildTemplatePathsFromNet(net, { mode: def.seamMode, allowance: def.allowance });
  const normalizedPaths = normalizePaths(rawPaths, 10);
  const bounds = buildBounds(normalizedPaths);
  const template: FlattenedTemplate = {
    units: def.units,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    paths: normalizedPaths
  };

  return {
    kind: determineKind(def, counts),
    counts,
    mesh,
    net,
    template,
    warnings,
    metrics: computeMetrics(def, mesh, counts)
  };
}

export function buildCanonicalGeometry(def: ShapeDefinition): CanonicalGeometry {
  const shape = buildShapeDebugModel(def);

  return {
    kind: shape.kind,
    metrics: {
      bottomRadius: shape.metrics.bottomRadius,
      topRadius: shape.metrics.topRadius,
      slantHeight: shape.metrics.slantHeight,
      surfaceArea: shape.metrics.surfaceArea,
      faceCount: shape.metrics.faceCount
    },
    template: shape.template,
    warnings: shape.warnings
  };
}

function pointsToPath(points: Point2[], closed: boolean): string {
  if (points.length === 0) {
    return "";
  }

  let d = `M ${points[0].x.toFixed(4)} ${points[0].y.toFixed(4)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x.toFixed(4)} ${points[i].y.toFixed(4)}`;
  }
  if (closed) {
    d += " Z";
  }
  return d;
}

function defaultLayerStyle(layer: SvgLayer): SvgLayerStyle {
  if (layer === "cut") {
    return {
      fill: "none",
      stroke: "#111",
      strokeWidth: 0.2
    };
  }

  if (layer === "score") {
    return {
      fill: "none",
      stroke: "#0a66c2",
      strokeWidth: 0.15,
      strokeDasharray: "1 1"
    };
  }

  return {
    fill: "none",
    stroke: "#888",
    strokeWidth: 0.1,
    strokeDasharray: "0.6 0.6"
  };
}

function styleObjectToString(style: SvgLayerStyle): string {
  const parts = [
    `fill:${style.fill ?? "none"}`,
    `stroke:${style.stroke}`,
    `stroke-width:${style.strokeWidth}`
  ];
  if (style.strokeDasharray) {
    parts.push(`stroke-dasharray:${style.strokeDasharray}`);
  }
  if (style.strokeLinecap) {
    parts.push(`stroke-linecap:${style.strokeLinecap}`);
  }
  if (style.strokeLinejoin) {
    parts.push(`stroke-linejoin:${style.strokeLinejoin}`);
  }
  if (style.strokeOpacity !== undefined) {
    parts.push(`stroke-opacity:${style.strokeOpacity}`);
  }
  return parts.join(";");
}

function mergedLayerStyle(
  layer: SvgLayer,
  options: TemplateSvgRenderOptions | undefined
): SvgLayerStyle {
  const base = defaultLayerStyle(layer);
  const overrides = options?.layerStyles?.[layer];
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...overrides
  };
}

export function renderTemplateSvg(
  geometry: CanonicalGeometry,
  options?: TemplateSvgRenderOptions
): string {
  const width = geometry.template.width.toFixed(3);
  const height = geometry.template.height.toFixed(3);
  const unit = geometry.template.units;
  const backgroundRect = options?.backgroundColor
    ? `  <rect x="0" y="0" width="${width}" height="${height}" fill="${options.backgroundColor}" />\n`
    : "";

  const groups = ["cut", "score", "guide"]
    .map((layer) => {
      const paths = geometry.template.paths.filter((path) => path.layer === layer);
      const pathEls = paths
        .map(
          (path) =>
            `<path class="${path.layer}" style="${styleObjectToString(mergedLayerStyle(path.layer, options))}" d="${pointsToPath(path.points, path.closed)}" />`
        )
        .join("\n    ");

      return `  <g id="${layer}">\n    ${pathEls}\n  </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}${unit}" height="${height}${unit}" viewBox="0 0 ${width} ${height}">\n${backgroundRect}${groups}\n</svg>`;
}

function unitToPdfScale(units: "mm" | "in"): number {
  return units === "mm" ? 72 / 25.4 : 72;
}

function pdfStyleForLayer(layer: SvgLayer): { color: [number, number, number]; lineWidth: number; dash?: string } {
  if (layer === "cut") {
    return { color: [0.07, 0.07, 0.07], lineWidth: 0.6 };
  }
  if (layer === "score") {
    return { color: [0.04, 0.4, 0.76], lineWidth: 0.45, dash: "[2 2] 0 d" };
  }
  return { color: [0.5, 0.5, 0.5], lineWidth: 0.3, dash: "[1.2 1.2] 0 d" };
}

const UTF8_ENCODER = new TextEncoder();

function utf8ByteLength(input: string): number {
  return UTF8_ENCODER.encode(input).length;
}

function buildPdf(objects: string[]): string {
  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(utf8ByteLength(output));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = utf8ByteLength(output);
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return output;
}

export function renderTemplatePdf(geometry: CanonicalGeometry): string {
  const scale = unitToPdfScale(geometry.template.units);
  const margin = 18;
  const widthPt = geometry.template.width * scale;
  const heightPt = geometry.template.height * scale;
  const pageWidth = widthPt + margin * 2;
  const pageHeight = heightPt + margin * 2;
  let content = "q\n";
  content += `1 0 0 1 ${margin.toFixed(3)} ${margin.toFixed(3)} cm\n`;

  for (const layer of ["cut", "score", "guide"] as const) {
    const style = pdfStyleForLayer(layer);
    content += `${style.color[0].toFixed(3)} ${style.color[1].toFixed(3)} ${style.color[2].toFixed(3)} RG\n`;
    content += `${style.lineWidth.toFixed(3)} w\n`;
    content += `${style.dash ?? "[] 0 d"}\n`;

    for (const path of geometry.template.paths.filter((p) => p.layer === layer)) {
      if (path.points.length < 2) continue;

      const first = path.points[0];
      const startX = first.x * scale;
      const startY = (geometry.template.height - first.y) * scale;
      content += `${startX.toFixed(3)} ${startY.toFixed(3)} m\n`;

      for (let i = 1; i < path.points.length; i += 1) {
        const pt = path.points[i];
        const x = pt.x * scale;
        const y = (geometry.template.height - pt.y) * scale;
        content += `${x.toFixed(3)} ${y.toFixed(3)} l\n`;
      }

      if (path.closed) {
        content += "h\n";
      }

      content += "S\n";
    }
  }

  content += "Q\n";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${utf8ByteLength(content)} >>\nstream\n${content}endstream`
  ];

  return buildPdf(objects);
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: Vec3): Vec3 {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (mag <= EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

function facet(a: Vec3, b: Vec3, c: Vec3): string {
  const n = normalize(cross(subVec(b, a), subVec(c, a)));
  const f = (v: number) => v.toFixed(6);
  return [
    `  facet normal ${f(n.x)} ${f(n.y)} ${f(n.z)}`,
    "    outer loop",
    `      vertex ${f(a.x)} ${f(a.y)} ${f(a.z)}`,
    `      vertex ${f(b.x)} ${f(b.y)} ${f(b.z)}`,
    `      vertex ${f(c.x)} ${f(c.y)} ${f(c.z)}`,
    "    endloop",
    "  endfacet"
  ].join("\n");
}

export function renderTemplateStl(shapeDefinition: ShapeDefinition): string {
  const shape = buildShapeDebugModel(shapeDefinition);

  const lines: string[] = ["solid pottery_template"];
  for (const [aIndex, bIndex, cIndex] of shape.mesh.triangles) {
    const a = shape.mesh.vertices[aIndex];
    const b = shape.mesh.vertices[bIndex];
    const c = shape.mesh.vertices[cIndex];
    lines.push(facet(a, b, c));
  }
  lines.push("endsolid pottery_template");

  return lines.join("\n");
}

function projectPoint(
  p: { x: number; y: number; z: number },
  yaw = -0.7,
  pitch = 0.45
): { x: number; y: number; depth: number } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = p.x * cy - p.y * sy;
  const y1 = p.x * sy + p.y * cy;
  const z1 = p.z;

  const x2 = x1;
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  return { x: x2, y: -z2, depth: y2 };
}

function edgeKeyFromIndexPair(a: number, b: number): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildWireframePreview(def: ShapeDefinition, camera: WireframeCamera = {}): WireframePreview {
  const shape = buildShapeDebugModel(def);
  const yaw = camera.yaw ?? -0.7;
  const pitch = camera.pitch ?? 0.45;

  const uniqueEdges = new Map<string, [number, number]>();
  for (const face of shape.mesh.faces) {
    const indices = face.vertexIndices;
    for (let i = 0; i < indices.length; i += 1) {
      const a = indices[i];
      const b = indices[(i + 1) % indices.length];
      const key = edgeKeyFromIndexPair(a, b);
      if (!uniqueEdges.has(key)) {
        uniqueEdges.set(key, [a, b]);
      }
    }
  }

  const rawLines = Array.from(uniqueEdges.values()).map(([aIndex, bIndex]) => {
    const a = projectPoint(shape.mesh.vertices[aIndex], yaw, pitch);
    const b = projectPoint(shape.mesh.vertices[bIndex], yaw, pitch);
    return { a, b };
  });

  const xs = rawLines.flatMap((l) => [l.a.x, l.b.x]);
  const ys = rawLines.flatMap((l) => [l.a.y, l.b.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 460;
  const height = 320;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - 32) / spanX, (height - 32) / spanY);

  const lines = rawLines.map((l) => ({
    x1: 16 + (l.a.x - minX) * scale,
    y1: 16 + (l.a.y - minY) * scale,
    x2: 16 + (l.b.x - minX) * scale,
    y2: 16 + (l.b.y - minY) * scale
  }));

  return { width, height, lines };
}

export function createWireframeSvg(preview: WireframePreview, options?: WireframeSvgRenderOptions): string {
  const stroke = options?.stroke ?? "#111";
  const strokeWidth = options?.strokeWidth ?? 1.2;
  const backgroundRect = options?.backgroundColor
    ? `  <rect x="0" y="0" width="${preview.width}" height="${preview.height}" fill="${options.backgroundColor}" />\n`
    : "";
  const lineEls = preview.lines
    .map(
      (line) =>
        `<line x1="${line.x1.toFixed(3)}" y1="${line.y1.toFixed(3)}" x2="${line.x2.toFixed(3)}" y2="${line.y2.toFixed(3)}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    )
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${preview.width}" height="${preview.height}" viewBox="0 0 ${preview.width} ${preview.height}">\n${backgroundRect}  ${lineEls}\n</svg>`;
}

export function meshEdgeIncidence(mesh: MeshModel): Map<string, number[]> {
  const map = new Map<string, number[]>();

  for (const face of mesh.faces) {
    for (let i = 0; i < face.vertexIndices.length; i += 1) {
      const a = face.vertexIndices[i];
      const b = face.vertexIndices[(i + 1) % face.vertexIndices.length];
      const key = edgeKeyFromIndexPair(a, b);
      const entries = map.get(key);
      if (entries) {
        entries.push(face.id);
      } else {
        map.set(key, [face.id]);
      }
    }
  }

  return map;
}

export function faceEdgeLengths3D(mesh: MeshModel, face: Face3D): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < face.vertexIndices.length; i += 1) {
    const a = mesh.vertices[face.vertexIndices[i]];
    const b = mesh.vertices[face.vertexIndices[(i + 1) % face.vertexIndices.length]];
    lengths.push(edgeLength3D(a, b));
  }
  return lengths;
}

export function faceEdgeLengths2D(face: NetFace): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < face.points.length; i += 1) {
    const a = face.points[i];
    const b = face.points[(i + 1) % face.points.length];
    lengths.push(edgeLength2D(a, b));
  }
  return lengths;
}
