import { w as head, x as attr, y as ensure_array_like, z as attr_class } from "../../chunks/index.js";
import { l as escape_html } from "../../chunks/context.js";
const TWO_PI = Math.PI * 2;
const EPSILON = 1e-9;
const NET_EPSILON = 1e-6;
function resolveSegmentCounts(shape) {
  const base = Math.max(1, Math.floor(shape.segments ?? 1));
  return {
    bottom: Math.max(1, Math.floor(shape.bottomSegments ?? base)),
    top: Math.max(1, Math.floor(shape.topSegments ?? base))
  };
}
function validateShapeDefinition(def, counts) {
  if (def.generationMode === "polyhedron") {
    if (!def.polyhedron) {
      throw new Error("Invalid shape: polyhedron mode requires a polyhedron preset definition");
    }
    if (!(def.polyhedron.edgeLength > 0)) {
      throw new Error("Invalid shape: polyhedron edgeLength must be greater than 0");
    }
    if (def.polyhedron.preset === "regularPrism" || def.polyhedron.preset === "regularAntiprism" || def.polyhedron.preset === "regularBipyramid") {
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
    throw new Error("Unsupported shape family: top edge count must be 1 (pyramid) or match bottom edge count");
  }
}
function buildBounds(paths) {
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
function withLayer(layer, points, closed = false) {
  return { layer, points, closed };
}
function translatePoints(points, dx, dy) {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}
function normalizePaths(paths, padding = 10) {
  const bounds = buildBounds(paths);
  const dx = padding - bounds.minX;
  const dy = padding - bounds.minY;
  return paths.map((path) => ({ ...path, points: translatePoints(path.points, dx, dy) }));
}
function pointKey(p) {
  const qx = Math.round(p.x / NET_EPSILON) * NET_EPSILON;
  const qy = Math.round(p.y / NET_EPSILON) * NET_EPSILON;
  return `${qx.toFixed(6)},${qy.toFixed(6)}`;
}
function edgeKey(a, b) {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}
function edgeLength3D(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function sub2(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add2(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale2(v, s) {
  return { x: v.x * s, y: v.y * s };
}
function dot2(a, b) {
  return a.x * b.x + a.y * b.y;
}
function len2(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}
function unit2(v) {
  const mag = len2(v);
  if (mag <= EPSILON)
    return { x: 1, y: 0 };
  return scale2(v, 1 / mag);
}
function rotate2(v, angle) {
  return {
    x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
    y: v.x * Math.sin(angle) + v.y * Math.cos(angle)
  };
}
function centroid2(points) {
  if (points.length === 0)
    return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}
function mapPanelToEdge(local, edgeStart, edgeEnd) {
  const l0 = local.a;
  const l1 = local.d;
  const vL = sub2(l1, l0);
  const vW = sub2(edgeEnd, edgeStart);
  const ul = unit2(vL);
  const vl = { x: -ul.y, y: ul.x };
  const uw = unit2(vW);
  const vw = { x: -uw.y, y: uw.x };
  const s = len2(vW) / Math.max(len2(vL), EPSILON);
  const mapPoint = (p) => {
    const d = sub2(p, l0);
    const a = dot2(d, ul);
    const b = dot2(d, vl);
    return add2(edgeStart, add2(scale2(uw, a * s), scale2(vw, b * s)));
  };
  return {
    a: mapPoint(local.a),
    b: mapPoint(local.b),
    c: mapPoint(local.c),
    d: mapPoint(local.d)
  };
}
function mapTriangleToEdge(local, edgeStart, edgeEnd) {
  const l0 = local.a;
  const l1 = local.c;
  const vL = sub2(l1, l0);
  const vW = sub2(edgeEnd, edgeStart);
  const ul = unit2(vL);
  const vl = { x: -ul.y, y: ul.x };
  const uw = unit2(vW);
  const vw = { x: -uw.y, y: uw.x };
  const s = len2(vW) / Math.max(len2(vL), EPSILON);
  const mapPoint = (p) => {
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
function polygonFromAttachedEdge(edgeStart, edgeEnd, sides, outwardHint) {
  const edge = sub2(edgeEnd, edgeStart);
  const exterior = TWO_PI / sides;
  const build = (sign) => {
    const points = [edgeStart, edgeEnd];
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
function triangulateFace(face) {
  const triangles = [];
  const [v0, ...rest] = face.vertexIndices;
  for (let i = 0; i < rest.length - 1; i += 1) {
    triangles.push([v0, rest[i], rest[i + 1]]);
  }
  return triangles;
}
function buildMesh(def, counts) {
  const n = counts.bottom;
  const h = def.height;
  const bottomRadius = def.bottomWidth / 2;
  const topRadius = counts.top === 1 ? 0 : def.topWidth / 2;
  const vertices = [];
  const faces = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI;
    vertices.push({ x: Math.cos(t) * bottomRadius, y: Math.sin(t) * bottomRadius, z: 0 });
  }
  const topOffset = vertices.length;
  if (counts.top === 1) {
    vertices.push({ x: 0, y: 0, z: h });
  } else {
    for (let i = 0; i < n; i += 1) {
      const t = i / n * TWO_PI;
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
      const t1 = topOffset + (i + 1) % n;
      faces.push({ id: faceId, kind: "side", vertexIndices: [b0, b1, t1, t0] });
    }
    faceId += 1;
  }
  const bottomFace = {
    id: faceId,
    kind: "bottom",
    vertexIndices: [...Array(n).keys()].reverse()
  };
  faces.push(bottomFace);
  faceId += 1;
  if (counts.top > 1) {
    const topFace = {
      id: faceId,
      kind: "top",
      vertexIndices: Array.from({ length: n }, (_, i) => topOffset + i)
    };
    faces.push(topFace);
  }
  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}
function buildFrustumLikeNet(mesh, counts) {
  const n = counts.bottom;
  const sideFaces = mesh.faces.filter((face) => face.kind === "side");
  const bottomFace = mesh.faces.find((face) => face.kind === "bottom");
  const topFace = mesh.faces.find((face) => face.kind === "top");
  if (!bottomFace) {
    throw new Error("Invariant violation: bottom face missing");
  }
  const bottomSide = edgeLength3D(mesh.vertices[0], mesh.vertices[1]);
  const topSide = topFace ? edgeLength3D(mesh.vertices[topFace.vertexIndices[0]], mesh.vertices[topFace.vertexIndices[1]]) : 0;
  const firstSide = sideFaces[0];
  const lateral = edgeLength3D(mesh.vertices[firstSide.vertexIndices[0]], mesh.vertices[firstSide.vertexIndices[firstSide.vertexIndices.length - 1]]);
  const inset = (bottomSide - topSide) / 2;
  const riseSquared = lateral * lateral - inset * inset;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: side face collapsed during net construction");
  }
  const rise = Math.sqrt(riseSquared);
  const local = {
    a: { x: 0, y: 0 },
    b: { x: topSide, y: 0 },
    c: { x: topSide + inset, y: rise },
    d: { x: inset, y: rise }
  };
  const panels = [{ ...local }];
  for (let i = 1; i < n; i += 1) {
    const prev = panels[i - 1];
    panels.push(mapPanelToEdge(local, prev.b, prev.c));
  }
  const netFaces = panels.map((panel, i) => ({
    faceId: sideFaces[i].id,
    points: [panel.a, panel.b, panel.c, panel.d]
  }));
  const stripCentroid = centroid2(panels.flatMap((panel) => [panel.a, panel.b, panel.c, panel.d]));
  const attachPanelIndex = Math.floor((n - 1) / 2);
  const attachPanel = panels[attachPanelIndex];
  const bottomAttach = { p0: attachPanel.d, p1: attachPanel.c };
  const bottomOut = sub2(scale2(add2(bottomAttach.p0, bottomAttach.p1), 0.5), stripCentroid);
  const bottomCap = polygonFromAttachedEdge(bottomAttach.p0, bottomAttach.p1, n, bottomOut);
  netFaces.push({ faceId: bottomFace.id, points: bottomCap });
  if (topFace) {
    const topAttach = { p0: attachPanel.a, p1: attachPanel.b };
    const topOut = sub2(scale2(add2(topAttach.p0, topAttach.p1), 0.5), stripCentroid);
    const topCap = polygonFromAttachedEdge(topAttach.p0, topAttach.p1, n, topOut);
    netFaces.push({ faceId: topFace.id, points: topCap });
  }
  return { faces: netFaces };
}
function buildPyramidNet(mesh, counts) {
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
  const local = {
    a: { x: 0, y: 0 },
    b: { x: lateral * Math.cos(apexSweep), y: lateral * Math.sin(apexSweep) },
    c: { x: lateral, y: 0 }
  };
  const triangles = [{ ...local }];
  for (let i = 1; i < n; i += 1) {
    const prev = triangles[i - 1];
    triangles.push(mapTriangleToEdge(local, prev.a, prev.b));
  }
  const netFaces = triangles.map((tri2, i) => ({
    faceId: sideFaces[i].id,
    points: [tri2.a, tri2.b, tri2.c]
  }));
  const stripCentroid = centroid2(triangles.flatMap((tri2) => [tri2.a, tri2.b, tri2.c]));
  const attachIndex = Math.floor((n - 1) / 2);
  const tri = triangles[attachIndex];
  const baseAttach = { p0: tri.c, p1: tri.b };
  const out = sub2(scale2(add2(baseAttach.p0, baseAttach.p1), 0.5), stripCentroid);
  const baseCap = polygonFromAttachedEdge(baseAttach.p0, baseAttach.p1, n, out);
  netFaces.push({ faceId: bottomFace.id, points: baseCap });
  return { faces: netFaces };
}
function buildNet(mesh, counts) {
  return counts.top === 1 ? buildPyramidNet(mesh, counts) : buildFrustumLikeNet(mesh, counts);
}
function vec(x, y, z) {
  return { x, y, z };
}
function addVec(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scaleVec(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function dotVec(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function polygonArea2(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}
function ensureCounterClockwise2(points) {
  return polygonArea2(points) >= 0 ? points : [...points].reverse();
}
function cross2d(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function lineIntersection2(p1, p2, q1, q2) {
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
function clipConvexPolygon2(subject, clip) {
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
function overlapAreaConvex2(a, b) {
  const clipped = clipConvexPolygon2(a, b);
  if (clipped.length < 3) {
    return 0;
  }
  return Math.abs(polygonArea2(clipped));
}
function mapPolygonToEdge(localPoints, localEdgeStart, localEdgeEnd, worldEdgeStart, worldEdgeEnd, mirror = false) {
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
function faceProjection2D(mesh, face) {
  const ids = face.vertexIndices;
  const a = mesh.vertices[ids[0]];
  const b = mesh.vertices[ids[1]];
  const c = mesh.vertices[ids[2]];
  const u = normalize(subVec(b, a));
  const n = normalize(cross$1(subVec(b, a), subVec(c, a)));
  const v = normalize(cross$1(n, u));
  const points = ids.map((id) => {
    const p = mesh.vertices[id];
    const rel = subVec(p, a);
    return {
      x: dotVec(rel, u),
      y: dotVec(rel, v)
    };
  });
  const byVertex = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += 1) {
    byVertex.set(ids[i], points[i]);
  }
  return {
    points,
    centroid: centroid2(points),
    byVertex
  };
}
function edgePlaneSide(edgeStart, edgeEnd, point) {
  const edge = sub2(edgeEnd, edgeStart);
  const normal = { x: -edge.y, y: edge.x };
  const rel = sub2(point, scale2(add2(edgeStart, edgeEnd), 0.5));
  return dot2(rel, normal);
}
function buildFaceAdjacency(mesh) {
  const edgeOwners = /* @__PURE__ */ new Map();
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
  const adjacency = /* @__PURE__ */ new Map();
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
function quantize(value, precision = 1e-6) {
  return Math.round(value / precision) * precision;
}
function planeKey(normal, d) {
  return `${quantize(normal.x)}|${quantize(normal.y)}|${quantize(normal.z)}|${quantize(d)}`;
}
function sortFaceVertices(vertices, indices, normal) {
  const center = indices.map((index) => vertices[index]).reduce((acc, v2) => addVec(acc, v2), vec(0, 0, 0));
  const centroid = scaleVec(center, 1 / indices.length);
  const ref = Math.abs(normal.z) < 0.9 ? vec(0, 0, 1) : vec(0, 1, 0);
  const u = normalize(cross$1(ref, normal));
  const v = normalize(cross$1(normal, u));
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
    const winding = dotVec(normalize(cross$1(subVec(p1, p0), subVec(p2, p1))), normal);
    if (winding < 0) {
      ordered.reverse();
    }
  }
  return ordered;
}
function buildConvexHullFaces(vertices) {
  const center = scaleVec(vertices.reduce((acc, v) => addVec(acc, v), vec(0, 0, 0)), 1 / vertices.length);
  const planeBuckets = /* @__PURE__ */ new Map();
  const planeTolerance = 1e-6;
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        let normal = cross$1(subVec(b, a), subVec(c, a));
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
        const bucket = planeBuckets.get(key) ?? { normal, d, vertices: /* @__PURE__ */ new Set() };
        for (let p = 0; p < vertices.length; p += 1) {
          if (Math.abs(dotVec(normal, vertices[p]) - d) <= planeTolerance * 4) {
            bucket.vertices.add(p);
          }
        }
        planeBuckets.set(key, bucket);
      }
    }
  }
  const faces = [];
  for (const bucket of planeBuckets.values()) {
    const indices = Array.from(bucket.vertices);
    if (indices.length < 3) {
      continue;
    }
    faces.push(sortFaceVertices(vertices, indices, bucket.normal));
  }
  return faces;
}
function signedPermutationsOf0102() {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ];
  const dedupe = /* @__PURE__ */ new Map();
  for (const perm of perms) {
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const values = perm.map((value) => {
          if (value === 0)
            return 0;
          if (value === 1)
            return s1;
          return s2 * 2;
        });
        const v = vec(values[0], values[1], values[2]);
        dedupe.set(`${v.x},${v.y},${v.z}`, v);
      }
    }
  }
  return Array.from(dedupe.values());
}
function rawPresetVertices(preset) {
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
      const out = [];
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
      const out = [];
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
function minNonZeroEdge(vertices) {
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
function scalePresetVertices(vertices, edgeLength) {
  const baseEdge = minNonZeroEdge(vertices);
  if (!Number.isFinite(baseEdge) || baseEdge <= EPSILON) {
    throw new Error("Invalid polyhedron preset: unable to resolve edge length");
  }
  const scale = edgeLength / baseEdge;
  return vertices.map((v) => scaleVec(v, scale));
}
function buildRegularPrismMesh(ringSides, edgeLength) {
  const n = Math.max(3, Math.floor(ringSides));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const halfHeight = edgeLength / 2;
  const vertices = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: -halfHeight });
  }
  const topOffset = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: halfHeight });
  }
  const faces = [];
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
function buildRegularAntiprismMesh(ringSides, edgeLength) {
  const n = Math.max(3, Math.floor(ringSides));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const planarOffset = 2 * radius * Math.sin(Math.PI / (2 * n));
  const riseSquared = edgeLength * edgeLength - planarOffset * planarOffset;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: regularAntiprism side rise collapsed");
  }
  const halfHeight = Math.sqrt(riseSquared) / 2;
  const vertices = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: -halfHeight });
  }
  const topOffset = vertices.length;
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI + Math.PI / n;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: halfHeight });
  }
  const faces = [];
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
function buildRegularBipyramidMesh(ringSides, edgeLength) {
  const n = Math.max(3, Math.min(5, Math.floor(ringSides)));
  const radius = edgeLength / (2 * Math.sin(Math.PI / n));
  const riseSquared = edgeLength * edgeLength - radius * radius;
  if (riseSquared <= EPSILON) {
    throw new Error("Invalid shape: regularBipyramid apex height collapsed");
  }
  const apexHeight = Math.sqrt(riseSquared);
  const vertices = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / n * TWO_PI;
    vertices.push({ x: Math.cos(t) * radius, y: Math.sin(t) * radius, z: 0 });
  }
  const topApex = vertices.length;
  vertices.push({ x: 0, y: 0, z: apexHeight });
  const bottomApex = vertices.length;
  vertices.push({ x: 0, y: 0, z: -apexHeight });
  const faces = [];
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
function buildPolyhedronMesh(preset, edgeLength, ringSides) {
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
  const faces = faceIndices.map((indices, id) => ({
    id,
    kind: "poly",
    vertexIndices: indices
  }));
  const triangles = faces.flatMap((face) => triangulateFace(face));
  return { vertices, faces, triangles };
}
function buildPolyhedronNet(mesh) {
  const byId = new Map(mesh.faces.map((face) => [face.id, face]));
  const projections = new Map(mesh.faces.map((face) => [face.id, faceProjection2D(mesh, face)]));
  const adjacency = buildFaceAdjacency(mesh);
  const rootFace = mesh.faces.reduce((best, current) => current.vertexIndices.length > best.vertexIndices.length ? current : best);
  const placed = /* @__PURE__ */ new Map();
  placed.set(rootFace.id, projections.get(rootFace.id));
  while (placed.size < mesh.faces.length) {
    let bestPlacement;
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
          const byVertex = /* @__PURE__ */ new Map();
          for (let i = 0; i < neighborFace.vertexIndices.length; i += 1) {
            byVertex.set(neighborFace.vertexIndices[i], points[i]);
          }
          const centroid = centroid2(points);
          const parentSide = edgePlaneSide(worldA, worldB, parentProjection.centroid);
          const childSide = edgePlaneSide(worldA, worldB, centroid);
          const sidePenalty = Math.abs(parentSide) < 1e-8 || Math.abs(childSide) < 1e-8 || parentSide * childSide < 0 ? 0 : 1e4;
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
function buildTemplatePathsFromNet(net) {
  const edgeMap = /* @__PURE__ */ new Map();
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
        edgeMap.set(key, { a, b, count: 1 });
      }
    }
  }
  const cutEdges = [];
  const scoreEdges = [];
  for (const edge of edgeMap.values()) {
    if (edge.count === 1) {
      cutEdges.push(withLayer("cut", [edge.a, edge.b], false));
    } else if (edge.count === 2) {
      scoreEdges.push(withLayer("score", [edge.a, edge.b], false));
    } else {
      throw new Error("Invalid net: more than two faces share the same unfolded edge");
    }
  }
  return [...cutEdges, ...scoreEdges];
}
function determineKind(def, counts) {
  if (counts.top === 1) {
    return "pyramid";
  }
  if (Math.abs(def.topWidth - def.bottomWidth) < EPSILON) {
    return "prism";
  }
  return "frustum";
}
function meshSurfaceArea(mesh) {
  let area = 0;
  for (const [aIndex, bIndex, cIndex] of mesh.triangles) {
    const a = mesh.vertices[aIndex];
    const b = mesh.vertices[bIndex];
    const c = mesh.vertices[cIndex];
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cross2 = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x
    };
    area += 0.5 * Math.sqrt(cross2.x * cross2.x + cross2.y * cross2.y + cross2.z * cross2.z);
  }
  return area;
}
function computeMetrics(def, mesh, counts) {
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
function computePolyhedronMetrics(mesh) {
  const maxRadius = mesh.vertices.reduce((max, vertex) => Math.max(max, Math.sqrt(vertex.x ** 2 + vertex.y ** 2 + vertex.z ** 2)), 0);
  const edgeLength = minNonZeroEdge(mesh.vertices);
  return {
    bottomRadius: Math.max(maxRadius, EPSILON),
    topRadius: 0,
    slantHeight: Math.max(edgeLength, EPSILON),
    surfaceArea: meshSurfaceArea(mesh),
    faceCount: mesh.faces.length
  };
}
function buildWarnings(def) {
  const warnings = [];
  if (def.profilePoints.length > 0) {
    warnings.push("profilePoints are ignored in polygonal v2 geometry");
  }
  if (def.seamMode !== "straight") {
    warnings.push("seamMode is currently rendered as straight seam in polygonal v2 geometry");
  }
  if (def.allowance > 0 && def.seamMode !== "straight") {
    warnings.push("allowance is not yet applied to polygonal seam flap generation");
  }
  if (def.thickness >= def.bottomWidth / 2) {
    warnings.push("thickness is high relative to base radius; fabrication may be difficult");
  }
  if (def.generationMode === "polyhedron" && def.polyhedron?.faceMode === "mixed") {
    warnings.push("Mixed-face polyhedron presets are experimental and may need manual net adjustments");
  }
  return warnings;
}
function buildShapeDebugModel(def) {
  const counts = resolveSegmentCounts(def);
  validateShapeDefinition(def, counts);
  const warnings = buildWarnings(def);
  if (def.generationMode === "polyhedron") {
    const polyhedron = def.polyhedron;
    if (!polyhedron) {
      throw new Error("Invalid shape: polyhedron definition missing");
    }
    const mesh2 = buildPolyhedronMesh(polyhedron.preset, polyhedron.edgeLength, polyhedron.ringSides);
    const net2 = buildPolyhedronNet(mesh2);
    const rawPaths2 = buildTemplatePathsFromNet(net2);
    const normalizedPaths2 = normalizePaths(rawPaths2, 10);
    const bounds2 = buildBounds(normalizedPaths2);
    const template2 = {
      units: def.units,
      width: bounds2.maxX - bounds2.minX,
      height: bounds2.maxY - bounds2.minY,
      paths: normalizedPaths2
    };
    return {
      kind: "polyhedron",
      counts: { bottom: mesh2.faces.length, top: mesh2.faces.length },
      mesh: mesh2,
      net: net2,
      template: template2,
      warnings,
      metrics: computePolyhedronMetrics(mesh2)
    };
  }
  const mesh = buildMesh(def, counts);
  const net = buildNet(mesh, counts);
  const rawPaths = buildTemplatePathsFromNet(net);
  const normalizedPaths = normalizePaths(rawPaths, 10);
  const bounds = buildBounds(normalizedPaths);
  const template = {
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
function buildCanonicalGeometry(def) {
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
function subVec(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross$1(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function normalize(v) {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (mag <= EPSILON)
    return { x: 0, y: 0, z: 0 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}
function edgeKeyFromIndexPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function toPath(points, closed = false) {
  if (points.length === 0) return "";
  const start = points[0];
  let d = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    d += ` L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  }
  if (closed) d += " Z";
  return d;
}
function toShapeDefinition(def) {
  const base = Math.max(1, Math.floor(def.segments || 1));
  return {
    schemaVersion: def.schemaVersion ?? "1.0",
    height: def.height,
    bottomWidth: def.bottomWidth,
    topWidth: def.topWidth,
    thickness: def.thickness ?? 1,
    units: def.units ?? "mm",
    seamMode: def.seamMode,
    allowance: def.allowance,
    notches: def.notches ?? [],
    profilePoints: def.profilePoints ?? [],
    generationMode: def.generationMode ?? "legacy",
    polyhedron: def.polyhedron,
    segments: base,
    bottomSegments: Math.max(1, Math.floor(def.bottomSegments ?? base)),
    topSegments: Math.max(1, Math.floor(def.topSegments ?? base))
  };
}
function emptyTemplate() {
  return {
    width: 460,
    height: 280,
    paths: []
  };
}
function emptySolid() {
  return {
    width: 460,
    height: 320,
    faces: []
  };
}
function normalizeVec(v) {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (mag <= 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}
function rotatePoint(p, yaw = -0.7, pitch = 0.45) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = p.x * cy - p.y * sy;
  const y1 = p.x * sy + p.y * cy;
  const z1 = p.z;
  return {
    x: x1,
    y: y1 * cp - z1 * sp,
    z: y1 * sp + z1 * cp
  };
}
function shadeBlue(intensity) {
  const base = { r: 37, g: 99, b: 235 };
  const clamped = Math.max(0.42, Math.min(1.05, intensity));
  const r = Math.round(base.r * clamped);
  const g = Math.round(base.g * clamped);
  const b = Math.round(base.b * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}
function buildTemplatePreview(def) {
  try {
    const geometry = buildCanonicalGeometry(toShapeDefinition(def));
    return {
      width: geometry.template.width,
      height: geometry.template.height,
      paths: geometry.template.paths.map((path) => ({
        layer: path.layer,
        d: toPath(path.points, path.closed)
      }))
    };
  } catch {
    return emptyTemplate();
  }
}
function buildSolidPreview(def, camera = {}) {
  try {
    const shape = buildShapeDebugModel(toShapeDefinition(def));
    const yaw = camera.yaw ?? -0.7;
    const pitch = camera.pitch ?? 0.45;
    const width = 460;
    const height = 320;
    const rotated = shape.mesh.vertices.map((vertex) => rotatePoint(vertex, yaw, pitch));
    const projected = rotated.map((vertex) => ({
      x: vertex.x,
      y: -vertex.z,
      depth: vertex.y
    }));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - 32) / spanX, (height - 32) / spanY);
    const light = normalizeVec({ x: -0.35, y: 0.72, z: 0.6 });
    const faces = shape.mesh.faces.map((face) => {
      const points = face.vertexIndices.map((index) => ({
        x: 16 + (projected[index].x - minX) * scale,
        y: 16 + (projected[index].y - minY) * scale
      }));
      const a = rotated[face.vertexIndices[0]];
      const b = rotated[face.vertexIndices[1]];
      const c = rotated[face.vertexIndices[2]];
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const normal = normalizeVec(cross(ab, ac));
      const intensity = 0.48 + Math.max(0, normal.x * light.x + normal.y * light.y + normal.z * light.z) * 0.55;
      const depth = face.vertexIndices.reduce((sum, index) => sum + projected[index].depth, 0) / face.vertexIndices.length;
      return {
        points,
        fill: shadeBlue(intensity),
        stroke: "#1d4ed8",
        depth
      };
    }).sort((a, b) => a.depth - b.depth).map((face) => ({
      points: face.points,
      fill: face.fill,
      stroke: face.stroke
    }));
    return { width, height, faces };
  } catch {
    return emptySolid();
  }
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let baseSegments, normalizedPolyhedron, resolvedShapeDefinition, liveTemplate, liveSolid, templateTransform, visibleHistory;
    const POLYHEDRON_ALL_PRESETS = [
      "tetrahedron",
      "cube",
      "octahedron",
      "icosahedron",
      "dodecahedron",
      "cuboctahedron",
      "truncatedOctahedron",
      "regularPrism",
      "regularAntiprism",
      "regularBipyramid"
    ];
    const POLYHEDRON_FAMILY_OPTIONS = [
      {
        value: "regularPrism",
        label: "Regular N-gon Prism",
        faces: "2 n-gons + n squares",
        minSides: 3,
        maxSides: 64,
        defaultSides: 6
      },
      {
        value: "regularAntiprism",
        label: "Regular N-gon Antiprism",
        faces: "2 n-gons + 2n triangles",
        minSides: 3,
        maxSides: 64,
        defaultSides: 6
      },
      {
        value: "regularBipyramid",
        label: "Regular N-gon Bipyramid",
        faces: "2n triangles",
        minSides: 3,
        maxSides: 5,
        defaultSides: 5
      }
    ];
    function isFamilyPreset(preset) {
      return preset === "regularPrism" || preset === "regularAntiprism" || preset === "regularBipyramid";
    }
    function familyOptionForPreset(preset) {
      return POLYHEDRON_FAMILY_OPTIONS.find((option) => option.value === preset) ?? POLYHEDRON_FAMILY_OPTIONS[0];
    }
    function clampSidesForPreset(preset, ringSides) {
      if (!isFamilyPreset(preset)) {
        return 6;
      }
      const family = familyOptionForPreset(preset);
      const value = Math.floor(Number(ringSides) || family.defaultSides);
      return Math.max(family.minSides, Math.min(family.maxSides, value));
    }
    function deriveFaceMode(preset, ringSides) {
      if (preset === "cuboctahedron" || preset === "truncatedOctahedron") {
        return "mixed";
      }
      if (preset === "regularPrism") {
        return ringSides === 4 ? "uniform" : "mixed";
      }
      if (preset === "regularAntiprism") {
        return ringSides === 3 ? "uniform" : "mixed";
      }
      if (preset === "regularBipyramid") {
        return "uniform";
      }
      return "uniform";
    }
    const initialPolyhedron = {
      preset: "cube",
      edgeLength: 60,
      faceMode: "uniform",
      ringSides: 6
    };
    const initialShapeDefinition = {
      schemaVersion: "1.0",
      height: 160,
      bottomWidth: 90,
      topWidth: 120,
      thickness: 6,
      units: "mm",
      seamMode: "straight",
      allowance: 8,
      notches: [],
      profilePoints: [],
      generationMode: "legacy",
      polyhedron: { ...initialPolyhedron },
      segments: 6,
      bottomSegments: 6,
      topSegments: 6
    };
    let shapeDefinition = { ...initialShapeDefinition };
    let exportFormats = ["svg"];
    let historyLoading = false;
    let projectsLoading = false;
    let projects = [];
    let selectedProjectId = "";
    let revisions = [];
    let selectedParentRevisionId = "";
    let newProjectName = "";
    let history = [];
    let onlySelectedProject = false;
    let builderMode = "legacy";
    let useSplitEdges = false;
    let yaw = -0.7;
    let pitch = 0.45;
    let rotating = false;
    let templateZoom = 1;
    let templateRotation = 0;
    let templatePanX = 0;
    let templatePanY = 0;
    let templatePanning = false;
    function normalizePolyhedron(polyhedron) {
      const merged = { ...initialPolyhedron, ...polyhedron };
      const preset = POLYHEDRON_ALL_PRESETS.includes(merged.preset ?? "cube") ? merged.preset : "cube";
      const ringSides = clampSidesForPreset(preset, merged.ringSides);
      return {
        preset,
        edgeLength: Math.max(1, Number(merged.edgeLength) || initialPolyhedron.edgeLength),
        faceMode: deriveFaceMode(preset, ringSides),
        ringSides: isFamilyPreset(preset) ? ringSides : void 0
      };
    }
    baseSegments = Math.max(3, Math.floor(shapeDefinition.segments || 3));
    normalizedPolyhedron = normalizePolyhedron(shapeDefinition.polyhedron);
    isFamilyPreset(normalizedPolyhedron.preset) ? familyOptionForPreset(normalizedPolyhedron.preset) : null;
    resolvedShapeDefinition = {
      ...shapeDefinition,
      generationMode: builderMode,
      polyhedron: shapeDefinition.polyhedron,
      segments: baseSegments,
      bottomSegments: baseSegments,
      topSegments: baseSegments
    };
    liveTemplate = buildTemplatePreview(resolvedShapeDefinition);
    liveSolid = buildSolidPreview(resolvedShapeDefinition, { yaw, pitch });
    templateTransform = `translate(${templatePanX.toFixed(3)} ${templatePanY.toFixed(3)}) translate(${(liveTemplate.width / 2).toFixed(3)} ${(liveTemplate.height / 2).toFixed(3)}) rotate(${templateRotation.toFixed(3)}) scale(${templateZoom.toFixed(4)}) translate(${(-liveTemplate.width / 2).toFixed(3)} ${(-liveTemplate.height / 2).toFixed(3)})`;
    resolvedShapeDefinition.bottomSegments;
    resolvedShapeDefinition.topSegments;
    visibleHistory = history;
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Pottery Pattern CAD</title>`);
      });
    });
    $$renderer2.push(`<main class="svelte-1uha8ag"><section class="card svelte-1uha8ag"><h1 class="svelte-1uha8ag">Pottery Pattern CAD</h1> <p class="sub svelte-1uha8ag">Project + revision aware slab template generation</p> <div class="row svelte-1uha8ag"><input placeholder="New project name"${attr("value", newProjectName)} class="svelte-1uha8ag"/> <button class="small svelte-1uha8ag">Create</button></div> <label class="svelte-1uha8ag">Project `);
    $$renderer2.select(
      { value: selectedProjectId, class: "" },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`Auto-create project`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(projects);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let project = each_array[$$index];
          $$renderer3.option({ value: project.id }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(project.name)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(`</label> <label class="svelte-1uha8ag">Parent Revision `);
    $$renderer2.select(
      {
        value: selectedParentRevisionId,
        disabled: !selectedProjectId,
        class: ""
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`None`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array_1 = ensure_array_like(revisions);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let revision = each_array_1[$$index_1];
          $$renderer3.option({ value: revision.id }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(revision.id.slice(0, 8))} • ${escape_html(new Date(revision.createdAt).toLocaleString())}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(`</label> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (revisions.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="revisions-panel svelte-1uha8ag"><div class="muted svelte-1uha8ag">Recent revisions</div> <div class="revisions-list svelte-1uha8ag"><!--[-->`);
      const each_array_2 = ensure_array_like(revisions.slice(0, 6));
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let revision = each_array_2[$$index_2];
        $$renderer2.push(`<button class="small rev-btn svelte-1uha8ag">${escape_html(revision.id.slice(0, 8))} • H${escape_html(revision.shapeDefinition.height)} BW${escape_html(revision.shapeDefinition.bottomWidth)}</button>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="builder-tabs svelte-1uha8ag"><button type="button"${attr_class("small svelte-1uha8ag", void 0, { "tab-active": builderMode === "legacy" })}>Dimension Builder</button> <button type="button"${attr_class("small svelte-1uha8ag", void 0, { "tab-active": builderMode === "polyhedron" })}>Polyhedron Templates</button></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="grid svelte-1uha8ag"><label class="svelte-1uha8ag">Height <input type="number"${attr("value", shapeDefinition.height)} min="1" class="svelte-1uha8ag"/></label> <label class="svelte-1uha8ag">Bottom Width <input type="number"${attr("value", shapeDefinition.bottomWidth)} min="1" class="svelte-1uha8ag"/></label> <label class="svelte-1uha8ag">Top Width <input type="number"${attr("value", shapeDefinition.topWidth)} min="1" class="svelte-1uha8ag"/></label> <label class="svelte-1uha8ag">Segments <input type="number"${attr("value", shapeDefinition.segments)} min="3" max="256" class="svelte-1uha8ag"/></label> <label class="split-toggle svelte-1uha8ag"><input type="checkbox"${attr("checked", useSplitEdges, true)} class="svelte-1uha8ag"/> Use separate top/bottom edges</label> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="grid fabrication-grid svelte-1uha8ag"><label class="svelte-1uha8ag">Thickness <input type="number"${attr("value", shapeDefinition.thickness)} min="0.1" step="0.1" class="svelte-1uha8ag"/></label> <label class="svelte-1uha8ag">Allowance <input type="number"${attr("value", shapeDefinition.allowance)} min="0" step="0.1" class="svelte-1uha8ag"/></label> <label class="svelte-1uha8ag">Units `);
    $$renderer2.select(
      { value: shapeDefinition.units, class: "" },
      ($$renderer3) => {
        $$renderer3.option({ value: "mm" }, ($$renderer4) => {
          $$renderer4.push(`mm`);
        });
        $$renderer3.option({ value: "in" }, ($$renderer4) => {
          $$renderer4.push(`in`);
        });
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(`</label> <label class="svelte-1uha8ag">Seam Mode `);
    $$renderer2.select(
      { value: shapeDefinition.seamMode, class: "" },
      ($$renderer3) => {
        $$renderer3.option({ value: "straight" }, ($$renderer4) => {
          $$renderer4.push(`straight`);
        });
        $$renderer3.option({ value: "overlap" }, ($$renderer4) => {
          $$renderer4.push(`overlap`);
        });
        $$renderer3.option({ value: "tabbed" }, ($$renderer4) => {
          $$renderer4.push(`tabbed`);
        });
      },
      "svelte-1uha8ag"
    );
    $$renderer2.push(`</label></div> <div class="formats svelte-1uha8ag"><label class="svelte-1uha8ag"><input type="checkbox"${attr("checked", exportFormats.includes("svg"), true)} class="svelte-1uha8ag"/> SVG</label> <label class="svelte-1uha8ag"><input type="checkbox"${attr("checked", exportFormats.includes("pdf"), true)} class="svelte-1uha8ag"/> PDF</label> <label class="svelte-1uha8ag"><input type="checkbox"${attr("checked", exportFormats.includes("stl"), true)} class="svelte-1uha8ag"/> STL</label></div> <button${attr("disabled", projectsLoading, true)} class="svelte-1uha8ag">${escape_html("Generate Export Job")}</button> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></section> <section class="card history svelte-1uha8ag"><div class="history-head svelte-1uha8ag"><h2>Job History</h2> <div class="history-tools svelte-1uha8ag"><label class="tiny-toggle svelte-1uha8ag"><input type="checkbox"${attr("checked", onlySelectedProject, true)} class="svelte-1uha8ag"/> This project</label> <button class="small svelte-1uha8ag"${attr("disabled", historyLoading, true)}>${escape_html("Refresh")}</button></div></div> `);
    if (visibleHistory.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p>No jobs yet.</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="history-list svelte-1uha8ag"><!--[-->`);
      const each_array_5 = ensure_array_like(visibleHistory);
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let job = each_array_5[$$index_5];
        $$renderer2.push(`<article class="history-item svelte-1uha8ag"><div><strong>${escape_html(job.status)}</strong> <div class="muted svelte-1uha8ag">${escape_html(job.jobId.slice(0, 8))} • ${escape_html(new Date(job.createdAt).toLocaleString())}</div> <div class="muted svelte-1uha8ag">Proj ${escape_html(job.projectId.slice(0, 8))} • Rev ${escape_html(job.revisionId.slice(0, 8))}</div></div> <div class="actions svelte-1uha8ag"><button class="small svelte-1uha8ag">Load Params</button> <button class="small svelte-1uha8ag">Fork</button> `);
        if (job.status === "queued" || job.status === "running") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="small svelte-1uha8ag">Cancel</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.status === "failed" || job.status === "cancelled") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="small svelte-1uha8ag">Retry</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.artifacts?.hasSvg) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a class="small link svelte-1uha8ag"${attr("href", `/api/jobs/${job.jobId}/svg`)} target="_blank" rel="noreferrer">SVG</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.artifacts?.hasPdf) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a class="small link svelte-1uha8ag"${attr("href", `/api/jobs/${job.jobId}/pdf`)} target="_blank" rel="noreferrer">PDF</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.artifacts?.hasStl) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a class="small link svelte-1uha8ag"${attr("href", `/api/jobs/${job.jobId}/stl`)} target="_blank" rel="noreferrer">STL</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></article>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="card preview svelte-1uha8ag"><h2>Live Preview</h2> <p class="muted svelte-1uha8ag">2D and 3D update together from the current parameters.</p> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<p class="muted svelte-1uha8ag">Split edges are off, so both ends use ${escape_html(baseSegments)} edges.</p>`);
    }
    $$renderer2.push(`<!--]--> <div class="preview-dual svelte-1uha8ag"><div class="preview-pane svelte-1uha8ag"><div class="preview-pane-head svelte-1uha8ag"><h3 class="svelte-1uha8ag">2D Template</h3> <div class="view-controls svelte-1uha8ag"><button class="small svelte-1uha8ag" type="button" aria-label="Zoom in">+</button> <button class="small svelte-1uha8ag" type="button" aria-label="Zoom out">-</button> <button class="small svelte-1uha8ag" type="button" aria-label="Rotate left">⟲</button> <button class="small svelte-1uha8ag" type="button" aria-label="Rotate right">⟳</button> <button class="small svelte-1uha8ag" type="button">Reset</button></div></div> <svg${attr("viewBox", `0 0 ${liveTemplate.width.toFixed(3)} ${liveTemplate.height.toFixed(3)}`)} role="img" aria-label="Live 2D template preview"${attr_class("svelte-1uha8ag", void 0, { "template-panning-active": templatePanning })}><g${attr("transform", templateTransform)}><!--[-->`);
    const each_array_6 = ensure_array_like(liveTemplate.paths);
    for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
      let path = each_array_6[$$index_6];
      $$renderer2.push(`<path${attr("d", path.d)}${attr_class(`layer-${path.layer}`, "svelte-1uha8ag")}></path>`);
    }
    $$renderer2.push(`<!--]--></g></svg> <div class="muted svelte-1uha8ag">Drag to pan. Mouse wheel to zoom. Rotate using ⟲ / ⟳.</div></div> <div class="preview-pane svelte-1uha8ag"><div class="preview-pane-head svelte-1uha8ag"><h3 class="svelte-1uha8ag">3D Form</h3> <button class="small svelte-1uha8ag" type="button">Reset View</button></div> <svg${attr("viewBox", `0 0 ${liveSolid.width.toFixed(3)} ${liveSolid.height.toFixed(3)}`)} role="img" aria-label="Live 3D solid preview"${attr_class("svelte-1uha8ag", void 0, { "rotating-active": rotating })}><!--[-->`);
    const each_array_7 = ensure_array_like(liveSolid.faces);
    for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
      let face = each_array_7[$$index_7];
      $$renderer2.push(`<polygon class="solid-face svelte-1uha8ag"${attr("points", face.points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" "))}${attr("fill", face.fill)}${attr("stroke", face.stroke)}></polygon>`);
    }
    $$renderer2.push(`<!--]--></svg> <div class="muted svelte-1uha8ag">Drag to rotate.</div></div></div> <h2>Exported SVG</h2> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<p>No SVG yet. Submit or fork a job and wait for completion.</p>`);
    }
    $$renderer2.push(`<!--]--></section></main>`);
  });
}
export {
  _page as default
};
