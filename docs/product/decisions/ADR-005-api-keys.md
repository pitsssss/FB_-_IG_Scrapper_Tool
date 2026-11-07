# ADR-005: API key lifecycle and storage

**Status:** Accepted (implemented in 7C.2)  
**Phase:** 7A design / 7C.2 implementation

## Decision

- Generate keys with CSPRNG (`smp_<prefix>_<secret>`); store **SHA-256 hashes only**; show plaintext **once** at creation/rotation.
- Support create / list metadata / revoke / rotate / per-key FB+IG scopes (deny-by-default for managed keys).
- **Dual-read:** environment `API_KEYS` remain usable; managed keys hot-reload into the same authenticator.
- Name collisions between env and managed clients are rejected.
- Empty `API_KEYS` is allowed at startup (admin can create the first managed key); posts stay 401 without a valid key.
- Admin session must not substitute for API keys and vice versa.

## Context

Previously plaintext secrets in env; hashed in memory at boot only.

## Alternatives

| Option | Verdict |
| --- | --- |
| Keep env-only forever | Blocks product UX |
| Store plaintext for redisplay | Rejected |
| Auto-import env secrets into SQLite | Rejected (no silent copy of plaintext) |

## Tradeoffs

- Lost plaintext cannot be recovered — rotate instead.
- Dual-read until operators migrate integrations off env.

## Migration path

Create managed keys with matching scopes; update clients; optionally remove env entries later.
