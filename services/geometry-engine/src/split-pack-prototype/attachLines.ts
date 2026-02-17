import { pointInPolygonWithHoles } from "./booleanKernel.js";
import {
  distanceSquared,
  midpoint,
  pointToSegmentDistanceSquared,
  ringEdges
} from "./geometryUtils.js";
import type { ClippedLineSegmentInt, PointInt, Shard } from "./types.js";

function polygonEdgeDistanceSquared(point: PointInt, shard: Shard): number {
  const rings = [shard.drawGeo.outer, ...shard.drawGeo.holes];
  let best = Number.POSITIVE_INFINITY;

  for (const ring of rings) {
    for (const [a, b] of ringEdges(ring)) {
      const dist = pointToSegmentDistanceSquared(point, a, b);
      if (dist < best) {
        best = dist;
      }
    }
  }

  return best;
}

export function attachSegmentsToShards(
  segments: ClippedLineSegmentInt[],
  shards: Shard[]
): Map<string, ClippedLineSegmentInt[]> {
  const attached = new Map<string, ClippedLineSegmentInt[]>();

  for (const segment of segments) {
    const start = segment.path[0];
    const end = segment.path[segment.path.length - 1];
    const segmentMid = midpoint(start, end);

    const candidateShards = shards.filter((shard) => shard.tileId === segment.tileId);
    if (candidateShards.length === 0) {
      continue;
    }

    const containing = candidateShards.filter((shard) =>
      pointInPolygonWithHoles(segmentMid, shard.drawGeo)
    );

    let target: Shard | undefined;

    if (containing.length > 0) {
      target = [...containing].sort((a, b) => a.id.localeCompare(b.id))[0];
    } else {
      target = [...candidateShards].sort((a, b) => {
        const centroidDelta =
          distanceSquared(segmentMid, a.centroid) - distanceSquared(segmentMid, b.centroid);
        if (centroidDelta !== 0) {
          return centroidDelta;
        }
        const edgeDelta =
          polygonEdgeDistanceSquared(segmentMid, a) - polygonEdgeDistanceSquared(segmentMid, b);
        if (edgeDelta !== 0) {
          return edgeDelta;
        }
        return a.id.localeCompare(b.id);
      })[0];
    }

    if (!target) {
      continue;
    }

    if (!attached.has(target.id)) {
      attached.set(target.id, []);
    }
    attached.get(target.id)?.push(segment);
  }

  for (const [shardId, shardSegments] of attached.entries()) {
    shardSegments.sort((a, b) => a.id.localeCompare(b.id));
    attached.set(shardId, shardSegments);
  }

  return attached;
}
