# Release readiness report — Phase 7F.2

**Product:** Social Media Posts API  
**Classification:** Release candidate (`0.1.0-beta.1`) — **not** a published public release  
**Baseline:** `a723114`  
**Report date:** 2026-11-07  
**Companion:** [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md)

## Verdict

**CONDITIONAL GO** for owner-gated open-source beta.

Technical acceptance (including isolated Playwright browser journeys with mocked Apify) **passed**. Mandatory owner blockers remain: **license**, **historical privacy rotation confirmation**, **private vulnerability reporting**. Live HTTPS and live Apify are recommended/optional and were not claimed as verified.

A CONDITIONAL GO does **not** authorize tagging a GitHub Release or claiming a completed open-source launch.

## Automated verification (executed in 7F.2)

| Check | Result |
| --- | --- |
| `npm test` | **169** pass |
| `npm run e2e` | **45** pass |
| `npm run postman:offline` | **495** assertions, 0 failed |
| Dashboard lint/typecheck/test/build | pass (**23** vitest) |
| `npm run compose:smoke` | **PASS** |
| `npm run release:acceptance` | **PASS** |
| `npm run browser:acceptance` | **27 PASS**, 0 FAIL, **2 NOT VERIFIED** (JSON view; 2h idle expiry) |
| `npm run privacy:history` | **REVIEW_REQUIRED** (sanitized; owner) |
| `npm audit --omit=dev` | **0** vulnerabilities (API + dashboard) |
| Live public HTTPS | **LIVE_HTTPS_NOT_VERIFIED** |
| Paid / real Apify | **not run** — **MOCKED PROVIDER VERIFIED** only |

## Security findings (summary)

| Sev | Finding | Status |
| --- | --- | --- |
| High | BFF Origin skip (7F.1) | **Fixed** — revalidated in browser Origin reject |
| Medium | Logout CSRF (7F.1 server + 7F.2 dashboard Sign-out header) | **Fixed** — browser logout PASS |
| Medium | Spoofable `X-Forwarded-For` (7F.1) | **Fixed** — unit + Caddy `X-Real-IP` |
| Info | Newman/Vitest npm audit noise (dev toolchain) | Documented; no `audit fix --force` |
| Critical (history) | Historical pickaxe hits | **Owner** — rotate if real; no rewrite without approval |

## Owner blockers

See [OWNER_DECISIONS.md](./OWNER_DECISIONS.md):

1. `LICENSE_DECISION_REQUIRED`
2. Enable GitHub private vulnerability reporting (`PRIVATE_REPORTING_NOT_VERIFIED`)
3. Historical privacy rotation / remediation decision
4. Optional: live HTTPS + live Apify acceptance
5. Explicit approval before GitHub Release/tag

## Install path (RC)

Docker-first: `scripts/init-selfhost.sh` / `scripts/init-selfhost.ps1` → Compose local overlay → `/setup`.
