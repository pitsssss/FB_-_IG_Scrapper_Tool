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
# Full stack (api + dashboard + caddy). Creates a temporary .env — never commit one for CI.
npm run compose:smoke

# API image only: build, health/auth, volume persistence, non-root PID 1 check
# (verifies /proc/1 after su-exec — not `docker exec id`, which follows image USER root).
npm run docker:smoke
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

This project is licensed under the **Apache License, Version 2.0** — see [`LICENSE`](./LICENSE).

- Contributions are accepted under Apache-2.0 unless otherwise stated.
- Do not relicense third-party dependencies or strip required notices.
- Preserve attribution documented in [docs/release/THIRD_PARTY_LICENSE_INVENTORY.md](docs/release/THIRD_PARTY_LICENSE_INVENTORY.md).
- Dashboard Docker image redistribution has separate obligations — see [docs/release/DOCKER_THIRD_PARTY_COMPLIANCE.md](docs/release/DOCKER_THIRD_PARTY_COMPLIANCE.md).
- Release blockers and owner notes: [docs/release/OWNER_DECISIONS.md](docs/release/OWNER_DECISIONS.md).
