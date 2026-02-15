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
npm run -w @torrify/web typecheck
npm run -w @torrify/web test
npm run -w @torrify/web build
```

## Workspace map

- `apps/web` - stateless browser UI
- `services/geometry-engine` - geometry, unfolding, exporters
- `packages/shared-types` - shared schemas/types

## Troubleshooting

- If build fails on adapter output, ensure `@sveltejs/adapter-static` is installed.
- If exports fail in UI, verify at least one export format is selected.
- If PDF/SVG output is empty, verify at least one SVG layer is selected.
