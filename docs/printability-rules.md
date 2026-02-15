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

## Runtime warnings (generation can still succeed)

Current geometry warnings include:

- `profilePoints` are accepted but ignored in polygonal v2 geometry
- Very large `thickness` relative to base radius may be difficult to fabricate
- Mixed-face polyhedron presets are marked experimental for manual net adjustment risk

## Determinism and output behavior

- Identical inputs produce deterministic geometry and artifact output
- 2D template edges are layered as `cut` vs `score` by edge sharing in the unfolded net
- `seamMode` applies deterministic seam flap behavior on one boundary edge:
  - `straight`: no flap (original open edge)
  - `overlap`: rectangular overlap flap
  - `tabbed`: sawtooth/tabbed flap
- For non-straight seams, `allowance` controls seam flap depth (clamped to edge-relative bounds)
- Units (`mm`/`in`) are preserved in SVG/PDF scaling

## Notes for future implementation

Inputs currently accepted but not fully used for fabrication-specific geometry:

- `notches`
- profile-driven body shaping via `profilePoints`
