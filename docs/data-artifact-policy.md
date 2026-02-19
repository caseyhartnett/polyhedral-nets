# Data Artifact Policy

Last reviewed: February 18, 2026

## Purpose

Define what belongs in `data/` and what should remain local-only generated output.

Why this matters:
- Large generated files create noisy diffs and obscure meaningful review changes.
- Treating runtime output as source data can cause stale fixtures and false confidence.

## Current Decision

- `data/artifacts/` and `data/jobs/` are treated as local/generated debugging outputs, not source-of-truth fixtures.
- New runtime-generated files should not be committed by default.
- Canonical test fixtures should live beside tests in workspace packages (`apps/web`, `services/geometry-engine`, `packages/shared-types`) with explicit naming.

## Repository Rules

1. Keep only intentional, reviewed fixture files in version control.
2. Do not add ad-hoc generated run outputs from local sessions.
3. If a generated artifact is required for a deterministic regression test, move it into a test-owned fixture directory and document why it is required.
4. Favor programmatic fixture generation in tests when practical.

## Follow-up

- Add `.gitignore` rules for local runtime outputs if the team confirms they are never needed in-repo.
- Optionally add a CI check that fails if new files are added under `data/artifacts` or `data/jobs` outside explicit fixture updates.
