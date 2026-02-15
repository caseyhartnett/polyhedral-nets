# API Contracts

The runtime API layer has been removed as part of the stateless refactor.

Current behavior:

- Core generation and export flow runs entirely in the browser.
- No `/api/*` routes are used for modeling or export generation.
- No project/revision/job/artifact persistence API exists.

If an HTTP API is reintroduced in the future, this document should be replaced with the new endpoint contracts.
