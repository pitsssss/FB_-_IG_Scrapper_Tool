# ADR-007: Docker deployment topology

**Status:** Accepted (implemented in Phase 7E)  
**Phase:** 7A design / 7E delivery

## Decision

Compose runs **three services**: `caddy` (public TLS or local HTTP) + `api` + `dashboard`, one public origin, **explicit** path-based routing:

| Path | Upstream |
| --- | --- |
| `/health`, `/api/v1/*` | `api:3000` |
| `/api/auth/*`, `/api/management/*`, `/api/health`, UI | `dashboard:3001` |

Persist `/data` (`CACHE_DIR` + `MANAGEMENT_DIR`) on volume `api_data`. Keep **one API replica**.

Local overlay: `docker-compose.local.yml` + `Caddyfile.local` bind `127.0.0.1:8080` without HSTS.

## Context

Catch-all `/api/*` → Node would break the Next.js BFF. Filesystem Apify quota remains single-process.

## Alternatives

| Option | Verdict |
| --- | --- |
| Dashboard embeds API in one container | Larger image; messier builds |
| Publish API port publicly without proxy | Weaker TLS story |
| Kubernetes | Out of scope for MVP self-host |
| Multiple API replicas | Unsafe with file quota |

## Tradeoffs

- Slightly more Compose complexity.
- Dashboard must use internal URL (`API_INTERNAL_URL=http://api:3000`) for server-side calls.
- Operators must generate bootstrap secrets once (`npm run secrets:generate`).

## Security implications

Do not expose unprotected admin routes; only Caddy publishes host ports; secrets via env (never image bake-in); matching `ADMIN_INTERNAL_SECRET` on api + dashboard; browser Origin allow-list uses the public URL, not Docker DNS names.

## Migration path

API-only `docker run` remains supported. Prefer Compose three-service stack for the self-hosted product. See `docs/SELF_HOSTING_GUIDE.md`.
