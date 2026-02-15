# PolyGoneWild (Pottery Pattern CAD)

Monorepo for generating slab-template geometry and export artifacts (SVG/PDF/STL) for polygonal pottery forms and polyhedron-based builds.

## What is implemented

- Project, revision, and export job lifecycle in a Fastify API
- Async export processing via BullMQ worker
- PostgreSQL-backed persistence for projects/revisions/jobs/artifacts
- Deterministic geometry engine for:
  - Legacy polygonal forms: prism, frustum, pyramid
  - Polyhedron presets and parameterized polyhedron families
  - Seam modes (`straight`, `overlap`, `tabbed`) with allowance-driven flap depth for non-straight seams
- Export generation:
  - Layered SVG (`cut`, `score`, `guide`) with selectable layer export via `svgLayers`
  - Vector PDF
  - ASCII STL mesh
- SvelteKit UI with:
  - Dark-themed workspace optimized for long sessions
  - Project + revision selection
  - Project details page (`/projects/:projectId`) with revision/job summaries
  - Dimension builder and polyhedron template builder
  - Live 2D template preview + interactive 3D wireframe preview
  - Job history with fork/retry/cancel and artifact links

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
- PostgreSQL (default: `postgres://torrify:torrify@127.0.0.1:5432/torrify`)
- Redis (default: `redis://127.0.0.1:6379`)

Optional environment variables:

- `PORT` (API port, default `3000`)
- `HOST` (API bind host, default `127.0.0.1`)
- `DATABASE_URL`
- `REDIS_URL`
- `TORRIFY_DATA_DIR` (artifacts root, default `data`)
- `JOB_ATTEMPTS` (default `3`)
- `JOB_BACKOFF_MS` (default `1000`)
- `WORKER_CONCURRENCY` (default `2`)
- `API_BASE_URL` (web server proxy target, default `http://127.0.0.1:3000`)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start Postgres + Redis:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

3. Start services:

```bash
npm run dev          # API
npm run dev:worker   # worker (new terminal)
npm run dev:web      # web UI (new terminal)
```

4. Open the UI:

- `http://localhost:5173`

## Project layout

- `apps/api` - Fastify API endpoints
- `apps/worker` - BullMQ worker for export jobs
- `apps/web` - SvelteKit UI and API proxy routes
- `services/geometry-engine` - canonical geometry, net unfolding, exporters
- `packages/shared-types` - shared Zod schemas and TS types
- `packages/job-store` - PostgreSQL data access + artifact IO
- `packages/client-sdk` - typed SDK helper(s)
- `infra/docker` - local Postgres/Redis compose

## Documentation

- `docs/features.md` - implementation feature inventory
- `docs/architecture.md` - runtime/data architecture
- `docs/api-contracts.md` - HTTP endpoints and payload contracts
- `docs/printability-rules.md` - validation rules and current warnings
- `docs/development.md` - local development and test commands
