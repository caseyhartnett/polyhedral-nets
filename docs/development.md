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
npm run build:budget
npm run perf:check
npm run lint
npm run typecheck
npm run test
npm run docs:check
npm run test:e2e
```

## Why these checks exist

- `npm run build:budget` catches accidental client bundle growth before release.
- `npm run perf:check` catches major geometry-generation performance regressions.
- `npm run docs:check` keeps internal markdown links from drifting as files move.

## Web package checks

```bash
npm run -w @torrify/web typecheck
npm run -w @torrify/web test
npm run -w @torrify/web build
npm run -w @torrify/web test:e2e
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
