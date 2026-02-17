import { polygonsOverlap } from "./booleanKernel.js";
import {
  rectContainsRect,
  rectIntersects,
  rectToPath,
  rectWidth,
  rotatePathInBox,
  rotatePolygonInBox,
  rotatedDims,
  translatePathInt,
  translatePolygonInt
} from "./geometryUtils.js";
import type {
  Config,
  LineFeatureInt,
  Placement,
  PlacedShard,
  PolygonWithHolesInt,
  RectInt,
  Rotation,
  Shard,
  Sheet
} from "./types.js";

interface CandidatePoint {
  x: number;
  y: number;
}

interface RotatedShardVariant {
  rotation: Rotation;
  width: number;
  height: number;
  drawGeo: PolygonWithHolesInt;
  packGeo: PolygonWithHolesInt[];
  lines: LineFeatureInt[];
}

function sheetRect(config: Config): RectInt {
  return {
    left: 0,
    top: 0,
    right: config.sheet.width,
    bottom: config.sheet.height
  };
}

function contentRect(config: Config): RectInt {
  return {
    left: config.sheet.margins.left,
    top: config.sheet.margins.top,
    right: config.sheet.width - config.sheet.margins.right,
    bottom: config.sheet.height - config.sheet.margins.bottom
  };
}

function candidateKey(point: CandidatePoint): string {
  return `${point.x},${point.y}`;
}

function candidateSort(a: CandidatePoint, b: CandidatePoint): number {
  if (a.y !== b.y) {
    return a.y - b.y;
  }
  return a.x - b.x;
}

function collectCandidates(placed: PlacedShard[], content: RectInt): CandidatePoint[] {
  const raw: CandidatePoint[] = [{ x: content.left, y: content.top }];

  for (const placedShard of placed) {
    const box = placedShard.placement.bbox;
    raw.push({ x: box.right, y: box.top });
    raw.push({ x: box.left, y: box.bottom });
  }

  const deduped = new Map<string, CandidatePoint>();
  for (const point of raw) {
    deduped.set(candidateKey(point), point);
  }

  return [...deduped.values()].sort(candidateSort);
}

function buildVariant(shard: Shard, rotation: Rotation): RotatedShardVariant {
  const dims = rotatedDims(shard.width, shard.height, rotation);
  const drawGeo = rotatePolygonInBox(shard.drawGeo, shard.width, shard.height, rotation);
  const packGeo = shard.packGeo.map((poly) => rotatePolygonInBox(poly, shard.width, shard.height, rotation));
  const lines = shard.lines.map((line) => ({
    ...line,
    path: rotatePathInBox(line.path, shard.width, shard.height, rotation)
  }));

  return {
    rotation,
    width: dims.width,
    height: dims.height,
    drawGeo,
    packGeo,
    lines
  };
}

function placeVariantAt(
  shard: Shard,
  variant: RotatedShardVariant,
  sheetId: string,
  x: number,
  y: number
): PlacedShard {
  const placement: Placement = {
    shardId: shard.id,
    sheetId,
    x,
    y,
    rotation: variant.rotation,
    bbox: {
      left: x,
      top: y,
      right: x + variant.width,
      bottom: y + variant.height
    }
  };

  return {
    shard,
    placement,
    drawGeoPlaced: translatePolygonInt(variant.drawGeo, x, y),
    packGeoPlaced: variant.packGeo.map((poly) => translatePolygonInt(poly, x, y)),
    linesPlaced: variant.lines.map((line) => ({
      ...line,
      path: translatePathInt(line.path, x, y)
    }))
  };
}

function hasCollision(
  candidate: PlacedShard,
  placed: PlacedShard[],
  fillRule: "EvenOdd" | "NonZero"
): boolean {
  for (const other of placed) {
    if (!rectIntersects(candidate.placement.bbox, other.placement.bbox)) {
      continue;
    }

    if (polygonsOverlap(candidate.packGeoPlaced, other.packGeoPlaced, fillRule)) {
      return true;
    }
  }
  return false;
}

function fitsContent(candidate: PlacedShard, content: RectInt): boolean {
  return rectContainsRect(content, candidate.placement.bbox);
}

function settlePlacement(
  placedCandidate: PlacedShard,
  placed: PlacedShard[],
  content: RectInt,
  fillRule: "EvenOdd" | "NonZero"
): PlacedShard {
  let current = placedCandidate;
  let moved = true;

  while (moved) {
    moved = false;

    const xCandidates = [content.left, ...placed.map((entry) => entry.placement.bbox.right)]
      .filter((x) => x <= current.placement.x)
      .sort((a, b) => a - b);

    for (const x of xCandidates) {
      const attempt = placeVariantAt(
        current.shard,
        {
          rotation: current.placement.rotation,
          width: rectWidth(current.placement.bbox),
          height: current.placement.bbox.bottom - current.placement.bbox.top,
          drawGeo: translatePolygonInt(current.drawGeoPlaced, -current.placement.x, -current.placement.y),
          packGeo: current.packGeoPlaced.map((poly) =>
            translatePolygonInt(poly, -current.placement.x, -current.placement.y)
          ),
          lines: current.linesPlaced.map((line) => ({
            ...line,
            path: translatePathInt(line.path, -current.placement.x, -current.placement.y)
          }))
        },
        current.placement.sheetId,
        x,
        current.placement.y
      );

      if (fitsContent(attempt, content) && !hasCollision(attempt, placed, fillRule)) {
        if (attempt.placement.x < current.placement.x) {
          current = attempt;
          moved = true;
        }
        break;
      }
    }

    const yCandidates = [content.top, ...placed.map((entry) => entry.placement.bbox.bottom)]
      .filter((y) => y <= current.placement.y)
      .sort((a, b) => a - b);

    for (const y of yCandidates) {
      const attempt = placeVariantAt(
        current.shard,
        {
          rotation: current.placement.rotation,
          width: rectWidth(current.placement.bbox),
          height: current.placement.bbox.bottom - current.placement.bbox.top,
          drawGeo: translatePolygonInt(current.drawGeoPlaced, -current.placement.x, -current.placement.y),
          packGeo: current.packGeoPlaced.map((poly) =>
            translatePolygonInt(poly, -current.placement.x, -current.placement.y)
          ),
          lines: current.linesPlaced.map((line) => ({
            ...line,
            path: translatePathInt(line.path, -current.placement.x, -current.placement.y)
          }))
        },
        current.placement.sheetId,
        current.placement.x,
        y
      );

      if (fitsContent(attempt, content) && !hasCollision(attempt, placed, fillRule)) {
        if (attempt.placement.y < current.placement.y) {
          current = attempt;
          moved = true;
        }
        break;
      }
    }
  }

  return current;
}

function tryPlaceOnSheet(
  shard: Shard,
  sheet: Sheet,
  config: Config,
  content: RectInt
): PlacedShard | null {
  const variants = config.allowedRotations
    .map((rotation) => buildVariant(shard, rotation))
    .sort((a, b) => a.rotation - b.rotation);

  const candidates = collectCandidates(sheet.placed, content);

  for (const variant of variants) {
    for (const candidate of candidates) {
      const placedCandidate = placeVariantAt(shard, variant, sheet.id, candidate.x, candidate.y);
      if (!fitsContent(placedCandidate, content)) {
        continue;
      }
      if (hasCollision(placedCandidate, sheet.placed, config.fillRule)) {
        continue;
      }

      return settlePlacement(placedCandidate, sheet.placed, content, config.fillRule);
    }
  }

  return null;
}

function createEmptySheet(index: number, config: Config): Sheet {
  return {
    id: `sheet-${index}`,
    rect: sheetRect(config),
    placed: []
  };
}

function shardSort(a: Shard, b: Shard): number {
  if (b.area !== a.area) {
    return b.area - a.area;
  }
  if (b.height !== a.height) {
    return b.height - a.height;
  }
  if (b.width !== a.width) {
    return b.width - a.width;
  }
  return a.id.localeCompare(b.id);
}

export function packShardsIntoSheets(shards: Shard[], config: Config): Sheet[] {
  if (shards.length === 0) {
    return [];
  }

  const sortedShards = [...shards].sort(shardSort);
  const sheets: Sheet[] = [createEmptySheet(1, config)];
  const content = contentRect(config);

  for (const shard of sortedShards) {
    let placed = false;

    for (const sheet of sheets) {
      const attempt = tryPlaceOnSheet(shard, sheet, config, content);
      if (!attempt) {
        continue;
      }
      sheet.placed.push(attempt);
      placed = true;
      break;
    }

    if (placed) {
      continue;
    }

    const newSheet = createEmptySheet(sheets.length + 1, config);
    const onNewSheet = tryPlaceOnSheet(shard, newSheet, config, content);
    if (!onNewSheet) {
      throw new Error(`Shard ${shard.id} does not fit in configured sheet bounds`);
    }
    newSheet.placed.push(onNewSheet);
    sheets.push(newSheet);
  }

  return sheets;
}

export function sheetContentPath(config: Config): PolygonWithHolesInt {
  return {
    id: "sheet-content",
    outer: rectToPath(contentRect(config)),
    holes: []
  };
}
