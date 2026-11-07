# Contributing

Thanks for helping improve **Social Media Posts API**.

## Prerequisites

- Node.js ≥ 22.5 (for local API/dashboard development and tests)
- Docker Engine + Compose v2+ (for the self-hosted stack)
- No real Apify token required for default tests

## Quick developer loop

```bash
# API
cp .env.example .env
npm test
npm run e2e
npm run postman:offline

# Dashboard
cd apps/dashboard
npm ci
npm run lint && npm run typecheck && npm run test && npm run build
```

Docker (synthetic secrets; isolated smoke):

```bash
npm run compose:smoke
```

Self-host init **without** host Node (Docker only):

```bash
# bash
./scripts/init-selfhost.sh

# PowerShell
.\scripts\init-selfhost.ps1
```

## Rules of the road

1. **Public API contract** (`/health`, `/api/v1/facebook/posts`, `/api/v1/instagram/posts`) field names/types are stable — update README, OpenAPI/schema, and tests together if you must change them.
2. **Never** commit `.env`, real API keys, Apify tokens, encryption keys, production SQLite/cache, or customer account names.
3. Prefer synthetic fixtures (`cern`, `nasa`) and mocked providers. Do not run paid Apify Actors in CI or default tests.
4. Never overwrite a good cache entry with an empty/failed upstream result.
5. Keep **one API replica** while Apify quota is filesystem-based.
6. Dashboard secrets stay server-only — no `NEXT_PUBLIC_*` for tokens or internal URLs that encode secrets.

## Pull requests

- Keep PRs focused; include tests for behavior changes.
- Run the verification commands above before requesting review.
- Do not force-push shared branches; do not rewrite published history.

## Security reports

See [SECURITY.md](./SECURITY.md). Do not file public issues for exploitable vulnerabilities.

## License

License selection is an **owner decision** (`LICENSE_DECISION_REQUIRED`). Do not add a `LICENSE` file in a PR unless the owner has explicitly approved the SPDX identifier.
