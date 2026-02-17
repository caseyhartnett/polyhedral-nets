import { intersectionPolygons, polygonToPaths } from "./booleanKernel.js";
import { rectToPath } from "./geometryUtils.js";
import type { PolygonWithHolesInt, RectInt } from "./types.js";

export function clipPolygonByRect(
  polygon: PolygonWithHolesInt,
  rect: RectInt,
  fillRule: "EvenOdd" | "NonZero"
): PolygonWithHolesInt[] {
  const clipped = intersectionPolygons(polygonToPaths(polygon), [rectToPath(rect)], fillRule);
  return clipped.map((piece, index) => ({
    ...piece,
    id: `${polygon.id}::clip-${index}`
  }));
}
