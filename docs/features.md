# Implemented Features

## Modeling modes

### 1. Dimension Builder (`generationMode: legacy`)

- Prism/frustum/pyramid generation from dimensional inputs
- Configurable base edge count (`segments`)
- Optional split edge counts (`bottomSegments`, `topSegments`)
  - Supported combinations:
    - `topSegments === bottomSegments` (prism/frustum)
    - `topSegments === 1` (pyramid)

### 2. Polyhedron Templates (`generationMode: polyhedron`)

Supported presets:

- `tetrahedron`
- `cube`
- `octahedron`
- `icosahedron`
- `dodecahedron`
- `cuboctahedron`
- `truncatedOctahedron`
- `regularPrism` (requires `ringSides` 3-64)
- `regularAntiprism` (requires `ringSides` 3-64)
- `regularBipyramid` (requires `ringSides` 3-5)

## Geometry and unfolding engine

- Deterministic mesh construction for legacy and polyhedron modes
- Face adjacency analysis and net unfolding
- 2D template path generation with layer assignment:
  - outer edges -> `cut`
  - shared fold edges -> `score`
- Seam-specific flap generation in unfolded templates:
  - `straight`: no flap
  - `overlap`: rectangular flap
  - `tabbed`: tabbed flap
- `allowance` is applied as non-straight seam flap depth
- Canonical metrics output:
  - `bottomRadius`, `topRadius`, `slantHeight`, `surfaceArea`, `faceCount`
- 3D preview model generation

## Export formats

- SVG template export with grouped layers (`cut`, `score`, `guide`) and selectable layer filtering
- Vector PDF export from canonical paths (honors selected layer filtering)
- Deterministic ASCII STL export from triangulated mesh

## Web UI capabilities

- Stateless parameter editing in browser memory
- Dual builder UI:
  - legacy dimension inputs
  - polyhedron catalog/family selection
- Live 2D template preview and interactive 3D solid preview
- Direct in-browser export generation and download for SVG/PDF/STL
- No API calls required for core generation flow

## Stateless behavior

- No project/revision/job model
- No background queue or polling status
- No persisted history pane
- Session state resets on refresh or tab close

## Validation and warnings currently present

- Zod schema validation for shape inputs
- Polyhedron-specific validation (preset, face mode, ring side bounds)
- Edge-count validation for legacy mode
- Runtime warnings surfaced in canonical geometry (details in `docs/printability-rules.md`)

## Test coverage currently present

- Geometry harness tests for:
  - mesh/net invariants
  - polyhedron preset net validity
  - edge-length consistency (3D mesh vs 2D net)
  - exporter smoke checks (SVG/PDF/STL)
- Web export utility tests for stateless generation and layer filtering
