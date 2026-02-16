# SVG Split-Closure Fix Summary

## What was broken
Split-sheet exports had open cut contours on internal sheet boundaries. In some pages, the old logic also created small local closure triangles while missing the larger contour that should close across the full split shape.

## Root causes
In `apps/web/src/lib/exports.ts`, `addSplitClosureCutLines` originally:

1. Paired odd boundary points only on the same side.
2. Dropped corner boundary points.
3. Paired per connected component, which could over-close local fragments and miss global boundary closures.

## What we changed
All changes were made in `apps/web/src/lib/exports.ts`:

1. Replaced same-side pairing with perimeter parameterization (`t`) over the full tile boundary.
2. Kept `allowedSides` constraints so outer non-split edges are never routed as closure cuts.
3. Added corner-aware boundary tracing that inserts corners when routing between sides.
4. Evaluated both clockwise and counter-clockwise routes, selecting a valid shortest route.
5. Added a guard to reject full-edge cuts.
6. Switched pairing from per-component to global perimeter pairing of odd boundary endpoints (while still respecting disallowed-side splits).

## Regression coverage
Added/validated tests in `apps/web/src/lib/exports.test.ts`:

1. Existing split closure tests remain passing.
2. New test: `frustum top-middle sheet closes all odd endpoints on internal boundaries`.

This verifies the specific `sheet-r1-c2` failure mode where small triangles were formed and larger contour closure was missed.

## Validation run

Command:
```bash
npm run -w @torrify/web test
```

Result: all web tests passed.
