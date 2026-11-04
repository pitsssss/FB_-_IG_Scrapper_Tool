# ADR-005: API key lifecycle and storage

**Status:** Accepted (design)  
**Phase:** 7A

## Decision

- Generate keys with CSPRNG; store **hashes only** at rest; show plaintext **once** at creation/rotation.
- Support create / name / list metadata / revoke / rotate / per-key FB+IG scopes.
- Keep public verification via `x-api-key` / Bearer and timing-safe compare.
- Admin session must not substitute for API keys and vice versa.
- Migrate from startup `API_KEYS` env via import or dual-read overlay (product choice OPEN — see roadmap O5).

## Context

Today: plaintext secrets in env; hashed in memory at boot (`src/server.js`); scopes from `API_KEY_PAGE_SCOPES`. Runtime create/revoke impossible without restart.

## Alternatives

| Option | Verdict |
| --- | --- |
| Keep env-only forever | Blocks product UX |
| Store plaintext keys in DB for redisplay | Rejected |
| Opaque cookies for machine clients | Wrong client type |

## Tradeoffs

- Lost plaintext cannot be recovered — correct security property; rotation replaces.
- Dual-read migration complicates auth until cutover.

## Security implications

Threat items 4, 13. Preserve fail-closed scopes (no wildcards — already enforced in `parseApiKeyPageScopes`).

## Migration path

Phase out env plaintext after dashboard import; document rotation for existing integrations.
