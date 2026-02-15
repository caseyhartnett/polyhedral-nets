# Codebase Improvement Roadmap

Last reviewed: February 15, 2026

## Current State

- Architecture: stateless browser-only app (no API/DB/queue runtime)
- Workspaces: `apps/web`, `packages/shared-types`, `services/geometry-engine`
- CI: Node matrix (`20`, `22`) running typecheck, test, build, static-output smoke checks
- Security baseline: static headers via `apps/web/static/_headers`, CI `npm audit --audit-level=high`
- Runtime network calls in core app flow: none

## Completed in This Refactor Cycle

- Generated artifact tracking removed (`apps/web/.svelte-kit`, `apps/web/build`)
- CI upgraded with Node matrix + build output smoke checks
- CI dependency audit job added
- Web flow unit coverage expanded (format/layer toggles + empty-export validation)
- Input clamping guardrails added for segment counts
- PR template and release checklist added/updated

## Remaining High-Impact Improvements

### 1. Add browser e2e smoke coverage (Playwright)

Goal:
- Catch integration regressions that unit tests miss.

Minimum suite:
- App loads successfully
- Legacy and polyhedron previews update
- SVG/PDF/STL download flows execute

### 2. Add explicit performance guardrails

Goal:
- Prevent client-side hangs on very heavy shapes.

Actions:
- Track generation latency for high-segment and large-ring-side cases
- Add a user-visible warning/limit before expensive operations
- Move heavy generation into a Web Worker if thresholds are exceeded

### 3. Tighten dependency maintenance cadence

Goal:
- Keep supply-chain risk low over time.

Actions:
- Run monthly dependency updates with changelog review
- Keep `npm audit --audit-level=high` clean on `main`
- Add a periodic security review issue template if needed

### 4. Decide information architecture for broader website content

Recommended default:
- Keep app + marketing/docs pages in this same repo and same SvelteKit app.

When to split repos:
- Separate team ownership, release process, or CMS/stack requirements.

## Security Considerations (Stateless Context)

Stateless mode removed major backend attack surface, but these controls remain required:

1. Keep CSP and other headers in `apps/web/static/_headers` aligned with runtime needs (`blob:` for downloads/previews).
2. Avoid unsafe DOM sinks (`{@html}`, `innerHTML`, `eval`, `new Function`).
3. Keep strict schema validation and input clamping to limit resource exhaustion risk.
4. Preserve browser-local flow (no accidental runtime API calls in core generation/export path).

## Suggested Next Execution Order

1. Add Playwright smoke tests for build/deploy confidence.
2. Add performance budget checks for large inputs.
3. Continue monthly dependency/security maintenance.
4. Implement selected website route strategy in `apps/web/src/routes/`.
