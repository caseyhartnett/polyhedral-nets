# Printability and Validation Rules

This document reflects current runtime validation and warning behavior.

## Hard validation (request rejected)

Validation is enforced by shared Zod schemas and geometry prechecks.

### General

- `schemaVersion` must be `"1.0"`
- Positive dimensions required for:
  - `height`, `bottomWidth`, `topWidth`, `thickness`
- `segments` must be integer `3-256`
- `topSegments` must be either:
  - `1` (pyramid), or
  - exactly equal to `bottomSegments`

### Polyhedron mode

When `generationMode` is `"polyhedron"`:

- `polyhedron` definition is required
- `edgeLength` must be positive
- Presets with `ringSides` requirement:
  - `regularPrism`: `3-64`
  - `regularAntiprism`: `3-64`
  - `regularBipyramid`: `3-5`
- Face mode constraints:
  - `cuboctahedron` and `truncatedOctahedron` require `faceMode: "mixed"`
  - single-face presets require `faceMode: "uniform"`

## Runtime warnings (job can still succeed)

Current geometry warnings include:

- `profilePoints` are accepted but ignored in polygonal v2 geometry
- `seamMode` values other than `straight` are currently rendered as straight seam
- `allowance` is not yet applied to seam flap generation for non-straight seams
- Very large `thickness` relative to base radius may be difficult to fabricate
- Mixed-face polyhedron presets are marked experimental for manual net adjustment risk

## Determinism and output behavior

- Identical inputs produce deterministic geometry and artifact output
- 2D template edges are layered as `cut` vs `score` by edge sharing in the unfolded net
- Units (`mm`/`in`) are preserved in SVG/PDF scaling

## Notes for future implementation

Inputs currently accepted but not fully used for fabrication-specific geometry:

- `notches`
- seam allowance flap geometry
- non-straight seam realization
- profile-driven body shaping via `profilePoints`
