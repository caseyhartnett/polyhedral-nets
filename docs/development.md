# Development Guide

## Prerequisites

- Node.js `>=20`

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

This starts the web app on `http://localhost:5173`.

## Build and checks

```bash
npm run build
npm run lint
npm run typecheck
npm run test
```

## Web package checks

```bash
npm run -w @polyhedral-nets/web typecheck
npm run -w @polyhedral-nets/web test
npm run -w @polyhedral-nets/web build
```

## Workspace map

- `apps/web` - stateless browser UI
- `services/geometry-engine` - geometry, unfolding, exporters
- `packages/shared-types` - shared schemas/types

## Adding website pages

- Default: add additional pages in this repo under `apps/web/src/routes/`.
- Keep app flow browser-local and stateless as new pages are introduced.

## Troubleshooting

- If build fails on adapter output, ensure `@sveltejs/adapter-static` is installed.
- If exports fail in UI, verify at least one export format is selected.
- If PDF/SVG output is empty, verify at least one SVG layer is selected.

## Deployment

See `docs/deployment.md` for Cloudflare Pages and Railway deployment instructions.
See `docs/release-checklist.md` for pre-release validation and security checks.

## Secure coding baseline

- Do not introduce `{@html}`, `innerHTML`, `eval`, or `new Function`.
- Keep core app flow browser-local (no accidental runtime API calls).
- Preserve input clamping/validation to avoid client-side resource exhaustion.
