# ADR-004: Apify token persistence and runtime activation

**Status:** Accepted (design)  
**Phase:** 7A

## Decision

1. Store Apify token **encrypted at rest** in the management store using an operator-supplied `DATA_ENCRYPTION_KEY`.
2. Validate via Apify’s HTTP API before save (access check ≠ balance guarantee).
3. Activate through a **runtime config holder** injected into providers — **hot update without process restart**.
4. Env `APIFY_TOKEN` remains bootstrap/fallback; dashboard-managed value takes precedence once set.
5. Never return full token after save; never log; never put in `NEXT_PUBLIC_*` or browser storage.

## Context

Today `config.apify.token` is read once from env (`src/config.js`) and closed over by providers (`src/providers/apify.js`, Instagram providers). Writing `.env` does not update a running process.

## Alternatives

| Option | Verdict |
| --- | --- |
| Only env + restart | Poor UX for product goal |
| Plaintext in SQLite | Unsafe backups |
| Next.js-only secret | Would force scrape-from-Next or dual sources |
| External secret manager only | Fine for advanced ops; not default self-host UX |

## Tradeoffs

- Requires encryption key management by operator.
- In-memory plaintext while process runs (necessary for Bearer calls) — protect process/host.

## Security implications

Threat items 3, 14–16. Validation error taxonomy in SECURITY_ARCHITECTURE.

## Migration path

Re-encrypt on key rotation; optional export to external KMS later without changing provider adapters’ fetch logic.
