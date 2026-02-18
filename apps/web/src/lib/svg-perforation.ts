import type { CanonicalGeometry, LayerPath, Point2, SvgLayer } from '@torrify/shared-types';
import type { SvgPerforationOptions } from './export-contracts';

// Converts continuous cut/score segments into short cut-gap segments for toolchains
// (for example Cricut workflows) that need perforated paths.
function withLayer(layer: SvgLayer, points: Point2[], closed = false): LayerPath {
  return { layer, closed, points };
}

function pointAlongSegment(start: Point2, end: Point2, t: number): Point2 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function perforateSegment(
  start: Point2,
  end: Point2,
  layer: SvgLayer,
  cutLength: number,
  gapLength: number
): LayerPath[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLength = Math.sqrt(dx * dx + dy * dy);
  if (segmentLength <= 1e-9) {
    return [];
  }

  const result: LayerPath[] = [];
  // Extremely small step values can explode segment counts; clamp to a safe minimum.
  const step = Math.max(1e-6, cutLength + gapLength);
  let cursor = 0;

  while (cursor < segmentLength - 1e-9) {
    const cutStart = cursor;
    const cutEnd = Math.min(segmentLength, cutStart + cutLength);
    if (cutEnd - cutStart > 1e-9) {
      const t0 = cutStart / segmentLength;
      const t1 = cutEnd / segmentLength;
      result.push(withLayer(layer, [pointAlongSegment(start, end, t0), pointAlongSegment(start, end, t1)]));
    }
    cursor += step;
  }

  return result;
}

function perforatePath(path: LayerPath, cutLength: number, gapLength: number): LayerPath[] {
  const points = path.points;
  if (points.length < 2) {
    return [path];
  }

  const segments: LayerPath[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push(...perforateSegment(points[i], points[i + 1], path.layer, cutLength, gapLength));
  }

  if (path.closed && points.length >= 3) {
    segments.push(...perforateSegment(points[points.length - 1], points[0], path.layer, cutLength, gapLength));
  }

  return segments.length ? segments : [path];
}

export function applySvgPerforation(
  geometry: CanonicalGeometry,
  perforation?: SvgPerforationOptions
): CanonicalGeometry {
  if (!perforation?.enabled) {
    return geometry;
  }

  // Default to perforating score lines only when layers are unspecified.
  const layers = new Set<SvgLayer>(
    perforation.layers && perforation.layers.length > 0 ? perforation.layers : ['score']
  );
  const cutLength = Math.max(0.05, perforation.cutLength);
  const gapLength = Math.max(0.05, perforation.gapLength);

  return {
    ...geometry,
    template: {
      ...geometry.template,
      paths: geometry.template.paths.flatMap((path) => {
        if (!layers.has(path.layer)) {
          return [path];
        }
        return perforatePath(path, cutLength, gapLength);
      })
    }
  };
}
