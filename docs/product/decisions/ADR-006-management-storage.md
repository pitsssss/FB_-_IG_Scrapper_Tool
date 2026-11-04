# ADR-006: Management database vs file storage

**Status:** **OPEN** (recommendation below)  
**Phase:** 7A

## Recommendation (not final without owner approval if deps/engines change)

Use a **dedicated management store** separate from post cache files:

- **Preferred:** SQLite file under `/data/management/` for admin, sessions, API key hashes, encrypted secrets, settings, audit/usage.
- **Keep:** Existing JSON post cache + `apify-quota.json` + Instagram profile meta files unchanged.
- **Interim fallback:** Encrypted/atomic JSON documents if SQLite cannot land without unresolved engine/dependency policy.

## Context

Project rule: zero runtime npm dependencies today; Node engines `>=20.6`; Docker uses Node 22. Management needs concurrent-safe updates (sessions, key revoke) beyond ad-hoc files, but PostgreSQL is unjustified for single-instance self-host.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Extend only CACHE_DIR JSON | No new tech | Weak for sessions; easy corruption races |
| `node:sqlite` built-in | No npm dep | Experimental/version constraints — may need engines bump |
| `better-sqlite3` | Mature sync API | Native addon; first runtime dep; Alpine build care |
| PostgreSQL | Heavy | Ops burden |

## Tradeoffs

Choosing SQLite may require **owner approval** to bump engines and/or add a dependency — conflicts with historical zero-deps purity for the API package.

## Security implications

Encrypt sensitive columns; restrict file modes; backup = ciphertext + separate key escrow.

## Migration path

Additive DB file; no automatic cache deletion. Document backup of both trees.
