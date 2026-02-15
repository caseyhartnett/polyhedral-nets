import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCanonicalGeometry,
  buildShapeDebugModel,
  buildWireframePreview,
  createWireframeSvg,
  renderTemplateSvg
} from "../services/geometry-engine/dist/index.js";

const require = createRequire(import.meta.url);
const { GifWriter } = require("omggif");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "docs", "readme-assets");
const TWO_PI = Math.PI * 2;

const baseLegacy = {
  schemaVersion: "1.0",
  generationMode: "legacy",
  thickness: 4,
  units: "mm",
  notches: [],
  profilePoints: []
};

const basePoly = {
  schemaVersion: "1.0",
  generationMode: "polyhedron",
  height: 120,
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
  topSegments: 6
};

const examples = [
  {
    id: "legacy-prism-hex",
    label: "Legacy Hex Prism",
    shape: {
      ...baseLegacy,
      height: 90,
      bottomWidth: 95,
      topWidth: 95,
      seamMode: "straight",
      allowance: 0,
      segments: 6,
      bottomSegments: 6,
      topSegments: 6
    },
    camera: { yaw: -0.75, pitch: 0.55 }
  },
  {
    id: "legacy-frustum-tabbed",
    label: "Legacy Frustum (Tabbed Seam)",
    shape: {
      ...baseLegacy,
      height: 110,
      bottomWidth: 130,
      topWidth: 75,
      seamMode: "tabbed",
      allowance: 10,
      segments: 8,
      bottomSegments: 8,
      topSegments: 8
    },
    camera: { yaw: -0.5, pitch: 0.5 }
  },
  {
    id: "polyhedron-dodecahedron",
    label: "Polyhedron Dodecahedron",
    shape: {
      ...basePoly,
      polyhedron: {
        preset: "dodecahedron",
        edgeLength: 34,
        faceMode: "uniform"
      }
    },
    camera: { yaw: -0.9, pitch: 0.5 }
  }
];

function projectPoint(p, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = p.x * cy - p.y * sy;
  const y1 = p.x * sy + p.y * cy;
  const z1 = p.z;

  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;

  return { x: x1, y: -z2, depth: y2 };
}

function collectUniqueEdges(mesh) {
  const uniqueEdges = new Map();
  for (const face of mesh.faces) {
    for (let i = 0; i < face.vertexIndices.length; i += 1) {
      const a = face.vertexIndices[i];
      const b = face.vertexIndices[(i + 1) % face.vertexIndices.length];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!uniqueEdges.has(key)) {
        uniqueEdges.set(key, [a, b]);
      }
    }
  }
  return Array.from(uniqueEdges.values());
}

function drawLine(bitmap, width, height, x0, y0, x1, y1, color = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);

    if (x >= 0 && x < width && y >= 0 && y < height) {
      bitmap[y * width + x] = color;
    }
    if (x + 1 >= 0 && x + 1 < width && y >= 0 && y < height) {
      bitmap[y * width + (x + 1)] = color;
    }
    if (x >= 0 && x < width && y + 1 >= 0 && y + 1 < height) {
      bitmap[(y + 1) * width + x] = color;
    }
  }
}

function buildWireframeGif(shape, outputPath, options = {}) {
  const width = options.width ?? 320;
  const height = options.height ?? 220;
  const frameCount = options.frameCount ?? 20;
  const pitch = options.pitch ?? 0.5;
  const delayCs = options.delayCs ?? 6;
  const padding = options.padding ?? 16;
  const yawOffset = options.yawOffset ?? 0;

  const model = buildShapeDebugModel(shape);
  const edges = collectUniqueEdges(model.mesh);

  const lineFrames = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < frameCount; i += 1) {
    const yaw = yawOffset + (TWO_PI * i) / frameCount;
    const projected = model.mesh.vertices.map((vertex) => projectPoint(vertex, yaw, pitch));
    const lines = edges.map(([aIndex, bIndex]) => {
      const a = projected[aIndex];
      const b = projected[bIndex];
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    });

    for (const line of lines) {
      minX = Math.min(minX, line.x1, line.x2);
      minY = Math.min(minY, line.y1, line.y2);
      maxX = Math.max(maxX, line.x1, line.x2);
      maxY = Math.max(maxY, line.y1, line.y2);
    }
    lineFrames.push(lines);
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;

  const palette = [0xffffff, 0x111111];
  const buffer = Buffer.alloc(width * height * frameCount * 3 + 16384);
  const writer = new GifWriter(buffer, width, height, { loop: 0 });

  for (const lines of lineFrames) {
    const pixels = new Uint8Array(width * height);

    for (const line of lines) {
      drawLine(
        pixels,
        width,
        height,
        Math.round(line.x1 * scale + offsetX),
        Math.round(line.y1 * scale + offsetY),
        Math.round(line.x2 * scale + offsetX),
        Math.round(line.y2 * scale + offsetY),
        1
      );
    }

    writer.addFrame(0, 0, width, height, pixels, { palette, delay: delayCs });
  }

  const gifBytes = writer.end();
  fs.writeFileSync(outputPath, buffer.subarray(0, gifBytes));
}

fs.mkdirSync(outDir, { recursive: true });

for (const example of examples) {
  const canonical = buildCanonicalGeometry(example.shape);
  // README is commonly viewed in dark themes, so generated showcase SVGs use a white
  // background and thicker strokes for legibility.
  const netSvg = renderTemplateSvg(canonical, {
    backgroundColor: "#ffffff",
    layerStyles: {
      cut: {
        stroke: "#111827",
        strokeWidth: 0.8,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      },
      score: {
        stroke: "#1d4ed8",
        strokeWidth: 0.65,
        strokeDasharray: "2.2 1.4",
        strokeLinecap: "round"
      },
      guide: {
        stroke: "#6b7280",
        strokeWidth: 0.5,
        strokeDasharray: "1.4 1.1",
        strokeLinecap: "round",
        strokeOpacity: 0.9
      }
    }
  });
  const wireframeSvg = createWireframeSvg(buildWireframePreview(example.shape, example.camera), {
    backgroundColor: "#ffffff",
    stroke: "#111827",
    strokeWidth: 1.7
  });

  const netPath = path.join(outDir, `${example.id}-net.svg`);
  const wirePath = path.join(outDir, `${example.id}-wireframe.svg`);
  const gifPath = path.join(outDir, `${example.id}-spin.gif`);
  fs.writeFileSync(netPath, netSvg, "utf8");
  fs.writeFileSync(wirePath, wireframeSvg, "utf8");
  buildWireframeGif(example.shape, gifPath, {
    width: 320,
    height: 220,
    frameCount: 20,
    delayCs: 6,
    yawOffset: example.camera?.yaw ?? 0,
    pitch: example.camera?.pitch ?? 0.5
  });
  console.log(`wrote ${path.relative(repoRoot, netPath)}`);
  console.log(`wrote ${path.relative(repoRoot, wirePath)}`);
  console.log(`wrote ${path.relative(repoRoot, gifPath)}`);
}
