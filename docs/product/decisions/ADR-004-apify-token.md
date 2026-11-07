# ADR-004: Apify token persistence and runtime activation

**Status:** Accepted (implemented in 7C.2)  
**Phase:** 7A design / 7C.2 implementation

## Decision

1. Store Apify token **encrypted at rest** (AES-256-GCM) using operator-supplied `DATA_ENCRYPTION_KEY` (base64 32 bytes).
2. Validate via `GET https://api.apify.com/v2/users/me` before save (access check ≠ balance guarantee). No Actor runs during validation.
3. Activate through a **runtime credential holder** bound to `config.apify.token` getter — **hot update without process restart**.
4. Precedence: active managed token → else env `APIFY_TOKEN` only when no managed/disconnected state → **explicit disconnect suppresses env fallback**.
5. Never return full token after save; never log; never put in `NEXT_PUBLIC_*` or browser storage.

## Context

`config.apify.token` was previously read once from env. Writing `.env` does not update a running process.

## Alternatives

| Option | Verdict |
| --- | --- |
| Only env + restart | Poor UX |
| Plaintext in SQLite | Unsafe backups |
| Argon2-derived key from admin password | Rejected — password change would brick credentials |

## Tradeoffs

- Requires encryption key backup by operator.
- In-memory plaintext while process runs (necessary for Bearer calls).

## Migration path

Re-encrypt on key rotation; optional external KMS later without changing provider fetch logic.
