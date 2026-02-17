import { pointEquals, roundInt } from "./geometryUtils.js";
import type { PolylineInt, RectInt } from "./types.js";

function clipSegmentByRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: RectInt
): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;

  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rect.left, rect.right - x0, y0 - rect.top, rect.bottom - y0];

  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) {
        return null;
      }
      continue;
    }

    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) {
        return null;
      }
      if (r > t0) {
        t0 = r;
      }
    } else {
      if (r < t0) {
        return null;
      }
      if (r < t1) {
        t1 = r;
      }
    }
  }

  if (t0 > t1) {
    return null;
  }

  const nx0 = x0 + t0 * dx;
  const ny0 = y0 + t0 * dy;
  const nx1 = x0 + t1 * dx;
  const ny1 = y0 + t1 * dy;

  return [roundInt(nx0), roundInt(ny0), roundInt(nx1), roundInt(ny1)];
}

export function clipPolylineByRect(polyline: PolylineInt, rect: RectInt): PolylineInt[] {
  if (polyline.length < 2) {
    return [];
  }

  const segments: PolylineInt[] = [];

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const clipped = clipSegmentByRect(a.x, a.y, b.x, b.y, rect);
    if (!clipped) {
      continue;
    }

    const [x0, y0, x1, y1] = clipped;
    const start = { x: x0, y: y0 };
    const end = { x: x1, y: y1 };

    if (pointEquals(start, end)) {
      continue;
    }

    segments.push([start, end]);
  }

  return segments;
}
