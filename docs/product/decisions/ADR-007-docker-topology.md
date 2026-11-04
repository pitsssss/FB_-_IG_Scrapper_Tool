# ADR-007: Docker deployment topology

**Status:** Accepted (design)  
**Phase:** 7A

## Decision

Extend Compose to **three services**: `caddy` (public TLS) + `api` + `dashboard`, one public origin, path-based routing (`/api` and `/health` → api; UI → dashboard). Persist `/data` for cache, quota, and management. Keep **one API replica**.

## Context

Current compose already uses Caddy + api with `api_data` volume and warns about filesystem quota single-process limits (`docker-compose.yml`, `src/index.js` log line).

## Alternatives

| Option | Verdict |
| --- | --- |
| Dashboard embeds API in one container | Larger image; harder scaling of concerns; possible but messier builds |
| Publish API port publicly without proxy | Weaker TLS story |
| Kubernetes | Out of scope for MVP self-host |
| Multiple API replicas | Unsafe with file quota |

## Tradeoffs

- Slightly more Compose complexity.
- Dashboard must use internal URL to API for server-side calls.

## Security implications

Do not expose unprotected admin routes; only Caddy publishes 80/443; secrets via env/secrets, not image bake-in.

## Migration path

Existing two-service deploys remain valid until operators upgrade compose files; document breaking compose changes in 7E release notes.
