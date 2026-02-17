import type { LineFeatureInt, PolygonWithHolesInt, Sheet } from "./types.js";

interface RenderOptions {
  scaleDown?: number;
  strokeWidth?: number;
}

function fmt(value: number, scaleDown: number): string {
  return (value / scaleDown).toFixed(3).replace(/\.000$/, "");
}

function pathToSvgD(path: Array<{ x: number; y: number }>, scaleDown: number): string {
  if (path.length === 0) {
    return "";
  }
  const parts = [`M ${fmt(path[0].x, scaleDown)} ${fmt(path[0].y, scaleDown)}`];
  for (let i = 1; i < path.length; i += 1) {
    parts.push(`L ${fmt(path[i].x, scaleDown)} ${fmt(path[i].y, scaleDown)}`);
  }
  return `${parts.join(" ")} Z`;
}

function polygonToPathD(polygon: PolygonWithHolesInt, scaleDown: number): string {
  const outer = pathToSvgD(polygon.outer, scaleDown);
  const holes = polygon.holes.map((hole) => pathToSvgD(hole, scaleDown));
  return [outer, ...holes].filter(Boolean).join(" ");
}

function lineToPolyline(line: LineFeatureInt, scaleDown: number): string {
  const points = line.path.map((point) => `${fmt(point.x, scaleDown)},${fmt(point.y, scaleDown)}`).join(" ");
  if (line.kind === "score") {
    return `<polyline points="${points}" fill="none" stroke="#0ea5e9" stroke-width="0.4" stroke-dasharray="3 2"/>`;
  }
  return `<polyline points="${points}" fill="none" stroke="#a3a3a3" stroke-width="0.35" stroke-dasharray="1.5 2"/>`;
}

export function renderSheetSvg(sheet: Sheet, options: RenderOptions = {}): string {
  const scaleDown = options.scaleDown ?? 1;
  const strokeWidth = options.strokeWidth ?? 0.5;
  const width = fmt(sheet.rect.right - sheet.rect.left, scaleDown);
  const height = fmt(sheet.rect.bottom - sheet.rect.top, scaleDown);

  const groups = sheet.placed
    .map((placed) => {
      const cut = `<path d="${polygonToPathD(
        placed.drawGeoPlaced,
        scaleDown
      )}" fill="none" stroke="#111827" stroke-width="${strokeWidth}" fill-rule="evenodd"/>`;

      const lines = placed.linesPlaced.map((line) => lineToPolyline(line, scaleDown)).join("\n      ");
      const labelX = fmt(placed.placement.x + 40, scaleDown);
      const labelY = fmt(placed.placement.y + 40, scaleDown);
      const label = `<text x="${labelX}" y="${labelY}" font-size="2.5" fill="#dc2626">${placed.shard.id}</text>`;

      return `<g id="${placed.shard.id}">
      ${cut}
      ${lines}
      ${label}
    </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
  ${groups}
</svg>`;
}

export function debugRenderPipelineState(label: string, sheets: Sheet[], options: RenderOptions = {}): string {
  const rendered = sheets
    .map((sheet) => {
      const svg = renderSheetSvg(sheet, options);
      return `--- ${label} :: ${sheet.id} ---\n${svg}`;
    })
    .join("\n\n");

  return rendered;
}
