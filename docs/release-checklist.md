# Release Checklist (Static App)

## Pre-release checks

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Verify `apps/web/build/index.html` exists

## Manual QA

1. Open app and verify page load
2. Confirm live preview updates for legacy mode
3. Confirm live preview updates for polyhedron mode
4. Generate and download SVG
5. Generate and download PDF
6. Generate and download STL
7. Refresh page and verify state resets (stateless behavior)

## Security checks

1. Confirm static headers file present: `apps/web/static/_headers`
2. Confirm no new unsafe DOM sinks (`{@html}`, `innerHTML`, `eval`)
3. Confirm no unexpected runtime network calls in core flow
4. Review dependency advisories (`npm audit --audit-level=high`)

## Deployment checks

1. Cloudflare/Railway build command still `npm run build`
2. Publish directory still `apps/web/build`
3. Production site serves latest commit
4. Smoke-check downloads from production URL
