# PolyGoneWild (Pottery Pattern CAD)

Browser-first CAD tool for generating slab-template geometry and export files (SVG/PDF/STL) for legacy polygonal forms and polyhedron templates.

## Stateless Runtime Model

- No database
- No Redis queue
- No API server or worker process
- No project/revision/job persistence model
- State exists only in browser memory during the current tab session
- Persistence is explicit via downloaded files only

If the tab is refreshed or closed, in-app state is lost.

## What is implemented

- Deterministic geometry engine for:
  - Legacy polygonal forms: prism, frustum, pyramid
  - Polyhedron presets and parameterized polyhedron families
  - Seam modes (`straight`, `overlap`, `tabbed`) with allowance-driven flap depth for non-straight seams
- Export generation in browser:
  - Layered SVG (`cut`, `score`, `guide`) with selectable layer filtering
  - Vector PDF
  - ASCII STL mesh
- SvelteKit UI with:
  - Dimension builder and polyhedron template builder
  - Live 2D template preview + interactive 3D solid preview
  - Immediate in-memory generation and direct file downloads

## Example outputs

Regenerate these assets with:

```bash
npm run examples:readme
```

| Example | Net Template (SVG) | 3D Wireframe (SVG) | Rotating Preview (GIF) |
| --- | --- | --- | --- |
| Legacy hex prism | ![Legacy hex prism net](docs/readme-assets/legacy-prism-hex-net.svg) | ![Legacy hex prism wireframe](docs/readme-assets/legacy-prism-hex-wireframe.svg) | ![Legacy hex prism spin](docs/readme-assets/legacy-prism-hex-spin.gif) |
| Legacy frustum with tabbed seam | ![Legacy frustum tabbed net](docs/readme-assets/legacy-frustum-tabbed-net.svg) | ![Legacy frustum tabbed wireframe](docs/readme-assets/legacy-frustum-tabbed-wireframe.svg) | ![Legacy frustum tabbed spin](docs/readme-assets/legacy-frustum-tabbed-spin.gif) |
| Polyhedron dodecahedron | ![Polyhedron dodecahedron net](docs/readme-assets/polyhedron-dodecahedron-net.svg) | ![Polyhedron dodecahedron wireframe](docs/readme-assets/polyhedron-dodecahedron-wireframe.svg) | ![Polyhedron dodecahedron spin](docs/readme-assets/polyhedron-dodecahedron-spin.gif) |

## Requirements

- Node.js `>=20`

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Run the web app:

```bash
npm run dev
```

3. Open:

- `http://localhost:5173`

## Build and checks

```bash
npm run build
npm run lint
npm run typecheck
npm run test
```

## Project layout

- `apps/web` - SvelteKit stateless UI
- `services/geometry-engine` - canonical geometry, net unfolding, exporters
- `packages/shared-types` - shared Zod schemas and TS types for domain contracts

## Documentation

- `docs/features.md` - implementation feature inventory
- `docs/architecture.md` - runtime/data architecture
- `docs/api-contracts.md` - note on removed API layer
- `docs/deployment.md` - Cloudflare Pages and Railway deployment setup
- `docs/improvements-roadmap.md` - prioritized codebase improvements and security checklist
- `docs/release-checklist.md` - release verification and security checks
- `docs/printability-rules.md` - validation rules and current warnings
- `docs/development.md` - local development and test commands
- `docs/stateless-refactor-plan.md` - archived execution plan for the completed stateless migration

## License

This project is licensed under the GNU General Public License v3.0 (`GPL-3.0-only`).
See `LICENSE`.
