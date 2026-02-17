import { filterDegenerates } from "./artifactFilter.js";
import { attachSegmentsToShards } from "./attachLines.js";
import { offsetPolygon } from "./booleanKernel.js";
import { clipPolygonByRect } from "./clipCutGeometry.js";
import { clipPolylineByRect } from "./clipLines.js";
import {
  bboxOfPolygonInt,
  centroidOfPathInt,
  rectHeight,
  rectWidth,
  signedArea,
  sortByKey,
  translatePathInt,
  translatePolygonInt
} from "./geometryUtils.js";
import { packShardsIntoSheets } from "./packer.js";
import type {
  ClippedLineSegmentInt,
  Config,
  GridTile,
  LineFeatureInt,
  PipelineDebug,
  PipelineMetrics,
  PipelineResult,
  PolygonWithHolesInt,
  Sheet,
  Shard,
  TemplateGeometryInt,
  TemplateInputInt
} from "./types.js";

interface SplitResult {
  shards: Shard[];
  clippedLineSegments: ClippedLineSegmentInt[];
  tileShardCounts: Record<string, number>;
}

function polygonArea(poly: PolygonWithHolesInt): number {
  const outer = Math.abs(signedArea(poly.outer));
  const holes = poly.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
  return outer - holes;
}

function sortTiles(gridTiles: GridTile[]): GridTile[] {
  return [...gridTiles].sort((a, b) => a.id.localeCompare(b.id));
}

function splitByGrid(
  template: TemplateGeometryInt,
  gridTiles: GridTile[],
  fillRule: "EvenOdd" | "NonZero"
): SplitResult {
  const shards: Shard[] = [];
  const clippedLineSegments: ClippedLineSegmentInt[] = [];
  const tileShardCounts: Record<string, number> = {};

  const sortedTiles = sortTiles(gridTiles);
  const sortedPolygons = sortByKey(template.cutPolygons, (polygon) => polygon.id);
  const lines: LineFeatureInt[] = sortByKey(
    [...template.scoreLines, ...template.guideLines],
    (line) => `${line.kind}:${line.id}`
  );

  for (const tile of sortedTiles) {
    const tileStartCount = shards.length;

    for (const polygon of sortedPolygons) {
      const clipped = clipPolygonByRect(polygon, tile.rect, fillRule);
      for (let pieceIndex = 0; pieceIndex < clipped.length; pieceIndex += 1) {
        const piece = clipped[pieceIndex];
        const shardId = `${polygon.id}::${tile.id}::${pieceIndex}`;
        const drawGeo: PolygonWithHolesInt = {
          ...piece,
          id: shardId
        };
        const box = bboxOfPolygonInt(drawGeo);

        shards.push({
          id: shardId,
          sourcePolygonId: polygon.id,
          tileId: tile.id,
          drawGeo,
          packGeo: [drawGeo],
          area: polygonArea(drawGeo),
          bbox: box,
          width: rectWidth(box),
          height: rectHeight(box),
          centroid: centroidOfPathInt(drawGeo.outer),
          lines: []
        });
      }
    }

    tileShardCounts[tile.id] = shards.length - tileStartCount;

    for (const line of lines) {
      const clippedLines = clipPolylineByRect(line.path, tile.rect);
      for (let segmentIndex = 0; segmentIndex < clippedLines.length; segmentIndex += 1) {
        clippedLineSegments.push({
          id: `${line.id}::${tile.id}::${segmentIndex}`,
          sourceLineId: line.id,
          tileId: tile.id,
          kind: line.kind,
          path: clippedLines[segmentIndex]
        });
      }
    }
  }

  clippedLineSegments.sort((a, b) => a.id.localeCompare(b.id));
  shards.sort((a, b) => a.id.localeCompare(b.id));

  const attachment = attachSegmentsToShards(clippedLineSegments, shards);
  for (const shard of shards) {
    shard.lines = attachment.get(shard.id) ?? [];
  }

  return {
    shards,
    clippedLineSegments,
    tileShardCounts
  };
}

function localizeShard(shard: Shard, config: Config): Shard {
  const box = shard.bbox;
  const dx = -box.left;
  const dy = -box.top;

  const drawGeoLocalized = translatePolygonInt(shard.drawGeo, dx, dy);
  const linesLocalized = shard.lines.map((line) => ({
    ...line,
    path: translatePathInt(line.path, dx, dy)
  }));

  const packGeoLocalized =
    config.spacing > 0
      ? offsetPolygon(drawGeoLocalized, config.spacing, config.fillRule)
      : [drawGeoLocalized];

  if (packGeoLocalized.length === 0) {
    throw new Error(`Offset produced empty pack geometry for shard ${shard.id}`);
  }

  const localizedBox = bboxOfPolygonInt(drawGeoLocalized);

  return {
    ...shard,
    drawGeo: drawGeoLocalized,
    packGeo: packGeoLocalized,
    lines: linesLocalized,
    bbox: localizedBox,
    width: rectWidth(localizedBox),
    height: rectHeight(localizedBox),
    centroid: centroidOfPathInt(drawGeoLocalized.outer)
  };
}

function baselineSheetRect(config: Config): { left: number; top: number; right: number; bottom: number } {
  return {
    left: 0,
    top: 0,
    right: config.sheet.width,
    bottom: config.sheet.height
  };
}

export function buildBaselineGridSheets(
  template: TemplateGeometryInt,
  gridTiles: GridTile[],
  config: Config
): Sheet[] {
  const split = splitByGrid(template, gridTiles, config.fillRule);
  const byTile = new Map<string, Shard[]>();

  for (const shard of split.shards) {
    if (!byTile.has(shard.tileId)) {
      byTile.set(shard.tileId, []);
    }
    byTile.get(shard.tileId)?.push(shard);
  }

  const sheets: Sheet[] = [];
  for (const tile of sortTiles(gridTiles)) {
    const tileShards = byTile.get(tile.id) ?? [];
    const dx = config.sheet.margins.left - tile.rect.left;
    const dy = config.sheet.margins.top - tile.rect.top;

    sheets.push({
      id: `grid-${tile.id}`,
      rect: baselineSheetRect(config),
      placed: tileShards.map((shard) => {
        const placedDraw = translatePolygonInt(shard.drawGeo, dx, dy);
        const placedBox = bboxOfPolygonInt(placedDraw);

        return {
          shard,
          placement: {
            shardId: shard.id,
            sheetId: `grid-${tile.id}`,
            x: placedBox.left,
            y: placedBox.top,
            rotation: 0,
            bbox: placedBox
          },
          drawGeoPlaced: placedDraw,
          packGeoPlaced: [placedDraw],
          linesPlaced: shard.lines.map((line) => ({
            ...line,
            path: translatePathInt(line.path, dx, dy)
          }))
        };
      })
    });
  }

  return sheets;
}

function makeMetrics(
  baselineSheetCount: number,
  optimizedSheetCount: number,
  shardCount: number,
  droppedArtifacts: number,
  startedMs: number
): PipelineMetrics {
  return {
    baselineSheetCount,
    optimizedSheetCount,
    shardCount,
    droppedArtifacts,
    runtimeMs: Date.now() - startedMs
  };
}

export function splitAndPack(
  template: TemplateInputInt,
  gridTiles: GridTile[],
  config: Config
): PipelineResult {
  const startedMs = Date.now();

  const fallbackGridSheets =
    template.fallbackGridSheets ??
    (() => {
      try {
        return buildBaselineGridSheets(template, gridTiles, config);
      } catch {
        return [];
      }
    })();
  const baselineSheetCount = fallbackGridSheets.length > 0 ? fallbackGridSheets.length : gridTiles.length;

  const debug: PipelineDebug = {
    tileShardCounts: {},
    droppedShardIds: [],
    splitShardCount: 0,
    keptShardCount: 0
  };

  try {
    if (config.forceKernelFailure) {
      throw new Error("Forced kernel failure for fallback validation");
    }

    const split = splitByGrid(template, gridTiles, config.fillRule);
    debug.tileShardCounts = split.tileShardCounts;
    debug.splitShardCount = split.shards.length;

    const filtered = filterDegenerates(split.shards, config.AREA_EPS, config.DIM_EPS);
    debug.droppedShardIds = filtered.dropped.map((shard) => shard.id);

    const localized = filtered.kept.map((shard) => localizeShard(shard, config));
    debug.keptShardCount = localized.length;

    const sheets = packShardsIntoSheets(localized, config);

    return {
      mode: "optimized",
      sheets,
      debug,
      metrics: makeMetrics(
        baselineSheetCount,
        sheets.length,
        localized.length,
        filtered.dropped.length,
        startedMs
      )
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown pipeline failure";

    return {
      mode: "fallback",
      fallbackGridSheets,
      reason,
      debug,
      metrics: makeMetrics(baselineSheetCount, baselineSheetCount, 0, 0, startedMs)
    };
  }
}
