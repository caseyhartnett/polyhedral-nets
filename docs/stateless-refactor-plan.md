# Stateless Refactor Plan (Codex Execution Guide)

## Goal
Convert the app to a fully stateless browser-first tool:

1. No database.
2. No Redis queue.
3. No worker process.
4. No API persistence model (projects/revisions/jobs/artifacts).
5. No middle pane/history UI.
6. Persistence only via explicit user downloads (SVG/PDF/STL files).

If a user closes the tab, all state is lost.

## Scope
In scope:

1. Remove backend persistence and queue architecture.
2. Run generation directly in browser using existing geometry engine.
3. Keep the builder + live previews + export generation.
4. Simplify deployment to static frontend hosting.

Out of scope:

1. User accounts.
2. Cloud storage.
3. Share links.
4. Server-side job lifecycle.

## Target End State

1. One deployable artifact: static web app.
2. App computes geometry and file outputs client-side.
3. UI provides direct download buttons for selected formats.
4. No `/api/*` usage in runtime flow.
5. No Postgres/Redis dependency anywhere in docs/scripts/runtime.

## Phase 1: Baseline and Safety

1. Create a feature branch for the refactor.
2. Run baseline checks before edits:
   `npm run build && npm run typecheck && npm run test`
3. Capture a short baseline behavior note:
   builder inputs, live preview, SVG/PDF/STL export currently working.

Acceptance criteria:

1. Baseline passes or existing failures are documented before refactor.

## Phase 2: Remove Backend Runtime Surface

Files/workspaces to remove from active architecture:

1. `apps/api`
2. `apps/worker`
3. `packages/job-store`
4. `packages/client-sdk` (if unused after refactor)
5. `infra/docker/docker-compose.yml` (or keep as archived example, not required by docs/scripts)

Required updates:

1. Update root `package.json` scripts to remove `dev`, `dev:worker`, `dev:all` references to API/worker.
2. Keep only web-focused dev/build/test scripts at root.
3. Remove backend-related dependencies from relevant `package.json` files.

Acceptance criteria:

1. Running the app does not require PostgreSQL or Redis.
2. No root script expects API/worker processes.

## Phase 3: Make Geometry/Export Browser-Safe

Primary task:

1. Ensure `services/geometry-engine` works in browser-only runtime.

Known blocker:

1. Replace Node-only `Buffer.byteLength` usage in PDF generation with browser-safe byte length calculation.
   Target: `services/geometry-engine/src/index.ts`

Acceptance criteria:

1. SVG/PDF/STL generation functions run in browser bundle without Node globals.
2. Web build succeeds without Node polyfill hacks.

## Phase 4: Remove Web Proxy/API Route Layer

Delete or stop using:

1. `apps/web/src/routes/api/**`
2. `apps/web/src/lib/api.server.ts`
3. `apps/web/src/lib/proxy.ts`
4. Any page/load code that fetches `/api/*`

Update SvelteKit deployment model:

1. Switch from `adapter-auto` to static adapter if needed for target host.
2. Ensure routes/pages are static-friendly and browser-driven.

Acceptance criteria:

1. No runtime network calls to internal API routes for core app flow.
2. `npm run -w @torrify/web build` produces static-ready output.

## Phase 5: Replace Job/Project Model with Local Ephemeral State

In `apps/web/src/routes/+page.svelte`:

1. Remove project, revision, and job state/interfaces.
2. Remove functions tied to persistence lifecycle:
   `loadProjects`, `createProject`, `loadRevisions`, `loadProjectSummary`, `loadHistory`, `submitJob`, `pollJob`, `forkJob`, `retryJob`, `cancelJob`, `useRevision`, `loadParamsFromJob`.
3. Keep only in-memory builder state for current session.
4. Generate artifacts immediately in browser on user action.

Implementation shape:

1. Add a client-side `generateExports()` action:
   builds canonical geometry and selected outputs in-memory.
2. Add download actions for each selected format:
   create `Blob`, `URL.createObjectURL`, and trigger `<a download>`.
3. Keep “select export formats” UX, but convert from queued job submission to immediate generation/download.

Acceptance criteria:

1. No job IDs/status polling in UI.
2. Export flow is synchronous from user perspective (click -> download available).

## Phase 6: Remove Middle Pane and Simplify Layout

UI changes in `apps/web/src/routes/+page.svelte`:

1. Remove the entire history/project pane section (middle column content).
2. Remove project details page route if no longer needed:
   `apps/web/src/routes/projects/[projectId]/+page.ts`
   `apps/web/src/routes/projects/[projectId]/+page.svelte`
3. Update layout grid from 3 columns to 2 columns (or single-column responsive stack).

Acceptance criteria:

1. Middle pane no longer exists.
2. Main builder + preview/export experience remains intact on desktop and mobile.

## Phase 7: Clean Shared Contracts and Types

In `packages/shared-types/src/index.ts`:

1. Remove API persistence contracts that are no longer used:
   project/revision/job response schemas.
2. Keep shape and export-related schemas/types required by web + geometry engine.

Acceptance criteria:

1. Shared types package only contains stateless client/domain contracts.
2. No orphaned types tied to removed backend model.

## Phase 8: Documentation and Developer Experience

Update docs:

1. `README.md`
2. `docs/architecture.md`
3. `docs/development.md`
4. `docs/features.md`
5. `docs/api-contracts.md` (replace with note that API layer was removed, or delete file)

Required doc changes:

1. New architecture diagram/text: browser-only generation.
2. New run instructions: web app only.
3. Clarify persistence model: none except downloaded files.

Acceptance criteria:

1. Docs no longer instruct users to run Postgres/Redis/API/worker.
2. Docs clearly state stateless behavior.

## Phase 9: Verification Checklist

Run:

1. `npm run -w @torrify/web typecheck`
2. `npm run -w @torrify/web test`
3. `npm run -w @torrify/web build`

Manual QA:

1. Open app and change legacy parameters, verify live 2D/3D preview updates.
2. Open app and change polyhedron parameters, verify live preview updates.
3. Export SVG and confirm valid file download and openability.
4. Export PDF and confirm valid file download and openability.
5. Export STL and confirm valid file download and openability.
6. Refresh page and confirm state is reset.
7. Close and reopen app and confirm no persisted state is restored.

Acceptance criteria:

1. All formats export successfully without backend services.
2. App behavior matches explicit stateless requirement.

## Suggested Execution Order for Codex

1. Browser-safe geometry export fix.
2. UI flow conversion from job API to local generation/download.
3. Remove middle pane and persistence-driven routes.
4. Remove API proxy layer.
5. Remove backend workspaces/scripts/deps.
6. Update shared types.
7. Update docs.
8. Final build/test pass and cleanup.

## Definition of Done

1. App runs with only the web package.
2. No DB, Redis, API, or worker process is required.
3. No project/revision/job model remains in UI/runtime.
4. Exports are generated in-browser and downloaded by user.
5. Middle pane is removed.
6. Documentation reflects the new stateless architecture.
