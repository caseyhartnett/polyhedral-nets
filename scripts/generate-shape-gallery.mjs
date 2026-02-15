import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCanonicalGeometry,
  buildShapeDebugModel,
  renderTemplateSvg
} from "../services/geometry-engine/dist/index.js";

const require = createRequire(import.meta.url);
const { GifWriter } = require("omggif");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "docs", "shape-gallery-assets");
const htmlPath = path.join(repoRoot, "docs", "shape-gallery.html");
const TWO_PI = Math.PI * 2;
const NET_PAD_RIGHT = 20;
const NET_PAD_BOTTOM = 20;

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
    id: "legacy-prism-6",
    mode: "legacy",
    label: "Legacy Prism (6)",
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
    id: "legacy-frustum-8-tabbed",
    mode: "legacy",
    label: "Legacy Frustum (8, tabbed)",
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
    id: "legacy-frustum-10-overlap",
    mode: "legacy",
    label: "Legacy Frustum (10, overlap)",
    shape: {
      ...baseLegacy,
      height: 120,
      bottomWidth: 140,
      topWidth: 95,
      seamMode: "overlap",
      allowance: 8,
      segments: 10,
      bottomSegments: 10,
      topSegments: 10
    },
    camera: { yaw: -0.62, pitch: 0.48 }
  },
  {
    id: "legacy-pyramid-6",
    mode: "legacy",
    label: "Legacy Pyramid (6)",
    shape: {
      ...baseLegacy,
      height: 105,
      bottomWidth: 120,
      topWidth: 1,
      seamMode: "straight",
      allowance: 0,
      segments: 6,
      bottomSegments: 6,
      topSegments: 1
    },
    camera: { yaw: -0.6, pitch: 0.5 }
  },
  {
    id: "legacy-prism-12",
    mode: "legacy",
    label: "Legacy Prism (12)",
    shape: {
      ...baseLegacy,
      height: 95,
      bottomWidth: 150,
      topWidth: 150,
      seamMode: "straight",
      allowance: 0,
      segments: 12,
      bottomSegments: 12,
      topSegments: 12
    },
    camera: { yaw: -0.82, pitch: 0.52 }
  },
  {
    id: "poly-cube",
    mode: "polyhedron",
    label: "Polyhedron Cube",
    shape: {
      ...basePoly,
      polyhedron: {
        preset: "cube",
        edgeLength: 58,
        faceMode: "uniform"
      }
    },
    camera: { yaw: -0.75, pitch: 0.52 }
  },
  {
    id: "poly-dodecahedron",
    mode: "polyhedron",
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
  },
  {
    id: "poly-truncated-octahedron",
    mode: "polyhedron",
    label: "Polyhedron Truncated Octahedron",
    shape: {
      ...basePoly,
      polyhedron: {
        preset: "truncatedOctahedron",
        edgeLength: 26,
        faceMode: "mixed"
      }
    },
    camera: { yaw: -0.85, pitch: 0.48 }
  },
  {
    id: "poly-regular-prism-7",
    mode: "polyhedron",
    label: "Polyhedron Regular Prism (7)",
    shape: {
      ...basePoly,
      polyhedron: {
        preset: "regularPrism",
        edgeLength: 30,
        faceMode: "mixed",
        ringSides: 7
      }
    },
    camera: { yaw: -0.7, pitch: 0.5 }
  },
  {
    id: "poly-regular-bipyramid-5",
    mode: "polyhedron",
    label: "Polyhedron Regular Bipyramid (5)",
    shape: {
      ...basePoly,
      polyhedron: {
        preset: "regularBipyramid",
        edgeLength: 34,
        faceMode: "uniform",
        ringSides: 5
      }
    },
    camera: { yaw: -0.7, pitch: 0.55 }
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

  return { x: x1, y: -z2 };
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
  const delayCs = options.delayCs ?? 12;
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

function addRightBottomCanvasPadding(svg, padRight = NET_PAD_RIGHT, padBottom = NET_PAD_BOTTOM) {
  const viewBoxMatch = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  const widthMatch = svg.match(/width="([0-9.]+)(mm|in)"/);
  const heightMatch = svg.match(/height="([0-9.]+)(mm|in)"/);
  if (!viewBoxMatch || !widthMatch || !heightMatch) {
    return svg;
  }

  const viewWidth = Number(viewBoxMatch[1]);
  const viewHeight = Number(viewBoxMatch[2]);
  const unit = widthMatch[2];
  const nextWidth = (viewWidth + padRight).toFixed(3);
  const nextHeight = (viewHeight + padBottom).toFixed(3);

  return svg
    .replace(/viewBox="0 0 [0-9.]+ [0-9.]+"/, `viewBox="0 0 ${nextWidth} ${nextHeight}"`)
    .replace(/width="[0-9.]+(?:mm|in)"/, `width="${nextWidth}${unit}"`)
    .replace(/height="[0-9.]+(?:mm|in)"/, `height="${nextHeight}${unit}"`)
    .replace(
      /<rect x="0" y="0" width="[0-9.]+" height="[0-9.]+" fill="#ffffff" \/>/,
      `<rect x="0" y="0" width="${nextWidth}" height="${nextHeight}" fill="#ffffff" />`
    );
}

fs.mkdirSync(outDir, { recursive: true });

const rows = [];
for (const example of examples) {
  const canonical = buildCanonicalGeometry(example.shape);
  const netSvg = addRightBottomCanvasPadding(
    renderTemplateSvg(canonical, {
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
    })
  );

  const netPath = path.join(outDir, `${example.id}-net.svg`);
  const gifPath = path.join(outDir, `${example.id}-spin.gif`);

  fs.writeFileSync(netPath, netSvg, "utf8");
  buildWireframeGif(example.shape, gifPath, {
    width: 320,
    height: 220,
    frameCount: 20,
    delayCs: 12,
    yawOffset: example.camera?.yaw ?? 0,
    pitch: example.camera?.pitch ?? 0.5
  });

  rows.push({
    id: example.id,
    mode: example.mode,
    label: example.label,
    net: `shape-gallery-assets/${example.id}-net.svg`,
    gif: `shape-gallery-assets/${example.id}-spin.gif`
  });

  console.log(`wrote ${path.relative(repoRoot, netPath)}`);
  console.log(`wrote ${path.relative(repoRoot, gifPath)}`);
}

const generatedAt = new Date().toISOString();
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shape Gallery QA</title>
    <style>
      :root {
        color-scheme: dark light;
        --bg: #0b1020;
        --panel: #11182b;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --line: #273049;
      }
      body {
        margin: 0;
        background: radial-gradient(1200px 800px at 20% -20%, #1d2a52 0%, var(--bg) 50%);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      .wrap {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      p {
        color: var(--muted);
        margin: 0 0 18px;
      }
      .note {
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: color-mix(in oklab, var(--panel) 92%, black);
        border: 1px solid var(--line);
      }
      th, td {
        border: 1px solid var(--line);
        padding: 10px;
        vertical-align: top;
      }
      th {
        text-align: left;
      }
      img.net {
        width: 380px;
        max-width: 100%;
        background: #fff;
      }
      img.spin {
        width: 220px;
        max-width: 100%;
        background: #fff;
      }
      .mode {
        display: inline-block;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--line);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Shape Gallery QA</h1>
      <p class="note">Generated: ${generatedAt}. Includes 5 legacy + 5 polyhedron samples.</p>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Example</th>
            <th>2D Net (SVG)</th>
            <th>3D Spin (GIF)</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
          <tr>
            <td><span class="mode">${row.mode}</span></td>
            <td><strong>${row.label}</strong><br /><code>${row.id}</code></td>
            <td><img class="net" loading="lazy" src="${row.net}" alt="${row.label} net" /></td>
            <td><img class="spin" loading="lazy" src="${row.gif}" alt="${row.label} spin" /></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </body>
</html>
`;

fs.writeFileSync(htmlPath, html, "utf8");
console.log(`wrote ${path.relative(repoRoot, htmlPath)}`);
