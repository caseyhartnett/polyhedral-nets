# Sheet Packing Optimization Plan (Updated Status)

Last updated: February 17, 2026 (post-overlap fix)

## Problem Statement

Large templates currently need multi-sheet export when they exceed one target material (Letter, A4, Cricut mat, custom).  
Simple grid tiling can waste space because nets are irregular, so the goal is to reduce final sheet count by repacking split pieces.

---

## Current Pipeline

```text
ShapeDefinition
  → buildCanonicalGeometry()                [geometry-engine]
  → buildSvgPagesForLayout()                [apps/web/src/lib/exports.ts]
    → Resolve material + margins
    → Grid split + clip + translate + closure cuts
    → If optimizePacking=false: keep grid pages
    → If optimizePacking=true:
        → Extract connected split components ("shards")
        → Pack shard bounding boxes with MaxRects-style placement
        → Run polygon-aware migration pass (convex-hull collision checks)
        → If packed sheet count is better: output packed pages
        → Else: fallback to grid pages
        → Optionally append Assembly Guide page
```

---

## Implementation Status

### Phase 1: Component Extraction

Status: Implemented (v1)

- Built adjacency graph from split cut segments.
- Flood-filled connected cut components.
- Attached score/guide paths to components (overlap first, nearest-center fallback).
- Reused existing closure-cut logic (`addSplitClosureCutLines`) to ensure shard boundaries stay cuttable.

### Phase 2: Bin Packing / Nesting

Status: Implemented (v2 heuristic + polygon-aware refinement)

- Uses rectangle packing on shard bounding boxes.
- Supports optional 90-degree rotation.
- Uses Best Short Side Fit + tie-breakers.
- Splits all intersecting free rectangles per placement and normalizes free-rect list (containment + dedupe).
- Tries multiple component ordering strategies (area, max side, width, height, perimeter) and keeps best result.
- Shape-aware ordering (v1): uses estimated footprint density from shard cut geometry (convex-hull area / bbox area).
- Local refinement (v1): bounded adjacent-swap hill-climb on component order to improve pack outcome.
- Tiny-shard mitigation (v1): components under ~1 cm² are grouped into nearest neighbors before packing.
- Polygon collision-aware refinement (v2): after rectangle packing, attempts to migrate pieces from later sheets to earlier sheets using bounding-box collision with 0.5 mm inter-component padding and deterministic anchor/grid search.
- Determinism guardrails: tie-break sorting + deterministic migration order + regression tests for repeated-run stability.
- Free-rect normalization (v2 fix): dedup-first ordering in `normalizePackingRects` prevents identical rects from being eliminated by containment check.
- Hull estimation (v2 fix): `estimateComponentHull` uses all path points (cut + score + guide), not just cut paths.
- Safe fallback: keeps original grid output if packing is not better.

Not yet implemented:
- True irregular-shape nesting / NFP collision search.
- Arbitrary-angle rotation beyond 0/90° orientation.

### Phase 3: Assembly Aids

Status: Implemented (v1)

- Optional extra SVG page: `Assembly Guide`.
- Shows original full (unpacked) template.
- Overlays original grid split lines.
- Labels shard locations with packed destination: `Sheet N - Piece X`.
- Page metadata now distinguishes:
  - `kind: "sheet"`
  - `kind: "assembly-guide"`

### Phase 4: Integration & UI

Status: Implemented

UI controls near Target Material (`apps/web/src/routes/app/+page.svelte`):

- `Optimize sheet packing (experimental)`
- `Allow 90-degree rotation while packing`
- `Include assembly guide SVG page`

Current defaults:

- `optimizePacking`: `false`
- `allowRotation`: `true`
- `includeAssemblyGuide`: `true`

Preview behavior:

- `Combined Split Map` now shows material-grid split lines as a stable reference map.
- Packed differences are inspected in `Page by Page` (packed sheet pages + optional assembly guide page).
- Output summary "SVG sheets" counts only real sheet pages, not assembly guide pages.

---

## File Map (Current)

- Packing + export integration: `apps/web/src/lib/exports.ts`
- UI controls + preview behavior: `apps/web/src/routes/app/+page.svelte`
- Automated coverage: `apps/web/src/lib/exports.test.ts`

---

## Milestone Status

| Milestone | Status | Notes |
|---|---|---|
| Component extraction | Done | Cut-component flood fill + non-cut attachment implemented. |
| MaxRects packer | Done (v1) | Multi-strategy ordering + robust free-rect splitting. |
| Polygon-aware migration refinement | Done (v2, fixed) | Bounding-box collision + 0.5 mm padding prevents overlap; still migrates shards across sheets. |
| Overlap regression tests | Done | Component-overlap detection tests for dodecahedron-70, dodecahedron-50, truncatedOctahedron-85, plus boundary checks. |
| Assembly guide | Done (v1) | Optional extra SVG page with shard→sheet labels. |
| UI integration | Done | Toggle controls and export wiring implemented. |
| NFP irregular nesting | Not started | Planned upgrade if more efficiency is needed. |

---

## Known Limitations

- Initial placement uses shard bounding rectangles; polygon-aware refinement migrates between sheets using bounding-box collision (not polygon-level nesting).
- Combined reference map intentionally does not depict packed arrangement; use page previews + assembly guide for packed output inspection.
- Tiny-shard handling currently groups by bounding-box area heuristic (not full polygon area).

## Bug Fixes Applied (v2)

| Issue | Root Cause | Fix |
|---|---|---|
| Overlapping pieces on packed sheets | `estimateComponentHull` only used cut-path points; score/guide paths extended beyond collision hull | Changed to use ALL path points for hull computation |
| Overlapping pieces on packed sheets | `convexPolygonsIntersect` SAT check allowed pieces in gaps between hulls and bounding boxes | Switched refinement collision check to bounding-box overlap with 0.5 mm padding |
| Potential free-rect loss | `normalizePackingRects` containment check eliminated both copies of identical rects | Reordered to dedup-first, then containment removal |

---

## Addendum: Code Audit & Simplification Analysis (Feb 17, 2026)

### Audit Scope

Manual review of the full packing pipeline in `exports.ts` (~1,300 lines, lines 224-2052), tested against dodecahedron at 70 mm on printer-letter paper with packing enabled.

### Remaining Visual Bugs (dodecahedron 70 mm, letter, packed)

| Location | Symptom | Likely Cause |
|---|---|---|
| Sheet 1, top-left corner | Tiny stray dashed line in the very corner | `addSplitClosureCutLines` pairs two boundary points that are both near the same tile corner, producing a near-degenerate closure segment that should be filtered out |
| Sheet 1, large shape | A large object taking up most of the sheet does not resemble a pentagon or slice of one | Segment-level clipping produces disconnected edges; closure cuts along the tile boundary create an irregular composite shape that doesn't reflect the original face geometry |
| Sheet 1, small parallelogram object | A small vertical line appears inside a tiny parallelogram-shaped piece | A score/guide line was assigned to a degenerate sliver component via the nearest-center fallback (line 1228); `mergeTinyPackableComponents` merges by bounding-box distance, not geometric containment |
| Sheet 2, bottom-right | Contents make no geometric sense | Component from polygon-aware migration placed using bounding-box collision only, allowing geometrically incoherent arrangements |

### Root Cause: Segment-Level Clipping Architecture

The fundamental problem is that the system operates at the **path-segment level**, not the **polygon level**:

1. `clipPathToRect` (line 269) clips each edge of a polygon independently via Liang-Barsky. A closed pentagon crossing a tile boundary becomes a set of disconnected 2-point line segments.

2. `addSplitClosureCutLines` (lines 392-903, ~500 lines) attempts to reconstruct closed regions by finding odd-degree vertices on tile boundaries and connecting them with boundary-tracing paths. This is the single most complex function in the file and the primary source of visual artifacts.

3. `extractConnectedSplitComponents` (line 1096) groups loose segments into connected components via vertex adjacency flood fill. Because segments were generated independently, resulting "components" can be oddly shaped, contain stray artifacts, or fail to resemble the original polygon faces.

**In short**: the pipeline destroys polygon topology during clipping, then tries to reconstruct it heuristically -- a fundamentally lossy approach.

### Complexity Breakdown

| Function | Lines | Purpose | Complexity |
|---|---|---|---|
| `addSplitClosureCutLines` | ~500 | Boundary tracing + closure cut generation | Very high -- perimeter math, pairing strategies, disallowed-side filtering, CW/CCW tracing, corner interpolation |
| `extractConnectedSplitComponents` | ~155 | Flood-fill component grouping from segments | Moderate -- adjacency graph + non-cut path attachment heuristic |
| `packSplitTilesOntoSheets` + helpers | ~470 | MaxRects packing + migration + multi-strategy | Moderate -- standard algorithm, reasonable |
| `clipPathToRect` / `clipSegmentToRect` | ~70 | Segment-level Liang-Barsky clipping | Low -- standard algorithm |

The closure-cut function alone is ~500 lines and is where nearly every visual bug originates.

### Existing Package Ecosystem

| Package | npm weekly downloads | Type | Relevance |
|---|---|---|---|
| `polygon-clipping` | ~88 dependents, 615 GitHub stars | Boolean polygon ops (intersection, union, difference, xor) | **High** -- could replace segment-level clipping + closure cuts entirely by performing proper polygon-rectangle intersection |
| `polyclip-ts` | TypeScript alternative to above | Same boolean ops, native TS | **High** -- same benefit, TypeScript-native |
| `SVGnest` / `json-nest` | 2,504 GitHub stars (SVGnest) | True irregular NFP nesting + genetic algorithm | Medium -- full nesting solution but `json-nest` TS port is unmaintained |
| `potpack` | 4.9M weekly | Rectangle packing into near-square containers | Low -- essentially what the custom MaxRects code already does |
| `@flatten-js/core` | 33K weekly | 2D geometry primitives + polygon operations | Medium -- could help with polygon containment/intersection checks |
| `bin-pack` | 140K weekly | Binary tree rectangle packing | Low -- same as potpack |

### Recommended Simplification Path

**Replace the segment-level clipping pipeline with proper polygon clipping using `polygon-clipping` or `polyclip-ts`.**

Current pipeline:

```text
paths -> clipSegmentToRect (per edge) -> loose segments
      -> addSplitClosureCutLines (~500 lines) -> closure cuts
      -> extractConnectedSplitComponents -> flood-fill groups
```

Proposed pipeline:

```text
paths -> reconstruct closed polygons
      -> polygon-clipping intersection(polygon, tileRect)
      -> proper clipped polygons (already closed, correct topology)
```

#### What this eliminates

- The entire `addSplitClosureCutLines` function (~500 lines)
- Most of `extractConnectedSplitComponents` complexity (clipped polygons are already proper closed shapes)
- All four visual bugs listed above (no more stray segments, degenerate slivers, or wrongly-shaped components)

#### What stays the same

- `packSplitTilesOntoSheets` and its MaxRects packing -- working correctly, standard algorithm
- Multi-strategy ordering + hill climbing -- reasonable optimization layer
- Polygon-aware migration -- useful for cross-sheet consolidation
- Assembly guide generation -- independent of clipping

#### Risk assessment

- `polygon-clipping` is mature (615 stars, actively maintained, MIT license, GeoJSON-compatible)
- The MaxRects packer and migration code are not the source of bugs and can remain untouched
- Fallback to grid pages is already implemented as a safety net
- Estimated net code reduction: ~500-600 lines removed, ~50-100 lines added for polygon reconstruction + library integration
