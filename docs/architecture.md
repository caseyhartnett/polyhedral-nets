# Architecture

## Runtime components

- `apps/web`: SvelteKit browser UI and export workflow
- `services/geometry-engine`: deterministic geometry, unfolding, and exporters
- `packages/shared-types`: Zod schemas and shared domain types

## External dependencies

- None required at runtime for core flow

The app is fully stateless and browser-first.

## State model

- Shape/builder state lives in browser memory only
- Generated artifacts are in-memory strings/blobs until user downloads them
- No persisted projects, revisions, jobs, or artifacts

## Processing flow

1. User edits builder parameters in the browser.
2. UI computes canonical geometry client-side.
3. UI renders live 2D/3D previews from in-memory geometry.
4. On generate, UI renders selected artifact formats in-memory:
   - SVG
   - PDF
   - STL
5. User explicitly downloads artifacts via browser download actions.

## Deployment model

- Static web hosting artifact
- No backend service requirements
- No Postgres/Redis requirements
