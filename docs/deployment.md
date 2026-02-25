# Deployment Guide

This project is a stateless, browser-only app. Deploy it as static assets.

- No API service is required
- No database is required
- No Redis is required

## Recommended: Cloudflare Pages (Git Integration)

This is the best fit for your current setup.

### 1. Push this repo to GitHub

Cloudflare Pages will build from your repo.

### 2. Create a Pages project

In Cloudflare Dashboard:

- `Workers & Pages` -> `Create application` -> `Pages`
- `Import an existing Git repository`
- Select this repository

### 3. Build settings

Use these exact values:

- `Production branch`: `main` (or your preferred production branch)
- `Build command`: `npm run build`
- `Build output directory`: `apps/web/build`
- `Root directory (advanced)`: leave blank (repo root)

Why this output path:
- The app uses `@sveltejs/adapter-static`
- Static files are written to `apps/web/build`

### 4. Environment variables (recommended)

Set this in Pages project settings for both Preview and Production:

- `NODE_VERSION=20`

Cloudflare Pages Build System v3 defaults to Node 22, and this repo targets Node `>=20`. Pinning keeps builds predictable.

### 4.1 Security headers

Security headers are defined in:

- `apps/web/static/_headers`

Cloudflare Pages applies this file at deploy time. Keep this file aligned with the app's `blob:` download/preview behavior.

### 5. Deploy

Click `Save and Deploy`.

Cloudflare will publish to `*.pages.dev` and auto-deploy on new commits.

### 6. Custom domain

In Pages project:

- `Custom domains` -> `Set up a custom domain`
- Add your domain/subdomain and follow Cloudflare DNS prompts

If you are using this tool alongside another site (for example, `polyhedralnets.com`):

- Attach `tool.polyhedralnets.com` in this **tool's Pages project** under `Custom domains`
- Keep `polyhedralnets.com` and `www.polyhedralnets.com` attached to the separate main Pages project
- Do not attach `tool.polyhedralnets.com` to the main site project

## Optional: Cloudflare Pages (Direct Upload / CLI)

If you do not want Git-triggered builds:

```bash
npm install
npm run build
npx wrangler pages deploy apps/web/build
```

Notes:
- Direct Upload projects and Git-integrated projects are separate project modes in Pages.

## Optional: Railway Static Hosting

You can also deploy this as a static site on Railway, but Cloudflare Pages is usually simpler for this repo.

### Railway settings

If Railway does not auto-detect correctly, set:

- `Build command`: `npm run build`
- `Publish/output directory`: `apps/web/build`
- `Root directory`: `/`

For monorepos, Railway supports overriding `Root Directory` and build command in service settings.

### Domain on Railway

- In Railway service `Settings` -> `Public Networking`
- Generate domain or add custom domain
- Point DNS (CNAME) from Cloudflare DNS to Railway-provided target

## CI/CD expectation

- Every push to production branch triggers build + deploy
- Pull request branches can generate preview deployments (Cloudflare and Railway both support previews)

## Deployment checklist

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. Confirm `apps/web/build/index.html` exists
6. Verify exports in deployed site:
   - SVG download
   - PDF download
   - STL download
7. Refresh tab and confirm state resets (stateless behavior)

## Sources (checked)

- Cloudflare Pages SvelteKit guide: https://developers.cloudflare.com/pages/framework-guides/deploy-a-svelte-kit-site/
- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages monorepos: https://developers.cloudflare.com/pages/configuration/monorepos/
- Cloudflare Pages build image / tool versions: https://developers.cloudflare.com/pages/configuration/language-support-and-tools/
- Cloudflare Pages direct upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Railway static hosting guide: https://docs.railway.com/guides/static-hosting
- Railway build configuration: https://docs.railway.com/builds/build-configuration
- Railway monorepo guide: https://docs.railway.com/guides/monorepo
- Railway domains: https://docs.railway.com/networking/domains
