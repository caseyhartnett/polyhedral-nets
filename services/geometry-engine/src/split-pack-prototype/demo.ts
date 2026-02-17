import { debugRenderPipelineState, renderSheetSvg } from "./debugRender.js";
import { scaleToInt } from "./normalize.js";
import { buildBaselineGridSheets, splitAndPack } from "./pipeline.js";
import type { Config, GridTile, TemplateGeometry } from "./types.js";

function scaleRect(rect: { left: number; top: number; right: number; bottom: number }, SCALE: number) {
  return {
    left: Math.round(rect.left * SCALE),
    top: Math.round(rect.top * SCALE),
    right: Math.round(rect.right * SCALE),
    bottom: Math.round(rect.bottom * SCALE)
  };
}

function toyTemplate(): TemplateGeometry {
  return {
    cutPolygons: [
      {
        id: "body-A",
        outer: [
          { x: 5, y: 5 },
          { x: 95, y: 5 },
          { x: 95, y: 55 },
          { x: 5, y: 55 }
        ],
        holes: [
          [
            { x: 35, y: 20 },
            { x: 55, y: 20 },
            { x: 55, y: 40 },
            { x: 35, y: 40 }
          ]
        ]
      },
      {
        id: "flap-B",
        outer: [
          { x: 70, y: 10 },
          { x: 140, y: 15 },
          { x: 130, y: 60 },
          { x: 85, y: 70 },
          { x: 65, y: 35 }
        ],
        holes: []
      }
    ],
    scoreLines: [
      {
        id: "score-1",
        kind: "score",
        path: [
          { x: 0, y: 30 },
          { x: 150, y: 30 }
        ]
      },
      {
        id: "score-2",
        kind: "score",
        path: [
          { x: 25, y: 0 },
          { x: 120, y: 75 }
        ]
      }
    ],
    guideLines: [
      {
        id: "guide-1",
        kind: "guide",
        path: [
          { x: 80, y: 0 },
          { x: 80, y: 80 }
        ]
      }
    ]
  };
}

function toyTiles(): Array<{ id: string; rect: { left: number; top: number; right: number; bottom: number } }> {
  return [
    {
      id: "tile-left",
      rect: {
        left: 0,
        top: 0,
        right: 80,
        bottom: 80
      }
    },
    {
      id: "tile-right",
      rect: {
        left: 80,
        top: 0,
        right: 160,
        bottom: 80
      }
    }
  ];
}

function printHeader(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function runDemo(): void {
  const SCALE = 10_000;

  const config: Config = {
    SCALE,
    AREA_EPS: Math.round(0.2 * SCALE * SCALE),
    DIM_EPS: Math.round(0.1 * SCALE),
    spacing: Math.round(0.6 * SCALE),
    fillRule: "EvenOdd",
    allowedRotations: [0, 90],
    sheet: {
      width: Math.round(100 * SCALE),
      height: Math.round(90 * SCALE),
      margins: {
        left: Math.round(4 * SCALE),
        top: Math.round(4 * SCALE),
        right: Math.round(4 * SCALE),
        bottom: Math.round(4 * SCALE)
      }
    }
  };

  const scaledTemplate = scaleToInt(toyTemplate(), SCALE);
  const scaledTiles: GridTile[] = toyTiles().map((tile) => ({
    id: tile.id,
    rect: scaleRect(tile.rect, SCALE)
  }));

  const fallbackGridSheets = buildBaselineGridSheets(scaledTemplate, scaledTiles, config);

  const result = splitAndPack(
    {
      ...scaledTemplate,
      fallbackGridSheets
    },
    scaledTiles,
    config
  );

  printHeader("Pipeline Metrics");
  console.log(result.metrics);
  console.log("tileShardCounts", result.debug.tileShardCounts);
  console.log("splitShardCount", result.debug.splitShardCount);
  console.log("keptShardCount", result.debug.keptShardCount);
  console.log("droppedShardIds", result.debug.droppedShardIds);

  if (result.mode === "optimized") {
    printHeader("Optimized SVG Sheets");
    for (const sheet of result.sheets) {
      const svg = renderSheetSvg(sheet, { scaleDown: SCALE });
      console.log(`--- ${sheet.id} ---`);
      console.log(svg);
    }

    printHeader("Debug Dump");
    console.log(debugRenderPipelineState("optimized", result.sheets, { scaleDown: SCALE }));
  } else {
    printHeader("Fallback Triggered");
    console.log(result.reason);
  }

  const forcedFallback = splitAndPack(
    {
      ...scaledTemplate,
      fallbackGridSheets
    },
    scaledTiles,
    {
      ...config,
      forceKernelFailure: true
    }
  );

  printHeader("Forced Fallback Check");
  console.log(forcedFallback.mode);
  if (forcedFallback.mode === "fallback") {
    console.log("fallbackSheets", forcedFallback.fallbackGridSheets.length);
    console.log("reason", forcedFallback.reason);
  }
}

runDemo();
