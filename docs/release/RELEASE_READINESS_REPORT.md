# Release readiness report — Phase 7F.2 (+ STEP 3C privacy gate note)

**Product:** Social Media Posts API  
**Classification:** Release candidate (`0.1.0-beta.1`) — **not** a published public release  
**Phase 7F.2 baseline:** `a723114` → ending `df8c4fc` (historical acceptance pack)  
**Post-license / privacy track:** Apache-2.0 on `main`; private vulnerability reporting enabled; STEP 3C privacy-gate stabilization  
**Companion:** [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md) · [OWNER_DECISIONS.md](./OWNER_DECISIONS.md)

## Verdict

**CONDITIONAL GO** for owner-gated **source-only** open-source beta.

Technical acceptance (including isolated Playwright browser journeys with mocked Apify) **passed**. License and private vulnerability reporting gates are **complete**. Remaining mandatory owner items: **accept or escalate residual GitHub PR-ref/cache privacy risk**, confirm security notification settings, then explicitly approve tag/Release.

**Docker image distribution** remains a **separate blocked gate** (sharp/libvips LGPL compliance).

A CONDITIONAL GO does **not** authorize tagging a GitHub Release or claiming a completed open-source launch.

## Automated verification (executed in 7F.2; re-check after STEP 3C changes)

| Check | Result |
| --- | --- |
| `npm test` | Pass (includes privacy classification regressions after STEP 3C) |
| `npm run e2e` | **45** pass (7F.2) |
| `npm run postman:offline` | **495** assertions, 0 failed (7F.2) |
| Dashboard lint/typecheck/test/build | pass (**23** vitest in 7F.2) |
| `npm run compose:smoke` | **PASS** (7F.2) |
| `npm run release:acceptance` | **PASS** (7F.2) |
| `npm run browser:acceptance` | **27 PASS**, 0 FAIL, **2 NOT VERIFIED** (JSON view; 2h idle expiry) |
| `npm run privacy:history` | STEP 3C: synthetic hits classify **PASS**; unresolved realistic hits still **REVIEW_REQUIRED** |
| `npm audit --omit=dev` | **0** vulnerabilities (API + dashboard) at 7F.2 |
| Live public HTTPS | **LIVE_HTTPS_NOT_VERIFIED** |
| Paid / real Apify | **not run** — **MOCKED PROVIDER VERIFIED** only |
| GitHub CI on licensed `main` | **Green** (verified via Actions API around `fab9b4f`) |

## Security findings (summary)

| Sev | Finding | Status |
| --- | --- | --- |
| High | BFF Origin skip (7F.1) | **Fixed** — revalidated in browser Origin reject |
| Medium | Logout CSRF (7F.1 server + 7F.2 dashboard Sign-out header) | **Fixed** — browser logout PASS |
| Medium | Spoofable `X-Forwarded-For` (7F.1) | **Fixed** — unit + Caddy `X-Real-IP` |
| Info | Newman/Vitest npm audit noise (dev toolchain) | Documented; no `audit fix --force` |
| Info (history) | Pickaxe synthetic detector / placeholder hits | **Classified** (STEP 3C) — not treated as live credential exposure |
| Residual | Pre-rewrite GitHub PR refs `#1–#7` / cached commits | **Owner decision** — accept residual risk or Support draft |

## Owner blockers (current)

See [OWNER_DECISIONS.md](./OWNER_DECISIONS.md):

1. ~~`LICENSE_DECISION_REQUIRED`~~ → **Done** (Apache-2.0 on `main`)
2. ~~`PRIVATE_REPORTING_NOT_VERIFIED`~~ → **Enabled** (STEP 3A)
3. Residual historical PR/cache privacy acceptance **or** Support escalation — **pending**
4. Owner credential declaration recorded — **yes** (declaration, not forensic proof); no evidenced rotation
5. `OWNER_NOTIFICATION_PENDING` for GitHub security alerts
6. Optional: live HTTPS + live Apify acceptance
7. Explicit approval before GitHub Release/tag
8. Docker LGPL compliance before **image** publication (not required for source-only beta)

## Install path (RC)

Docker-first: `scripts/init-selfhost.sh` / `scripts/init-selfhost.ps1` → Compose local overlay → `/setup`.  
Publishing the dashboard **image** still requires the Docker third-party compliance gate.
