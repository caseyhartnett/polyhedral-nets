import { rectHeight, rectWidth } from "./geometryUtils.js";
import type { Shard } from "./types.js";

export interface ArtifactFilterResult {
  kept: Shard[];
  dropped: Shard[];
}

export function filterDegenerates(
  shards: Shard[],
  AREA_EPS: number,
  DIM_EPS: number
): ArtifactFilterResult {
  const kept: Shard[] = [];
  const dropped: Shard[] = [];

  for (const shard of shards) {
    const width = rectWidth(shard.bbox);
    const height = rectHeight(shard.bbox);

    if (shard.area < AREA_EPS || width < DIM_EPS || height < DIM_EPS) {
      dropped.push(shard);
      continue;
    }
    kept.push(shard);
  }

  kept.sort((a, b) => a.id.localeCompare(b.id));
  dropped.sort((a, b) => a.id.localeCompare(b.id));

  return { kept, dropped };
}
