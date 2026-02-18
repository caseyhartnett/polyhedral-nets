# Current Project Status and Suggested Improvements

Last reviewed: February 18, 2026

Use this doc as a working log:
- "Key Findings" captures observed issues at review time.
- "Suggested Improvements" captures priority and intent.
- "Implementation Status" tracks what has already been completed.

## Current Status Snapshot

- Workspace health: `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` all pass locally.
- CI baseline: GitHub Actions runs Node `20` and `22` with lint/typecheck/test/build plus static output checks (`.github/workflows/ci.yml`).
- Architecture: stateless browser-first setup remains consistent with docs (`README.md`, `docs/architecture.md`).
- Feature scope: legacy forms + polyhedra + SVG/PDF/STL exports are implemented and documented.

## Key Findings

1. Build output reports a large client chunk warning.
   - Evidence: `npm run build` warns that a client chunk exceeds 500 kB.
   - Likely source: very large route/component module size in `apps/web/src/routes/app/+page.svelte`.

2. Core UI/export logic is highly concentrated in a few very large files.
   - `apps/web/src/routes/app/+page.svelte`: 2814 lines
   - `apps/web/src/lib/exports.ts`: 2660 lines
   - This increases regression risk and makes targeted testing/review harder.

3. Test coverage is uneven across workspaces.
   - `apps/web`: 3 tests
   - `services/geometry-engine`: 1 large test file
   - `packages/shared-types`: 0 tests
   - Baseline quality checks are good, but contract/schema regression risk remains in shared types.

4. Documentation drift is present.
   - `README.md` references `docs/stateless-refactor-plan.md`, but that file does not exist.
   - Existing roadmap file (`docs/improvements-roadmap.md`) is useful but should be reconciled with the latest concrete issues above.

5. Naming/brand consistency is mixed across repo surfaces.
   - Examples include `PolyGoneWild` (README), `torrify-next` (root `package.json`), and `OpenPottery` strings in app UI/routes.
   - This can cause confusion in release artifacts, metadata, and user-facing copy.

## Suggested Improvements (Prioritized)

### P0 (Next 1-2 sprints)

1. Reduce initial app bundle size and split the heavy app route.
   - Break `apps/web/src/routes/app/+page.svelte` into focused components/modules.
   - Use route-level/component dynamic imports where practical.
   - Add a build budget gate (warn/fail threshold) in CI to prevent regressions.

2. Remove documentation drift.
   - Fix or remove dead references in `README.md` (notably `docs/stateless-refactor-plan.md`).
   - Add a docs link check step in CI.

3. Align product naming across code/docs/metadata.
   - Choose canonical product/repo/package naming and apply consistently.
   - Update root and workspace package metadata plus user-facing page titles where needed.

### P1 (Near term)

1. Improve test strategy for confidence at integration boundaries.
   - Add browser e2e smoke tests for critical flows (load app, generate SVG/PDF/STL, download actions).
   - Add baseline tests in `packages/shared-types` for schema compatibility and validation edge cases.

2. Refactor large export pipeline module.
   - Split `apps/web/src/lib/exports.ts` into smaller units:
     - format generation
     - sheet split/packing
     - validation and option resolution
   - Keep deterministic behavior with focused unit tests per module.

### P2 (Ongoing hygiene)

1. Decide policy for generated/local sample artifacts under `data/`.
   - Clarify whether these are fixtures that must stay versioned or should be ignored/generated on demand.

2. Add lightweight observability for expensive generation paths.
   - Track generation latency for high-segment/high-face inputs.
   - Gate expensive operations with UI warnings or background execution strategy.

## Proposed Execution Order

1. Fix docs drift + naming consistency (fast, high clarity gains).
2. Refactor/split `+page.svelte` and reduce bundle warning.
3. Add e2e smoke coverage and shared-types tests.
4. Refactor `exports.ts` into maintainable modules with parity tests.
5. Finalize `data/` artifact policy and performance guardrails.

## Implementation Status (This Iteration)

Completed:

1. Documentation drift cleanup.
   - Fixed dead README doc reference.
   - Added local markdown link validation script (`npm run docs:check`).
   - Added docs link check to CI.

2. Naming consistency improvements.
   - Root package renamed to `polygonewild`.
   - Updated key user-facing app titles to `PolyGoneWild Template Maker`.
   - Export file prefix normalized to `polygonewild-...`.

3. Bundle/chunk risk reduction.
   - Extracted lightweight export contracts/options into `apps/web/src/lib/export-contracts.ts`.
   - Changed app export generation and ZIP creation to lazy-load heavy modules.
   - Build no longer emits the previous `>500 kB` client chunk warning.

4. Test coverage improvements.
   - Added shared-types schema/catalog tests (`packages/shared-types/src/index.test.ts`).
   - Added Playwright smoke tests (`apps/web/e2e/smoke.spec.ts`) plus config/scripts.
   - Added CI e2e job for browser smoke checks.

5. Performance guardrails.
   - Added pre-generate complexity checks with explicit user confirmation for heavy configurations.
   - Added focused tests for guard behavior.
   - Added a client bundle budget check script and CI enforcement (`npm run build:budget`).
   - Added generation latency benchmark checks and CI enforcement (`npm run perf:check`).

6. Data artifact policy.
   - Added explicit policy doc (`docs/data-artifact-policy.md`) for `data/` usage and fixture expectations.

7. Additional module decomposition.
   - Extracted app copy/config and related types to `apps/web/src/lib/app-content.ts`.
   - Extracted SVG perforation logic to `apps/web/src/lib/svg-perforation.ts`.
   - Extracted sheet guide, generated-file, and performance guard utilities to dedicated modules.

Remaining:

1. Large route/module decomposition.
   - `apps/web/src/routes/app/+page.svelte` and `apps/web/src/lib/exports.ts` are still large and should be split further for maintainability.
   - Priority next split: packing/orientation flow in `apps/web/src/lib/exports.ts`.

2. Deeper module decomposition.
   - Continue splitting `apps/web/src/routes/app/+page.svelte` and `apps/web/src/lib/exports.ts` into smaller UI/service modules.
