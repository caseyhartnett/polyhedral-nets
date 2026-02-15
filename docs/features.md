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
- Canonical metrics output:
  - `bottomRadius`, `topRadius`, `slantHeight`, `surfaceArea`, `faceCount`
- 3D wireframe preview model generation

## Export formats

- SVG template export with grouped layers (`cut`, `score`, `guide`)
- Vector PDF export from canonical paths
- Deterministic ASCII STL export from triangulated mesh

## API workflows

- Health endpoint (`GET /health`)
- Project workflows:
  - create/list/get project
  - create/list revisions per project
- Job workflows:
  - create queued export job (auto project create if omitted)
  - list jobs
  - get job details/status
  - cancel queued/running job
  - fork prior job into child revision + new job
  - retry failed/cancelled job into child revision + new job
- Artifact workflows:
  - list artifact URLs per job
  - fetch `svg`, `pdf`, `stl` artifact payloads

## Persistence and processing

- PostgreSQL tables created on startup:
  - `projects`, `revisions`, `export_jobs`, `artifacts`
- Filesystem artifact persistence in `data/artifacts`
- BullMQ queue-based async processing with retry/backoff options
- Job status lifecycle:
  - `queued` -> `running` -> `succeeded|failed|cancelled`

## Web UI capabilities

- Project creation and selection
- Revision selection and reuse
- Project summary page with revision/job counts
- Dual builder UI:
  - legacy dimension inputs
  - polyhedron catalog/family selection
- Live 2D template preview and interactive 3D wireframe preview
- Job history list with:
  - load params
  - fork
  - retry
  - cancel
  - artifact links/downloads

## Validation and warnings currently present

- Zod schema validation for all job payloads
- Polyhedron-specific validation (preset, face mode, ring side bounds)
- Edge-count validation for legacy mode
- Runtime warnings surfaced in canonical geometry for currently approximated behavior (details in `docs/printability-rules.md`)

## Test coverage currently present

- API route tests for job creation/cancel/retry and validation failure paths
- Geometry harness tests for:
  - mesh/net invariants
  - polyhedron preset net validity
  - edge-length consistency (3D mesh vs 2D net)
  - exporter smoke checks (SVG/PDF/STL)
