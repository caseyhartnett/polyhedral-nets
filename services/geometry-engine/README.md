# Geometry Engine

Deterministic geometry and export core for Polyhedral Nets.

## Current capabilities
- v1 canonical geometry generation for:
- prisms/frustums/pyramids via segmented controls
- polyhedron presets (uniform and mixed-face sets) with auto-unfolded nets
- parameterized polyhedron families (regular prism, regular antiprism, regular bipyramid)
- SVG export with layered output (`cut`, `score`, `guide`)
- PDF/STL export pipelines

## Planned modules
- `generators/`: profile and segmented body builders
- `validators/`: fabrication and geometry checks
- `exporters/`: svg/pdf/stl pipelines
- `fixtures/`: golden sample geometry and regression artifacts
