# API Contracts

Base URL (local default): `http://127.0.0.1:3000`

## Health

### `GET /health`

- `200`: `{ "ok": true }`

## Projects

### `POST /v1/projects`

Request:

```json
{ "name": "My Vessel Set" }
```

Responses:

- `201`: created project
- `400`: validation error

### `GET /v1/projects`

Responses:

- `200`: `{ "count": number, "projects": Project[] }`

### `GET /v1/projects/:projectId`

Responses:

- `200`: project summary with counts + latest revision/job
- `404`: project not found

### `POST /v1/projects/:projectId/revisions`

Request:

```json
{
  "shapeDefinition": { "schemaVersion": "1.0", "...": "..." },
  "parentRevisionId": "uuid-optional"
}
```

Responses:

- `201`: created revision
- `400`: validation error
- `404`: project not found

### `GET /v1/projects/:projectId/revisions`

Responses:

- `200`: `{ "count": number, "revisions": Revision[] }`
- `404`: project not found

## Jobs

### `POST /v1/jobs`

Creates revision + queued export job. If `projectId` is omitted, API auto-creates an `Untitled Project`.

Request:

```json
{
  "projectId": "uuid-optional",
  "parentRevisionId": "uuid-optional",
  "shapeDefinition": { "schemaVersion": "1.0", "...": "..." },
  "exportFormats": ["svg", "pdf", "stl"],
  "svgLayers": ["cut", "score", "guide"]
}
```

Responses:

- `202`: `{ "jobId": "uuid", "status": "queued", "projectId": "uuid", "revisionId": "uuid" }`
- `400`: validation error
- `404`: referenced project not found

### `GET /v1/jobs`

Responses:

- `200`: `{ "count": number, "jobs": JobSummary[] }`

### `GET /v1/jobs/:jobId`

Responses:

- `200`: full job record with timestamps, error (if any), geometry (if succeeded), artifact flags
- `404`: job not found

### `POST /v1/jobs/:jobId/cancel`

Responses:

- `200`: `{ "status": "cancelled" }` or `{ "status": "not_cancellable" }`
- `404`: job not found

### `POST /v1/jobs/:jobId/retry`

Only allowed for `failed` or `cancelled` jobs.

Responses:

- `202`: queued replacement job (`CreateJobResponse` shape)
- `404`: job/revision not found
- `409`: job status not retryable

### `POST /v1/jobs/:jobId/fork`

Responses:

- `202`: queued forked job (`CreateJobResponse` shape)
- `404`: job/revision not found

## Artifacts

### `GET /v1/jobs/:jobId/artifacts`

Responses:

- `200`:

```json
{
  "jobId": "uuid",
  "artifacts": {
    "svg": "/v1/jobs/:jobId/artifacts/svg | null",
    "pdf": "/v1/jobs/:jobId/artifacts/pdf | null",
    "stl": "/v1/jobs/:jobId/artifacts/stl | null"
  }
}
```

- `404`: job not found

### `GET /v1/jobs/:jobId/artifacts/:format`

Formats: `svg | pdf | stl`

Responses:

- `200`: raw artifact payload
  - `svg` -> `image/svg+xml`
  - `pdf` -> `application/pdf`
  - `stl` -> `model/stl`
- `404`: job not found, artifact missing, or unsupported format

## Shared type source

Authoritative request/response schemas are in `packages/shared-types/src/index.ts`.
