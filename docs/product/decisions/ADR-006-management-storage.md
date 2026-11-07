# ADR-006: Management database vs file storage

**Status:** Accepted (implemented in 7C.1)  
**Phase:** 7A design / 7C.1 implementation

## Decision

Use a **dedicated management SQLite store** separate from post cache files:

- **Path:** `MANAGEMENT_DIR/app.sqlite` (default `./data/management`; Docker `/data/management`).
- **Driver:** Node.js built-in `node:sqlite` (`DatabaseSync`) — **no npm dependency**.
- **Engines:** Node **≥ 22.5** (CI already matrixes 22/24). Still emits ExperimentalWarning.
- **Keep:** Existing JSON post cache + `apify-quota.json` + Instagram profile meta files unchanged.

## Context

Zero runtime npm dependencies; Docker copies `src/` only onto `node:22-alpine`. Management needs transactional bootstrap and session revocation.

## Alternatives

| Option | Verdict |
| --- | --- |
| Extend only CACHE_DIR JSON | Rejected for sessions/bootstrap races |
| `better-sqlite3` | Rejected — native addon breaks copy-only Docker |
| PostgreSQL | Rejected — ops burden for single-instance MVP |

## Security implications

Restrict directory/file modes where OS allows; never store plaintext passwords or session tokens; parameterized SQL only; integrity_check on open.

## Migration path

Additive `schema_migrations`; no automatic cache deletion. 7C.2 adds tables for provider credentials and managed API keys.
