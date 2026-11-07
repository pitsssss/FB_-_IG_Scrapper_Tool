# Release readiness report — Phase 7F.1

**Product:** Social Media Posts API  
**Classification:** Release candidate (`0.1.0-beta.1`) — **not** a published public release  
**Baseline:** `5b53d8b`  
**Report date:** 2026-11-07

## Verdict

**PASS** for technical release-candidate hardening, with **owner blockers** still open (license, historical privacy rotation/rewrite decision, security reporting channel, live HTTPS / live Apify).

A PASS here does **not** authorize tagging a GitHub Release or claiming a completed open-source launch.

## Automated verification (executed)

| Check | Result |
| --- | --- |
| `npm test` | **169** pass |
| `npm run e2e` | **45** pass |
| `npm run postman:offline` | **495** assertions, 0 failed |
| Dashboard lint/typecheck/test/build | pass (**23** vitest) |
| `npm run compose:smoke` | **PASS** |
| `npm run release:acceptance` | **PASS** |
| `.\scripts\init-selfhost.ps1` | **PASS** (Docker Node generator) |
| `npm run privacy:history` | **REVIEW_REQUIRED** (sanitized; owner) |
| Backup `VACUUM INTO` unit test | **PASS** |
| Live public HTTPS | **LIVE_HTTPS_NOT_VERIFIED** |
| Full GUI MFA + Playground + responsive matrix | **NOT VERIFIED** (HTTP/API + unit coverage; no full browser automation matrix) |
| Paid Apify | **not run** (required) |

## Security findings (summary)

| Sev | Finding | Status |
| --- | --- | --- |
| High | BFF used `ADMIN_INTERNAL_SECRET` and skipped browser Origin — cross-site setup/login possible with stolen bootstrap/credentials | **Fixed** — `assertBrowserOrigin` on auth mutations; Compose injects `ADMIN_ALLOWED_ORIGINS` |
| Medium | BFF logout cleared cookies even when CSRF invalid | **Fixed** |
| Medium | `TRUST_PROXY` used left-most `X-Forwarded-For` (spoofable) | **Fixed** — prefer `X-Real-IP` / right-most hop; Caddy sets `X-Real-IP` |
| Info | Newman/Vitest npm audit noise (dev/test toolchain only; not in production API image) | Documented; Newman → 6.2.3; no forced major Vitest bump |
| Critical (history) | Historical pickaxe hits for `apify_api_` / Meta token prefix patterns | **Owner** — rotate if real; no history rewrite without approval |

## Owner blockers

See [OWNER_DECISIONS.md](./OWNER_DECISIONS.md):

1. `LICENSE_DECISION_REQUIRED`
2. Enable GitHub private vulnerability reporting
3. Historical privacy rotation / remediation decision
4. Optional: live HTTPS + live Apify acceptance
5. Explicit approval before GitHub Release/tag

## Install path (RC)

Docker-first: `scripts/init-selfhost.sh` / `scripts/init-selfhost.ps1` → Compose local overlay → `/setup`.
