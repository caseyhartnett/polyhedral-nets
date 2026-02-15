import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildCanonicalGeometry,
  buildShapeDebugModel,
  buildWireframePreview,
  createWireframeSvg,
  faceEdgeLengths2D,
  faceEdgeLengths3D,
  meshEdgeIncidence,
  renderTemplatePdf,
  renderTemplateStl,
  renderTemplateSvg,
  type ShapeDebugModel
} from "./index.js";
import { ShapeDefinitionSchema, type ShapeDefinition } from "@torrify/shared-types";

const EDGE_TOLERANCE = 1e-4;
const AREA_EPSILON = 1e-5;

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function polygonBounds(points: Array<{ x: number; y: number }>): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y))
  };
}

function almostEqual(a: number, b: number, tolerance = EDGE_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

function ensureCounterClockwise(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return polygonArea(points) >= 0 ? points : [...points].reverse();
}

function cross2(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function lineIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): { x: number; y: number } {
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = a1 * p1.x + b1 * p1.y;

  const a2 = q2.y - q1.y;
  const b2 = q1.x - q2.x;
  const c2 = a2 * q1.x + b2 * q1.y;

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) {
    return { x: p2.x, y: p2.y };
  }

  return {
    x: (b2 * c1 - b1 * c2) / det,
    y: (a1 * c2 - a2 * c1) / det
  };
}

function clipConvexPolygon(
  subject: Array<{ x: number; y: number }>,
  clip: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  let output = ensureCounterClockwise(subject);
  const clipPoly = ensureCounterClockwise(clip);

  for (let i = 0; i < clipPoly.length; i += 1) {
    const cp1 = clipPoly[i];
    const cp2 = clipPoly[(i + 1) % clipPoly.length];
    const input = output;
    output = [];
    if (input.length === 0) break;

    let s = input[input.length - 1];
    for (const e of input) {
      const insideE = cross2(cp1, cp2, e) >= -1e-8;
      const insideS = cross2(cp1, cp2, s) >= -1e-8;

      if (insideE) {
        if (!insideS) {
          output.push(lineIntersection(s, e, cp1, cp2));
        }
        output.push(e);
      } else if (insideS) {
        output.push(lineIntersection(s, e, cp1, cp2));
      }

      s = e;
    }
  }

  return output;
}

function sharedVertexCount(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
  tolerance = 1e-6
): number {
  let count = 0;
  for (const pa of a) {
    const hit = b.some((pb) => Math.abs(pa.x - pb.x) <= tolerance && Math.abs(pa.y - pb.y) <= tolerance);
    if (hit) count += 1;
  }
  return count;
}

function toRaster(
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  width: number,
  height: number,
  outW = 240,
  outH = 240
): number[][] {
  const bitmap = Array.from({ length: outH }, () => Array.from({ length: outW }, () => 0));
  const sx = (outW - 1) / Math.max(width, 1);
  const sy = (outH - 1) / Math.max(height, 1);

  const drawLine = (x0: number, y0: number, x1: number, y1: number): void => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round((x0 + dx * t) * sx);
      const y = Math.round((y0 + dy * t) * sy);
      if (x >= 0 && x < outW && y >= 0 && y < outH) {
        bitmap[y][x] = 255;
      }
    }
  };

  for (const line of lines) {
    drawLine(line.x1, line.y1, line.x2, line.y2);
  }

  return bitmap;
}

function rasterInk(bitmap: number[][]): number {
  let ink = 0;
  for (const row of bitmap) {
    for (const px of row) {
      if (px > 0) ink += 1;
    }
  }
  return ink;
}

function toPgm(bitmap: number[][]): string {
  const h = bitmap.length;
  const w = bitmap[0]?.length ?? 0;
  const rows = bitmap.map((row) => row.join(" ")).join("\n");
  return `P2\n${w} ${h}\n255\n${rows}\n`;
}

function makeNetLines(shape: ShapeDebugModel): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  for (const path of shape.template.paths) {
    for (let i = 0; i < path.points.length - 1; i += 1) {
      const a = path.points[i];
      const b = path.points[i + 1];
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    if (path.closed) {
      const a = path.points[path.points.length - 1];
      const b = path.points[0];
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  return lines;
}

function templateSignature(shape: ReturnType<typeof buildCanonicalGeometry>): string {
  return shape.template.paths
    .map((path) => {
      const points = path.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(";");
      return `${path.layer}:${path.closed ? "1" : "0"}:${points}`;
    })
    .sort()
    .join("|");
}

function projectedSilhouetteChecks(shape: ShapeDebugModel): void {
  const wire = buildWireframePreview({
    schemaVersion: "1.0",
    height: shape.mesh.vertices.reduce((max, v) => Math.max(max, v.z), 0),
    bottomWidth: shape.metrics.bottomRadius * 2,
    topWidth: Math.max(shape.metrics.topRadius * 2, 1e-6),
    thickness: 1,
    units: "mm",
    seamMode: "straight",
    allowance: 0,
    notches: [],
    profilePoints: [],
    generationMode: "legacy",
    segments: shape.counts.bottom,
    bottomSegments: shape.counts.bottom,
    topSegments: shape.counts.top
  });

  const ink = rasterInk(toRaster(wire.lines, wire.width, wire.height));
  assert.ok(ink > 200, "3D wireframe image is too sparse/blank");

  if (shape.counts.top === 1) {
    const apexCount = shape.mesh.vertices.filter((v) => Math.abs(v.z - shape.mesh.vertices[shape.mesh.vertices.length - 1].z) < 1e-9).length;
    assert.equal(apexCount, 1, "pyramid silhouette should have one apex vertex");
  } else {
    const topVertices = shape.mesh.vertices.filter((v) => Math.abs(v.z - shape.mesh.vertices.reduce((max, p) => Math.max(max, p.z), 0)) < 1e-9);
    assert.equal(topVertices.length, shape.counts.bottom, "prism/frustum silhouette should have full top ring");
  }
}

function writeFailureArtifacts(caseName: string, def: ShapeDefinition, shape: ShapeDebugModel, reason: string): void {
  const debugRoot = path.resolve(process.cwd(), "../../data/debug/geometry-harness");
  fs.mkdirSync(debugRoot, { recursive: true });
  const dir = path.join(debugRoot, `${Date.now()}-${caseName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
  fs.mkdirSync(dir, { recursive: true });

  const canonical = buildCanonicalGeometry(def);
  const netSvg = renderTemplateSvg(canonical);
  const wire = buildWireframePreview(def);
  const wireSvg = createWireframeSvg(wire);

  const netRaster = toRaster(makeNetLines(shape), shape.template.width, shape.template.height);
  const wireRaster = toRaster(wire.lines, wire.width, wire.height);

  fs.writeFileSync(path.join(dir, "params.json"), JSON.stringify(def, null, 2));
  fs.writeFileSync(
    path.join(dir, "diagnostics.json"),
    JSON.stringify(
      {
        reason,
        kind: shape.kind,
        counts: shape.counts,
        meshFaceCount: shape.mesh.faces.length,
        netFaceCount: shape.net.faces.length,
        warnings: shape.warnings
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(dir, "net.svg"), netSvg);
  fs.writeFileSync(path.join(dir, "wireframe.svg"), wireSvg);
  fs.writeFileSync(path.join(dir, "net.pgm"), toPgm(netRaster));
  fs.writeFileSync(path.join(dir, "wireframe.pgm"), toPgm(wireRaster));
}

function runInvariantChecks(caseName: string, def: ShapeDefinition): void {
  const shape = buildShapeDebugModel(def);

  try {
    // A) Top/bottom edge rules.
    if (shape.counts.top === 1) {
      const topVertexCount = shape.mesh.vertices.length - shape.counts.bottom;
      assert.equal(topVertexCount, 1, "pyramid top must have exactly 1 vertex");
    } else {
      const topVertexCount = shape.mesh.vertices.length - shape.counts.bottom;
      assert.equal(topVertexCount, shape.counts.bottom, "top and bottom edge counts must match");
    }

    // B) Face count expectations.
    const expectedFaces = shape.counts.top === 1 ? shape.counts.bottom + 1 : shape.counts.bottom + 2;
    assert.equal(shape.mesh.faces.length, expectedFaces, "unexpected mesh face count");

    // C) Edge/adjacency consistency.
    const incidence = meshEdgeIncidence(shape.mesh);
    for (const [edge, faceIds] of incidence.entries()) {
      assert.equal(faceIds.length, 2, `mesh edge ${edge} is not shared by exactly 2 faces`);
    }

    for (const face of shape.net.faces) {
      const area = Math.abs(polygonArea(face.points));
      assert.ok(area > AREA_EPSILON, `net face ${face.faceId} collapsed to near-zero area`);
    }

    // D) Net ↔ mesh correspondence.
    assert.equal(shape.net.faces.length, shape.mesh.faces.length, "net face count must match mesh face count");

    for (const meshFace of shape.mesh.faces) {
      const netFace = shape.net.faces.find((face) => face.faceId === meshFace.id);
      assert.ok(netFace, `missing net face for mesh face ${meshFace.id}`);

      const meshLengths = faceEdgeLengths3D(shape.mesh, meshFace).sort((a, b) => a - b);
      const netLengths = faceEdgeLengths2D(netFace!).sort((a, b) => a - b);
      assert.equal(netLengths.length, meshLengths.length, `edge count mismatch for face ${meshFace.id}`);

      for (let i = 0; i < meshLengths.length; i += 1) {
        assert.ok(
          almostEqual(meshLengths[i], netLengths[i]),
          `edge length mismatch for face ${meshFace.id}: ${meshLengths[i]} vs ${netLengths[i]}`
        );
      }
    }

    // E) Unfold validity: no extreme overlap / degenerate total area.
    const faceAreas = shape.net.faces.map((face) => Math.abs(polygonArea(face.points)));
    const totalArea = faceAreas.reduce((sum, area) => sum + area, 0);
    assert.ok(totalArea > 1, "net total area is too small");

    const allPoints = shape.net.faces.flatMap((face) => face.points);
    const bounds = polygonBounds(allPoints);
    const boundsArea = Math.max((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY), 1e-6);
    assert.ok(totalArea / boundsArea > 0.05, "net is nearly collapsed into a line/point");

    const duplicateSignatures = new Set<string>();
    for (const face of shape.net.faces) {
      const c = face.points.reduce(
        (acc, p) => ({ x: acc.x + p.x / face.points.length, y: acc.y + p.y / face.points.length }),
        { x: 0, y: 0 }
      );
      const signature = `${Math.round(c.x * 1000)}:${Math.round(c.y * 1000)}:${Math.round(
        Math.abs(polygonArea(face.points)) * 1000
      )}`;
      assert.ok(!duplicateSignatures.has(signature), "duplicate/overlapping net faces detected");
      duplicateSignatures.add(signature);
    }

    for (let i = 0; i < shape.net.faces.length; i += 1) {
      for (let j = i + 1; j < shape.net.faces.length; j += 1) {
        const a = shape.net.faces[i].points;
        const b = shape.net.faces[j].points;

        if (sharedVertexCount(a, b) >= 2) {
          continue;
        }

        const clipped = clipConvexPolygon(a, b);
        if (clipped.length < 3) {
          continue;
        }

        const overlapArea = Math.abs(polygonArea(clipped));
        const minFaceArea = Math.min(Math.abs(polygonArea(a)), Math.abs(polygonArea(b)));
        assert.ok(overlapArea < minFaceArea * 0.02, "net faces overlap significantly");
      }
    }

    // F) Dimension sanity.
    assert.ok(def.height > 0, "height must be > 0");
    assert.ok(def.bottomWidth > 0 && def.topWidth > 0, "widths must be > 0");
    assert.ok(shape.counts.bottom >= 3, "n must be >= 3");

    // Visual smoke checks.
    const netRaster = toRaster(makeNetLines(shape), shape.template.width, shape.template.height);
    const netInk = rasterInk(netRaster);
    assert.ok(netInk > 120, "2D net image is too sparse/blank");

    projectedSilhouetteChecks(shape);

    const svg = renderTemplateSvg(buildCanonicalGeometry(def));
    const pdf = renderTemplatePdf(buildCanonicalGeometry(def));
    const stl = renderTemplateStl(def);
    assert.ok(svg.includes("<svg"), "SVG export invalid");
    assert.ok(pdf.startsWith("%PDF-1.4"), "PDF export invalid");
    assert.ok(stl.includes("facet normal"), "STL export missing facets");
  } catch (error) {
    writeFailureArtifacts(caseName, def, shape, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function makeShape(partial: Partial<ShapeDefinition>): ShapeDefinition {
  return ShapeDefinitionSchema.parse({
    schemaVersion: "1.0",
    height: 100,
    bottomWidth: 80,
    topWidth: 80,
    thickness: 4,
    units: "mm",
    seamMode: "straight",
    allowance: 0,
    notches: [],
    profilePoints: [],
    segments: 6,
    ...partial
  });
}

function makePolyhedronShape(
  preset:
    | "tetrahedron"
    | "cube"
    | "octahedron"
    | "icosahedron"
    | "dodecahedron"
    | "cuboctahedron"
    | "truncatedOctahedron"
    | "regularPrism"
    | "regularAntiprism"
    | "regularBipyramid",
  edgeLength = 42,
  ringSides = 6
): ShapeDefinition {
  const faceMode =
    preset === "cuboctahedron" || preset === "truncatedOctahedron"
      ? "mixed"
      : preset === "regularPrism"
        ? ringSides === 4
          ? "uniform"
          : "mixed"
        : preset === "regularAntiprism"
          ? ringSides === 3
            ? "uniform"
            : "mixed"
          : "uniform";

  return ShapeDefinitionSchema.parse({
    schemaVersion: "1.0",
    height: 120,
    bottomWidth: 80,
    topWidth: 80,
    thickness: 4,
    units: "mm",
    seamMode: "straight",
    allowance: 0,
    notches: [],
    profilePoints: [],
    generationMode: "polyhedron",
    polyhedron: {
      preset,
      edgeLength,
      faceMode,
      ringSides: preset === "regularPrism" || preset === "regularAntiprism" || preset === "regularBipyramid" ? ringSides : undefined
    },
    segments: 6,
    bottomSegments: 6,
    topSegments: 6
  });
}

const GOLDEN_CASES: Array<{ name: string; shape: ShapeDefinition }> = [
  {
    name: "box-n4",
    shape: makeShape({ height: 50, bottomWidth: 80, topWidth: 80, segments: 4 })
  },
  {
    name: "prism-n6",
    shape: makeShape({ height: 70, bottomWidth: 90, topWidth: 90, segments: 6 })
  },
  {
    name: "prism-n8",
    shape: makeShape({ height: 70, bottomWidth: 110, topWidth: 110, segments: 8 })
  },
  {
    name: "pyramid-n4",
    shape: makeShape({ height: 85, bottomWidth: 80, topWidth: 1, segments: 4, bottomSegments: 4, topSegments: 1 })
  },
  {
    name: "pyramid-n6",
    shape: makeShape({ height: 95, bottomWidth: 100, topWidth: 1, segments: 6, bottomSegments: 6, topSegments: 1 })
  },
  {
    name: "cone-approx",
    shape: makeShape({ height: 100, bottomWidth: 120, topWidth: 1, segments: 24, bottomSegments: 24, topSegments: 1 })
  }
];

test("golden geometry/net harness", () => {
  for (const c of GOLDEN_CASES) {
    runInvariantChecks(c.name, c.shape);
  }
});

test("polyhedron presets generate valid nets and STL", () => {
  const presets: Array<
    | "tetrahedron"
    | "cube"
    | "octahedron"
    | "icosahedron"
    | "dodecahedron"
    | "cuboctahedron"
    | "truncatedOctahedron"
    | "regularPrism"
    | "regularAntiprism"
    | "regularBipyramid"
  > = [
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

  for (const preset of presets) {
    const def = makePolyhedronShape(
      preset,
      preset === "truncatedOctahedron" ? 26 : 34,
      preset === "regularBipyramid" ? 5 : 6
    );
    const shape = buildShapeDebugModel(def);

    assert.equal(shape.kind, "polyhedron", `${preset} should produce polyhedron kind`);
    assert.equal(shape.net.faces.length, shape.mesh.faces.length, `${preset} net/mesh face count mismatch`);

    const incidence = meshEdgeIncidence(shape.mesh);
    for (const [edge, faceIds] of incidence.entries()) {
      assert.equal(faceIds.length, 2, `${preset} edge ${edge} should be shared by exactly 2 faces`);
    }

    for (const meshFace of shape.mesh.faces) {
      const netFace = shape.net.faces.find((face) => face.faceId === meshFace.id);
      assert.ok(netFace, `${preset} missing net face for mesh face ${meshFace.id}`);
      assert.ok(Math.abs(polygonArea(netFace!.points)) > AREA_EPSILON, `${preset} net face ${meshFace.id} collapsed`);

      const meshLengths = faceEdgeLengths3D(shape.mesh, meshFace).sort((a, b) => a - b);
      const netLengths = faceEdgeLengths2D(netFace!).sort((a, b) => a - b);
      assert.equal(netLengths.length, meshLengths.length, `${preset} edge count mismatch for face ${meshFace.id}`);
      for (let i = 0; i < meshLengths.length; i += 1) {
        assert.ok(
          almostEqual(meshLengths[i], netLengths[i]),
          `${preset} edge length mismatch for face ${meshFace.id}: ${meshLengths[i]} vs ${netLengths[i]}`
        );
      }
    }

    const stl = renderTemplateStl(def);
    assert.ok(stl.includes("facet normal"), `${preset} STL export missing facets`);
  }
});

test("truncated octahedron carries square and hex faces", () => {
  const shape = buildShapeDebugModel(makePolyhedronShape("truncatedOctahedron", 25));
  const faceSizes = shape.mesh.faces.map((face) => face.vertexIndices.length);
  const squareCount = faceSizes.filter((size) => size === 4).length;
  const hexCount = faceSizes.filter((size) => size === 6).length;

  assert.equal(squareCount, 6, "truncated octahedron should include 6 square faces");
  assert.equal(hexCount, 8, "truncated octahedron should include 8 hexagonal faces");
});

test("regular hexagonal prism carries square and hexagonal faces", () => {
  const shape = buildShapeDebugModel(makePolyhedronShape("regularPrism", 25, 6));
  const faceSizes = shape.mesh.faces.map((face) => face.vertexIndices.length);
  const squareCount = faceSizes.filter((size) => size === 4).length;
  const hexCount = faceSizes.filter((size) => size === 6).length;

  assert.equal(squareCount, 6, "regular hexagonal prism should include 6 square side faces");
  assert.equal(hexCount, 2, "regular hexagonal prism should include 2 hexagonal cap faces");
});

test("regular hexagonal antiprism carries triangular and hexagonal faces", () => {
  const shape = buildShapeDebugModel(makePolyhedronShape("regularAntiprism", 25, 6));
  const faceSizes = shape.mesh.faces.map((face) => face.vertexIndices.length);
  const triCount = faceSizes.filter((size) => size === 3).length;
  const hexCount = faceSizes.filter((size) => size === 6).length;

  assert.equal(triCount, 12, "regular hexagonal antiprism should include 12 triangular side faces");
  assert.equal(hexCount, 2, "regular hexagonal antiprism should include 2 hexagonal cap faces");
});

test("regular pentagonal bipyramid carries only triangular faces", () => {
  const shape = buildShapeDebugModel(makePolyhedronShape("regularBipyramid", 25, 5));
  const faceSizes = shape.mesh.faces.map((face) => face.vertexIndices.length);

  assert.equal(faceSizes.length, 10, "regular pentagonal bipyramid should include 10 faces");
  assert.equal(faceSizes.filter((size) => size === 3).length, 10, "regular pentagonal bipyramid faces should all be triangles");
});

test("invalid edge counts are rejected", () => {
  assert.throws(
    () =>
      ShapeDefinitionSchema.parse({
        schemaVersion: "1.0",
        height: 100,
        bottomWidth: 80,
        topWidth: 80,
        thickness: 4,
        units: "mm",
        seamMode: "straight",
        allowance: 0,
        notches: [],
        profilePoints: [],
        segments: 2
      }),
    /greater than or equal to 3/i
  );

  assert.throws(
    () =>
      ShapeDefinitionSchema.parse({
        schemaVersion: "1.0",
        height: 100,
        bottomWidth: 80,
        topWidth: 80,
        thickness: 4,
        units: "mm",
        seamMode: "straight",
        allowance: 0,
        notches: [],
        profilePoints: [],
        segments: 6,
        bottomSegments: 6,
        topSegments: 5
      }),
    /Unsupported shape/i
  );

  assert.throws(
    () =>
      ShapeDefinitionSchema.parse({
        schemaVersion: "1.0",
        height: 100,
        bottomWidth: 80,
        topWidth: 80,
        thickness: 4,
        units: "mm",
        seamMode: "straight",
        allowance: 0,
        notches: [],
        profilePoints: [],
        generationMode: "polyhedron",
        polyhedron: {
          preset: "regularBipyramid",
          edgeLength: 40,
          faceMode: "uniform",
          ringSides: 6
        },
        segments: 6
      }),
    /ringSides/i
  );
});

test("seam modes produce distinct unfolded templates", () => {
  const base = makeShape({
    height: 120,
    bottomWidth: 90,
    topWidth: 120,
    segments: 6,
    bottomSegments: 6,
    topSegments: 6,
    allowance: 8
  });

  const straight = buildCanonicalGeometry({ ...base, seamMode: "straight" });
  const overlap = buildCanonicalGeometry({ ...base, seamMode: "overlap" });
  const tabbed = buildCanonicalGeometry({ ...base, seamMode: "tabbed" });

  const straightSig = templateSignature(straight);
  const overlapSig = templateSignature(overlap);
  const tabbedSig = templateSignature(tabbed);

  assert.notEqual(straightSig, overlapSig, "overlap seam should differ from straight seam output");
  assert.notEqual(straightSig, tabbedSig, "tabbed seam should differ from straight seam output");
  assert.notEqual(overlapSig, tabbedSig, "tabbed seam should differ from overlap seam output");
  assert.equal(
    overlap.warnings.some((warning) => warning.includes("seamMode is currently rendered as straight seam")),
    false
  );
});

test("allowance affects non-straight seam flap depth", () => {
  const base = makeShape({
    seamMode: "overlap",
    segments: 6,
    bottomSegments: 6,
    topSegments: 6
  });

  const lowAllowance = buildCanonicalGeometry({ ...base, allowance: 2 });
  const highAllowance = buildCanonicalGeometry({ ...base, allowance: 14 });

  assert.notEqual(
    templateSignature(lowAllowance),
    templateSignature(highAllowance),
    "changing allowance should change overlap seam geometry"
  );
});

test("PDF export does not depend on global Buffer", () => {
  const originalBuffer = Reflect.get(globalThis, "Buffer");

  Reflect.set(globalThis, "Buffer", undefined);
  try {
    const geometry = buildCanonicalGeometry(makeShape({}));
    const pdf = renderTemplatePdf(geometry);
    assert.ok(pdf.startsWith("%PDF-1.4"), "PDF export should still render without Buffer");
  } finally {
    Reflect.set(globalThis, "Buffer", originalBuffer);
  }
});

test("renderTemplateSvg supports presentation options", () => {
  const geometry = buildCanonicalGeometry(makeShape({}));
  const svg = renderTemplateSvg(geometry, {
    backgroundColor: "#ffffff",
    layerStyles: {
      cut: { stroke: "#111827", strokeWidth: 0.8, strokeLinecap: "round" }
    }
  });

  assert.ok(svg.includes('fill="#ffffff"'), "expected background rect");
  assert.ok(svg.includes("stroke:#111827"), "expected cut stroke override");
  assert.ok(svg.includes("stroke-width:0.8"), "expected cut stroke width override");
  assert.ok(svg.includes("stroke-linecap:round"), "expected cut stroke linecap override");
});

test("createWireframeSvg supports presentation options", () => {
  const preview = buildWireframePreview(makeShape({}));
  const svg = createWireframeSvg(preview, {
    backgroundColor: "#ffffff",
    stroke: "#111827",
    strokeWidth: 1.7
  });

  assert.ok(svg.includes('fill="#ffffff"'), "expected background rect");
  assert.ok(svg.includes('stroke="#111827"'), "expected stroke override");
  assert.ok(svg.includes('stroke-width="1.7"'), "expected stroke-width override");
});
