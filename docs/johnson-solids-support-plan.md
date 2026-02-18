# Johnson Solids Support Plan (J1-J92)

## Goal
Add first-class support for all 92 Johnson solids in polyhedron mode and complete the template-construction tab options so users can select shapes by:
- curated catalog
- Johnson index (`J1`-`J92`)
- construction family/recipe

This plan is scoped to the current architecture:
- `apps/web` (Svelte UI)
- `packages/shared-types` (schema + types)
- `services/geometry-engine` (mesh/net/export)

## Current Baseline
The app supports **10 schema preset values** (`PolyhedronPresetSchema` enum) yielding **14 catalog entries** in the UI:

Schema presets: `tetrahedron`, `cube`, `octahedron`, `icosahedron`, `dodecahedron`, `cuboctahedron`, `truncatedOctahedron`, `regularPrism`, `regularAntiprism`, `regularBipyramid`

Catalog entries include parameterized variants (e.g., triangular / pentagonal / hexagonal prism via `regularPrism` with different `ringSides`; square / pentagonal antiprism; triangular / pentagonal bipyramid).

Polyhedron UI has two subtabs (`PolyhedronInputMode: 'catalog' | 'family'`):
- `Catalog` — pre-vetted solids via `POLYHEDRON_CATALOG_OPTIONS`
- `Family` — parametric families (prism / antiprism / bipyramid with side-count slider)

Geometry engine (`services/geometry-engine/src/index.ts`, ~2000 lines) dispatches via `buildPolyhedronMesh()` to:
- `rawPresetVertices()` + `buildConvexHullFaces()` for static-coordinate presets (Platonic / Archimedean)
- `buildRegularPrismMesh()`, `buildRegularAntiprismMesh()`, `buildRegularBipyramidMesh()` for parameterized families

Net unfolding (`buildPolyhedronNet()`) tries up to **12 root-face candidates** (hardcoded cap), sorted by vertex count then centroid position, selecting the best layout by area/aspect quality metric.

## Overlap with Existing Presets
Two Johnson solids already have exact equivalents in the app:
- **J12** (triangular dipyramid) = `regularBipyramid` with `ringSides: 3`
- **J13** (pentagonal dipyramid) = `regularBipyramid` with `ringSides: 5`

**Strategy:** maintain both paths. The Johnson tab surfaces J12/J13 entries, but under the hood they delegate to the existing bipyramid builder via an `aliasPreset` mapping. Existing Family tab entries remain unchanged. This avoids duplicate geometry code and keeps backward compatibility.

## Target Outcome
- All Johnson solids (`J1` through `J92`) generate deterministic mesh, unfolded net, and SVG/PDF/STL outputs.
- Polyhedron input area expands to three tabs (four with optional Recipe):
  - `Catalog` — quick picks (existing solids plus curated Johnson highlights)
  - `Johnson` — full indexed list with search and filter
  - `Family` — procedural families (unchanged)
  - `Recipe` — constructive composition (optional phase-2)
- Existing functionality remains backward compatible.

## Delivery Strategy
Staged rollout to reduce risk:

1. Foundation: types, catalog registry, coordinate data sourcing
2. Geometry engine: Johnson mesh builders + validation
3. UI: Johnson tab, search, filter
4. Testing and performance hardening
5. Docs and release

---

## Phase 1: Foundation (Types + Registry + Coordinate Data)

### 1.1 Canonical solid registry
Create a single source of truth for all 92 Johnson solids.

**New file:** `packages/shared-types/src/johnson-catalog.ts`

Each entry includes:
- `id` — `"j1"` through `"j92"`
- `johnsonIndex` — 1–92
- `name` — e.g., `"Square Pyramid"`, `"Pentagonal Cupola"`
- `family` — construction family string (see 1.2)
- `faceSignature` — polygon-size counts, e.g., `{ 3: 4, 4: 1 }` for J1
- `vertexCount`, `edgeCount`, `faceCount`
- `buildMethod` — `"coordinates"` | `"alias"` | `"construction"`
- `aliasPreset` — optional, for J12/J13 mapping to existing builders
- `aliasRingSides` — optional, companion to `aliasPreset`

### 1.2 Johnson family groupings
Group by construction family for UI filtering and staged implementation:

| Family | Approx. Johnson Indices | Count |
|---|---|---|
| Pyramids | J1–J2 | 2 |
| Cupolas | J3–J5 | 3 |
| Rotundas | J6 | 1 |
| Elongated pyramids/dipyramids | J7–J17 | 11 |
| Elongated cupolas/rotundas | J18–J25 | 8 |
| Gyroelongated cupolas/rotundas | J26–J29 | 4 |
| Augmented prisms | J30–J39 | 10 |
| Augmented Platonic/Archimedean | J40–J48 | 9 |
| Parabiaugmented/metabiaugmented | J49–J61 | 13 |
| Diminished/gyrate icosahedra | J62–J83 | 22 |
| Snub/miscellaneous | J84–J92 | 9 |

Exact index ranges must be finalized against the canonical enumeration (Wikipedia / Johnson 1966). Store the family string in the registry for UI filter binding.

### 1.3 Coordinate data sourcing
Canonical vertex coordinates for all 92 Johnson solids need a validated external source.

**Recommended approach (in priority order):**
1. **Algorithmic computation** where formulas are straightforward: pyramids, cupolas, rotundas, elongated/gyroelongated forms built from base polygon geometry. Produces exact unit-edge-length coordinates.
2. **Pre-computed sources** for complex solids: the dmccooey.com polyhedra database (widely referenced, public) or the Antiprism library (open-source, GPL-compatible). Cross-validate every coordinate set against known vertex/edge/face counts from encyclopedia references.
3. All coordinate sets normalized to **unit edge length, centered at origin**.

**Tooling:** Consider creating a script (`scripts/import-johnson-coords.mjs`) to process external data files (e.g. from dmccooey.com) into the TypeScript format required by `johnson-coordinates.ts`. This ensures reproducibility if data needs to be regenerated.

**Storage:** `services/geometry-engine/src/johnson-coordinates.ts` exporting a lookup keyed by Johnson ID. Keep this separate from mesh logic for maintainability.

**Validation gate:** no coordinate set is committed without passing the invariant checks defined in Phase 2.4.

### 1.4 Extend shared schema
Update `packages/shared-types/src/index.ts`:

- Add `"johnson"` to the `PolyhedronPresetSchema` enum.
- Add optional `johnsonId` field to `PolyhedronDefinitionSchema`:
  ```
  johnsonId: z.string().regex(/^j([1-9]|[1-8]\d|9[0-2])$/).optional()
  ```
- Add Zod `.superRefine()` rule: when `preset === "johnson"`, `johnsonId` must be present and valid.
- Keep `edgeLength` as the scale driver.
- Derive `faceMode` from registry metadata automatically — Johnson solids with heterogeneous face types get `"mixed"`, all-triangle solids get `"uniform"`.

### 1.5 Migration behavior
- Existing non-Johnson presets remain valid; no migration needed.
- If a definition has `preset: "johnson"` without a valid `johnsonId`, Zod refinement produces a clear validation error.
- Expand `PolyhedronInputMode` type from `'catalog' | 'family'` to `'catalog' | 'johnson' | 'family'`.

---

## Phase 2: Geometry Engine (J1–J92)

### 2.1 Module organization
The engine file is already ~2000 lines. Johnson support lives in dedicated modules:

- **`services/geometry-engine/src/johnson-coordinates.ts`** — raw coordinate data (map of Johnson ID to `Vec3[]`)
- **`services/geometry-engine/src/johnson-mesh.ts`** — `buildJohnsonMesh(johnsonId: string, edgeLength: number): MeshModel`
- **`services/geometry-engine/src/index.ts`** — remains the public API; add a dispatch branch in `buildPolyhedronMesh()` for `preset === "johnson"`

### 2.2 Mesh builder dispatch
In `buildPolyhedronMesh()` (currently at line ~1107), add before the generic preset path:
```typescript
if (preset === "johnson") {
  return buildJohnsonMesh(johnsonId!, edgeLength);
}
```

`buildJohnsonMesh` handles three paths:
- **Alias solids** (J12, J13): delegate to `buildRegularBipyramidMesh()` with the mapped `ringSides`.
- **Coordinate solids** (majority): look up raw vertices from `johnson-coordinates.ts`, scale via `scalePresetVertices()`, extract faces via `buildConvexHullFaces()`. This reuses the exact same pipeline as existing Platonic/Archimedean presets.
- **Construction solids** (phase-2 optional): compose from base operations (augment, diminish, gyrate, elongate, gyroelongate).

### 2.3 Implementation approach
**Initial delivery:** static canonical coordinates for all 92 solids. This is the fastest path to end-to-end coverage because:
- `buildConvexHullFaces()` already handles convex solids (all Johnson solids are strictly convex by definition)
- `scalePresetVertices()` already handles edge-length normalization
- No new geometric algorithms needed

**Optional phase-2 backfill:** replace coordinate data with constructive builders for solids that decompose naturally (elongated, augmented, diminished, gyrate families). Benefits: smaller data footprint, enables the Recipe tab, easier to audit correctness.

### 2.4 Geometry validation gates
Every Johnson solid builder must pass:
- All faces are regular polygons within tolerance (edge length deviation < 0.1%)
- All edges equal within tolerance
- Convex hull matches mesh (no concavities)
- Manifold edge incidence: exactly 2 faces per edge
- Vertex/edge/face counts match the catalog registry values
- Deterministic face ordering via stable ID assignment

### 2.5 Net generation compatibility
Reuse the existing `buildPolyhedronNet()` unfolding pipeline. Adjustments needed:

- **Root-face candidate cap:** currently hardcoded to `Math.min(12, mesh.faces.length)` in `buildPolyhedronNet()`. Johnson solids range from 5 faces (J1) to 62 faces (J91). Raise to `Math.min(24, mesh.faces.length)` and benchmark. If some solids still produce poor nets, add an exhaustive fallback that tries all faces when the top-24 candidates all produce overlapping nets.
- **Overlap detection:** monitor for edge cases where high-face-count Johnson solids produce nets with self-overlap on all candidate roots. Add an overlap penalty to the `evaluateNetQuality()` scoring.
- **Deterministic tie-breakers:** the existing centroid-based sort (z, then y, then x, then face ID) is sufficient. No changes needed.

---

## Phase 3: UI Tab Completion

### 3.1 Expand polyhedron subtabs
Update `apps/web/src/routes/app/+page.svelte`:

- Expand `PolyhedronInputMode` type: `'catalog' | 'johnson' | 'family'`
- Add a third button in the `.poly-subtabs` container for "Johnson"
- Wire the new tab to a dedicated Johnson selection panel

### 3.2 Update preview types
`apps/web/src/lib/preview.ts` contains a local interface `PreviewShapeDefinition` that mirrors the shared schema. This must be updated to support the new `johnson` preset and `johnsonId` field to ensure the preview engine receives the correct data structure.

### 3.3 Johnson tab UX
The Johnson tab provides:
- **Search input** — filter by J-number (e.g., `"J14"`) or name substring (e.g., `"cupola"`). Case-insensitive.
- **Family filter** — dropdown or chip group filtering by family (pyramid, cupola, rotunda, augmented, diminished, gyrate, etc.).
- **Compact list** — each row shows: J-number, name, face signature (e.g., "4△ + 1□").
- **Single-click apply** — updates `shapeDefinition.polyhedron` with `preset: "johnson"` and the selected `johnsonId`.
- **Optional thumbnail** — small wireframe icon per entry (nice-to-have, not blocking).

### 3.3 Catalog tab updates
Add 5–8 curated Johnson solids to `POLYHEDRON_CATALOG_OPTIONS` as quick picks spanning a range of complexity:
- J1 (Square Pyramid) — simplest, 5 faces
- J3 (Triangular Cupola) — 8 faces, mixed polygon types
- J13 (Pentagonal Dipyramid) — 10 faces, all triangles
- J27 (Triangular Orthobicupola) — 14 faces, moderate complexity
- J37 (Elongated Square Gyrobicupola) — 18 faces, higher complexity
- Optionally one high-face-count solid (e.g., J72 or J90)

These entries use `preset: "johnson"` with the corresponding `johnsonId`, sitting alongside existing catalog entries.

### 3.4 Preserve onboarding and shortcuts
- Quick-start cards and sample project loader remain unchanged.
- Guided setup can offer Johnson solids as an option when the user selects "Polyhedron Templates".

---

## Phase 4: Tests and Quality Gates

### 4.1 Shared-type tests
Add schema tests in `packages/shared-types`:
- Valid Johnson IDs (`j1` through `j92`) accepted
- Invalid IDs (`j0`, `j93`, `j100`, `johnson1`, `J1`) rejected
- Refinement: `preset: "johnson"` without `johnsonId` fails validation
- Backward compatibility: all 10 existing presets parse correctly with no changes

### 4.2 Geometry-engine tests
Expand `services/geometry-engine/src/index.test.ts`:
- **Table-driven test over all J1–J92:**
  - Mesh generation succeeds
  - Vertex/edge/face counts match catalog registry
  - Edge-length uniformity within tolerance
  - Face regularity within tolerance
  - Net generation succeeds (no disconnected faces)
  - Net face count matches mesh face count
  - Edge-length consistency between 3D mesh and 2D net
  - STL export smoke test
- **Alias path test:** J12 and J13 produce identical meshes to `regularBipyramid` with corresponding `ringSides`
- **Deterministic repeatability:** snapshot hash of sorted vertex positions for regression detection

### 4.3 Web/export tests
Expand `apps/web/src/lib/exports.test.ts`:
- Johnson selection propagates to `shapeDefinition.polyhedron`
- All export formats (SVG, PDF, STL) succeed for a sample spread (J1, J13, J37, J72, J92)
- Layer filtering and seam modes remain stable
- Catalog entries with `johnsonId` generate correctly

### 4.4 Performance budgets
Define thresholds by face-count tier (mesh + net generation, browser):

| Tier | Face count | Target p95 |
|---|---|---|
| Low | ≤ 10 | < 100 ms |
| Medium | 11–25 | < 250 ms |
| High | 26–62 | < 500 ms |

Fail CI when regression exceeds threshold.

---

## Phase 5: Documentation and Rollout

### 5.1 Docs updates
- `docs/features.md` — add Johnson solid coverage
- `docs/printability-rules.md` — add Johnson validation rules and known caveats
- Optional: `docs/johnson-solids.md` — full catalog reference

### 5.2 Feature flag
- Add `johnsonSolidsEnabled` flag in app config (e.g., `apps/web/src/lib/feature-flags.ts` or equivalent).
- Gate the Johnson subtab rendering and `preset: "johnson"` dispatch behind the flag.
- Default `false` in production until Phase 4 test suite passes.

### 5.3 Release strategy
1. Ship behind feature flag.
2. Internal test pass on all 92 solids.
3. Enable for beta users.
4. Public enable once stability and performance targets pass.
5. Remove flag and gate code in subsequent cleanup PR.

---

## Work Breakdown (Suggested Order)

| Step | Description | Notes |
|---|---|---|
| 1 | Create Johnson catalog registry with metadata for all 92 | `packages/shared-types/src/johnson-catalog.ts` |
| 2 | Source + validate coordinate data for first 10 solids | Priority batch: J1–J6, J12–J13, J18, J27 |
| 3 | Extend shared schema (`"johnson"` preset + `johnsonId`) | Zod enum + refinement |
| 4 | Implement `buildJohnsonMesh` dispatch + module split | `johnson-mesh.ts`, `johnson-coordinates.ts` |
| 5 | End-to-end smoke test with first 10 solids | Mesh → net → SVG/STL |
| 6 | Add full J1–J92 coordinate data + validation | Batch by family |
| 7 | Add Johnson UI tab with search/filter | New `PolyhedronInputMode` value |
| 8 | Update preview types in `lib/preview.ts` | Sync local interface with shared schema |
| 9 | Add curated Johnson entries to Catalog tab | 5–8 quick picks |
| 10 | Full automated test matrix (all 92) | Table-driven, deterministic |
| 11 | Performance benchmarking + net-unfolding tuning | Raise root-face cap, overlap scoring |
| 12 | Docs, feature flag, ship | Staged rollout |

**First batch rationale (step 2):** J1–J2 (pyramids, simplest geometry), J3–J6 (cupolas + rotunda, mixed face types), J12–J13 (dipyramids, exercises alias path to existing builder), J18 (elongated cupola, moderate complexity), J27 (orthobicupola, higher face count). This spread covers all three builder paths — alias, simple coordinates, and complex coordinates.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Coordinate data correctness (wrong vertices/faces) | Source-lock metadata; automated geometric invariant checks on every J solid; cross-validate V/E/F counts against encyclopedia references. |
| Coordinate data licensing | Use public-domain or permissively licensed sources (Antiprism, dmccooey.com); alternatively compute algorithmically from geometric definitions. |
| Net overlap on complex solids | Raise root-face candidate cap from 12 → 24; add exhaustive fallback; add overlap penalty to `evaluateNetQuality()`. |
| Geometry engine file bloat | Split into dedicated modules (`johnson-coordinates.ts`, `johnson-mesh.ts`); keep `index.ts` as thin dispatch layer. |
| UI overload with 92 items | Searchable + filterable Johnson tab; curated quick picks in Catalog; family grouping filters. |
| Runtime performance on high-face-count solids | Benchmark tiers with CI regression guardrails; lazy-load coordinate data if needed. |

## Definition of Done
- `J1`–`J92` selectable in app UI via Johnson tab.
- All 92 pass geometry/net/export invariant test suite.
- 5–8 curated Johnson solids appear in the Catalog tab as quick picks.
- Polyhedron subtabs cover: `Catalog`, `Johnson`, `Family` (plus optional `Recipe`).
- J12/J13 alias path produces identical output to existing `regularBipyramid` builder.
- Existing non-Johnson presets remain functional and unchanged.
- Feature flag gates production rollout.

## Reference
- Johnson solid canonical enumeration: https://en.wikipedia.org/wiki/Johnson_solid
- dmccooey polyhedra database: https://dmccooey.com/polyhedra/
- Antiprism polyhedra library: https://www.antiprism.com/
- Johnson, N.W. (1966). "Convex polyhedra with regular faces." _Canadian Journal of Mathematics_ 18: 169–200.
