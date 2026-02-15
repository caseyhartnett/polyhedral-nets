# Architecture

## Runtime components

- `apps/api`: Fastify HTTP API for projects, revisions, jobs, and artifact access
- `apps/worker`: BullMQ worker that executes export jobs
- `apps/web`: SvelteKit UI + server routes that proxy the API
- `services/geometry-engine`: deterministic geometry, unfolding, and exporters
- `packages/job-store`: PostgreSQL persistence and artifact file IO
- `packages/shared-types`: Zod schemas and shared type contracts

## External dependencies

- PostgreSQL: source of truth for projects, revisions, jobs, artifacts
- Redis: BullMQ transport for queued export jobs
- Filesystem (`data/artifacts`): persisted export files

## Data model

- `Project`
  - top-level user container
- `Revision`
  - immutable shape definition snapshot
  - optional `parentRevisionId` for lineage
- `ExportJob`
  - execution record bound to project + revision
  - status lifecycle and canonical geometry snapshot on success
- `Artifact`
  - one record per `(job, format)` with storage path

## Processing flow

1. UI/client submits a job request (`POST /v1/jobs`).
2. API validates payload with shared Zod schemas.
3. API creates revision + queued job rows in PostgreSQL.
4. API enqueues job ID to BullMQ (`export-jobs`).
5. Worker claims queue task, transitions job to `running`.
6. Worker builds canonical geometry and requested artifacts.
7. Worker persists artifact files, stores geometry, marks `succeeded`.
8. On errors, worker marks `failed` with error message.
9. Clients poll job status and fetch artifacts via API.

## Cancellation/retry/fork behavior

- Cancel:
  - queued/running jobs can be marked `cancelled`
  - queued BullMQ entry is removed when present
- Retry:
  - only `failed`/`cancelled` jobs
  - creates child revision and new queued job
- Fork:
  - clones source revision into child revision and queues a new job

## Geometry/export pipeline

- Canonical geometry creation supports:
  - legacy polygonal solids (`prism`, `frustum`, `pyramid`)
  - polyhedron presets + family presets
- Net unfolding produces layered template paths (`cut`, `score`, `guide`).
- Exporters render from canonical geometry:
  - SVG (layered)
  - PDF (vector)
  - STL (ASCII facets)
