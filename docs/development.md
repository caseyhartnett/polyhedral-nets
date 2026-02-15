# Development Guide

## Prerequisites

- Node.js `>=20`
- PostgreSQL
- Redis

Optional local bootstrap with Docker:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

## Install

```bash
npm install
```

## Run locally

In separate terminals:

```bash
npm run dev          # API on 127.0.0.1:3000 (default)
npm run dev:worker   # export worker
npm run dev:web      # SvelteKit app on :5173
```

Or run all three together:

```bash
npm run dev:all
```

## Build and checks

```bash
npm run build
npm run typecheck
npm run test
```

Per-workspace checks are available through each package `scripts`.

## Important environment variables

- `DATABASE_URL` (default `postgres://torrify:torrify@127.0.0.1:5432/torrify`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`)
- `PORT`, `HOST` for API binding
- `TORRIFY_DATA_DIR` for artifact storage root
- `JOB_ATTEMPTS`, `JOB_BACKOFF_MS`, `WORKER_CONCURRENCY` for queue behavior

## Data and artifacts

- Artifact files are written to `data/artifacts`
- Debug harness output (when geometry tests fail) is written under `data/debug/geometry-harness`

## Workspace map

- `apps/api` - REST API
- `apps/worker` - queue worker
- `apps/web` - UI + API proxy routes
- `services/geometry-engine` - geometry, unfolding, exporters
- `packages/shared-types` - shared schemas/types
- `packages/job-store` - database and artifact persistence
- `packages/client-sdk` - typed helper for API usage

## Troubleshooting

- If jobs stay `queued`, verify worker is running and Redis is reachable.
- If API start fails, verify PostgreSQL connectivity and credentials.
- If artifacts return 404, verify job status is `succeeded` and files exist in `data/artifacts`.
