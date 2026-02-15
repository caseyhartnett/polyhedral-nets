## Summary

- [ ] Briefly describe what changed
- [ ] Link issue/task (if applicable)

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`

## Deployment Impact

- [ ] No deployment changes
- [ ] Deployment changes included in `docs/deployment.md`
- [ ] Static output still generated at `apps/web/build`

## Security Checklist

- [ ] No `{@html}` / `innerHTML` / `eval` / `new Function`
- [ ] No unintended runtime network calls in core app flow
- [ ] Input bounds and guardrails considered for new logic
- [ ] Security headers impact considered (`apps/web/static/_headers`)
