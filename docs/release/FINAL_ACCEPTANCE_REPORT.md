# Final acceptance report — Phase 7F.2

**Product:** Social Media Posts API  
**Version:** `0.1.0-beta.1` (release candidate; not a published GitHub Release)  
**Baseline inspected:** `a723114`  
**Report date:** 2026-11-07  
**Verdict:** **CONDITIONAL GO**

This document is evidence-based. A CONDITIONAL GO means technical release-candidate acceptance is complete enough for an owner-gated public beta **after** mandatory owner actions below. It does **not** authorize tagging, GitHub Release publication, license invention, history rewrite, or live deployment.

---

## A. Git and commits

| Item | Value |
| --- | --- |
| Baseline SHA | `a723114` |
| Expected product version | `0.1.0-beta.1` |
| License file | **Absent** — `LICENSE_DECISION_REQUIRED` |
| Tag / GitHub Release | **Not created** (owner-gated) |

Phase 7F.2 adds isolated Playwright browser acceptance (mocked Apify), logout CSRF header fix in the dashboard Sign-out control, `APIFY_VERIFY_BASE_URL` for isolated verification, and this acceptance pack.

---

## B. Browser acceptance (Playwright, isolated Compose)

**Command:** `npm run browser:acceptance`  
**Evidence artifact:** [BROWSER_ACCEPTANCE_SUMMARY.json](./BROWSER_ACCEPTANCE_SUMMARY.json)  
**Environment:** temporary Compose project, temporary volumes, synthetic admin credentials, mocked Apify (`docker-compose.browser.yml`), no operator data, no paid Actors.

| Journey | Status | Notes (no credentials) |
| --- | --- | --- |
| Compose stack healthy | **PASS** | Isolated ports / volumes |
| Security Origin reject | **PASS** | Cross-origin BFF mutation → 403 |
| First-time admin setup | **PASS** | |
| Responsive 360 / 390 / 768 / 1024 / 1440 | **PASS** | Content rendered at each viewport |
| TOTP enrollment | **PASS** | |
| Recovery codes display | **PASS** | |
| Logout | **PASS** | CSRF header required (dashboard fix) |
| Invalid password | **PASS** | Stays on login |
| MFA challenge required | **PASS** | |
| MFA TOTP success | **PASS** | |
| Recovery-code authentication | **PASS** | |
| Mocked Apify provider connect | **PASS** | |
| API key create + one-time secret UI | **PASS** | |
| Playground Cache Only | **PASS** | Cache miss acceptable |
| Live Refresh prepare + cancel | **PASS** | |
| Mocked confirmed refresh | **PASS** | |
| Instagram mocked path | **PASS** | |
| Visual playground / cache / settings / usage | **PASS** | |
| API key rotate + revoke | **PASS** | |
| Post-logout authorization rejection | **PASS** | Redirect to login |
| Playground raw JSON view | **NOT VERIFIED** | Selector/path not confirmed in automation |
| Session idle expiry (2h) | **NOT VERIFIED** | Covered by unit/admin session tests; not wall-clock browser wait |

**Summary:** 27 PASS, 0 FAIL, 2 NOT VERIFIED.

Classification: **MOCKED PROVIDER VERIFIED** for dashboard provider + playground refresh paths. **REAL PROVIDER VERIFIED** was not attempted.

---

## C. Security regression (7F.1 fixes + boundaries)

| Check | Evidence | Status |
| --- | --- | --- |
| Browser Origin at Next.js BFF | Unit `origin-gate.test.ts`; browser `security_origin_reject` 403; release acceptance | **PASS** |
| Logout CSRF enforcement | Logout route requires CSRF; dashboard `LogoutButton` sends CSRF header; browser logout PASS | **PASS** |
| Trusted proxy client IP | `test/csrf-forwarded-ip.test.js`; Caddy `X-Real-IP {remote_host}` | **PASS** |
| Session / MFA boundaries | `admin-auth` / `admin-auth-mfa` unit tests; browser MFA journeys | **PASS** |
| Bootstrap takeover protection | Release acceptance + setup Origin gate | **PASS** |
| Managed API key revoke | Browser revoke + management API key tests | **PASS** |
| Platform scope isolation | Unit cross-platform identity tests | **PASS** |
| Apify credential encryption | Management provider tests (isolated DB) | **PASS** |
| No secret exposure in logs/bodies | E2E security section PASS | **PASS** |
| No unexpected paid calls | Browser/compose use mock or `APIFY_DAILY_RUN_LIMIT=0` | **PASS** |
| Quota fail-closed | Existing quota unit/e2e coverage | **PASS** |
| Cache Only side-effect isolation | Browser cache-only + offline Postman | **PASS** |

---

## D. Historical privacy (sanitized)

**Command:** `npm run privacy:history` → **HISTORICAL_PRIVACY: REVIEW_REQUIRED**

| Pattern class | HEAD assessment (sanitized) | Historical risk |
| --- | --- | --- |
| `apify_token_prefix` (`apify_api_`) | At HEAD: appears in **negative assertions** (Postman scripts / privacy tests / audit needles), not as live token values | Older Postman artifacts may have contained longer token-shaped strings — **owner private review** |
| `meta_page_token_prefix` | Needle in audit + privacy tests only | Documentation / detector style |
| PEM private key markers | Needle strings inside `privacy-history-audit.mjs` only | False-positive from detector source |
| `env_*` assignments | `.env.example` empty secrets; scripts documenting keys; synthetic RC env writers | Treat any non-placeholder historical values as **D — potentially real** until owner confirms |

**Categories used:** A documentation placeholders · B synthetic test credentials · C public examples / detector needles · D potentially real (owner confirm) · E private customer identifiers (prior cleanup commit exists; forks may retain objects) · F confirmed sensitive — **not asserted publicly without owner confirmation**.

Investigative detail kept **local/untracked** (agent store / temp). No secret values in this report.

---

## E. Credential rotation requirements

Do **not** rotate blindly from CI. Owner actions if any historical value was ever production-real:

1. **Apify API token** — revoke/rotate in Apify console; update Providers UI / env; confirm old token fails verification.
2. **Managed / env API keys** — revoke in dashboard or rotate `API_KEYS`; clients must receive new secrets out-of-band.
3. **Bootstrap / admin internal secrets** — regenerate via `secrets:generate` / init scripts; redeploy; invalidate sessions.
4. **`DATA_ENCRYPTION_KEY`** — if exposure suspected: generate a new key, **re-encrypt** stored provider ciphertext with a controlled migration (export under old key → import under new key), escrow the new key separately from DB backups. Do **not** delete ciphertext before verifying decrypt under the new key.
5. **Meta page tokens** — revoke in Meta developer tools if ever real.

Rotation confirmation is a **mandatory** public-release gate when any finding is class D/F.

---

## F. Git history remediation recommendation

| Question | Recommendation |
| --- | --- |
| Is rewrite required before beta? | **Not as the first step.** Prefer rotation + confirm HEAD is clean of live secrets. |
| When to rewrite? | Only after explicit owner authorization, with a written impact plan. |
| Tools | Owner-only: `git-filter-repo` / BFG — **not executed** in 7F.2 |
| Impact if rewrite authorized | All branches/tags rewritten; open PRs retarget; CI caches invalidated; collaborator clones must re-clone; forks retain old objects; mirrors/backups may keep pre-rewrite SHAs; rollback = restore pre-rewrite mirror tag kept offline |
| Force push | **Forbidden** unless owner explicitly orders a coordinated remediation window |

---

## G. License status

**LICENSE_DECISION_REQUIRED** — no `LICENSE` file; no SPDX claimed.

---

## H. Security reporting status

**PRIVATE_REPORTING_NOT_VERIFIED** — `gh` CLI unavailable in the acceptance environment; GitHub private vulnerability reporting was not confirmed via API.

Owner steps:

1. GitHub repo → **Settings** → **Code security and analysis** (or **Security** → **Advisories**).
2. Enable **Private vulnerability reporting**.
3. Confirm `SECURITY.md` still points maintainers at Advisories (it already does; do not invent an email).

Until enabled (or an authorized contact is published), treat security-reporting readiness as incomplete for a fully public launch.

---

## I. HTTPS acceptance status

**LIVE_HTTPS_NOT_VERIFIED** — no production domain was supplied; no automatic deploy.

Reviewed: production `Caddyfile` (automatic HTTPS for `{$API_DOMAIN}`, HSTS, BFF vs API split, `X-Real-IP`). Local HTTP overlay verified via compose smoke / release / browser stacks.

### Operator-run HTTPS checklist

1. Point DNS A/AAAA at the host; set `API_DOMAIN`; `ADMIN_ALLOWED_ORIGINS=https://<domain>`; `ADMIN_COOKIE_SECURE=1`.
2. `docker compose up -d --build` (production files, not local-only overlay).
3. Verify DNS, `https://` certificate chain, HTTP→HTTPS redirect.
4. Confirm `Secure` session/CSRF cookies; Origin/CSRF still succeed from the public origin.
5. Login dashboard; call `/api/v1/*` with API key; confirm `/health` only; confirm management ports not published publicly.
6. Confirm no private management payloads on public unauthenticated routes.

---

## J. Real Apify acceptance status

**MOCKED PROVIDER VERIFIED** (browser acceptance).  
**REAL PROVIDER VERIFIED** — **not run** (opt-in only).

### Controlled manual procedure (owner)

1. Use the operator’s own Apify account; never commit the token.
2. Prefer neutral public demo usernames already allowed by scopes.
3. Check `npm run quota:status` / Usage UI; note `APIFY_DAILY_RUN_LIMIT` and any per-run USD cap.
4. Explicit approval before **each** paid Actor run; disable profile enrichment unless approved; no automatic retries; limit attempts (e.g. ≤2 per platform).
5. Confirm normalized posts, cache persistence, subsequent Cache Only hits.
6. Record outcomes without publishing tokens or billing guesses unless taken from Apify’s authoritative billing UI.

---

## K. Quality gate results (executed)

| Gate | Result |
| --- | --- |
| `npm test` | **169** pass / 0 fail |
| `npm run e2e` | **45** pass |
| `npm run postman:offline` | Newman **495** assertions, 0 failed |
| `npm run compose:smoke` | **PASS** |
| `npm run release:acceptance` | **PASS** |
| `npm run browser:acceptance` | **27 PASS**, 0 FAIL, 2 NOT VERIFIED |
| `npm run privacy:history` | **REVIEW_REQUIRED** |
| Dashboard `lint` / `typecheck` / `test` / `build` | **PASS** (23 vitest) |
| `npm audit --omit=dev` (root + dashboard) | **0** production vulnerabilities |
| Full `npm audit` (incl. dev) | Newman/Vitest toolchain advisories remain; **do not** `npm audit fix --force` |

---

## L. Release decision matrix

| Gate | Evidence | Status | Owner action | Severity |
| --- | --- | --- | --- | --- |
| Technical regression | unit/e2e/postman/release | PASS | None | — |
| Browser acceptance | Playwright summary | PASS (2 NV) | Optional: finish JSON view + idle expiry automation | RECOMMENDED ACCEPTANCE |
| Authentication and MFA | browser + unit | PASS | None | — |
| Provider and API key workflows | browser mocked | PASS | Optional live Apify | RECOMMENDED ACCEPTANCE |
| Docker Compose | smoke + browser | PASS | None | — |
| Backup and restore | unit + release scripts | PASS | Operator drill on real volumes | RECOMMENDED ACCEPTANCE |
| Privacy at HEAD | public-privacy tests; needle-only prefixes | PASS (sanitized) | Spot-check | — |
| Historical privacy | privacy:history | REVIEW_REQUIRED | Private review + rotate if real | **MANDATORY BEFORE PUBLIC RELEASE** |
| Credential rotation | N/A until owner review | PENDING | Confirm rotation or “never real” | **MANDATORY BEFORE PUBLIC RELEASE** |
| License | no LICENSE | LICENSE_DECISION_REQUIRED | Choose SPDX | **MANDATORY BEFORE PUBLIC RELEASE** |
| Security reporting | not API-verified | PRIVATE_REPORTING_NOT_VERIFIED | Enable Advisories | **MANDATORY BEFORE PUBLIC RELEASE** |
| HTTPS | config reviewed only | LIVE_HTTPS_NOT_VERIFIED | Operator checklist | RECOMMENDED ACCEPTANCE |
| Live Apify | not run | NOT VERIFIED | Opt-in procedure | OPTIONAL POST-BETA IMPROVEMENT |
| Release documentation | this pack + drafts | PASS pending license wording | Approve notes | RECOMMENDED ACCEPTANCE |

---

## M. Owner actions still required

1. Reply with SPDX license id → maintainer adds `LICENSE` (no guessing).
2. Enable GitHub private vulnerability reporting (or publish authorized contact).
3. Privately review `npm run privacy:history` sample commits; rotate any ever-real credentials; record “rotated” or “confirmed never real”.
4. Explicitly approve (or defer) history rewrite — default is **defer**.
5. Approve GitHub Release / tag creation when 1–3 are done.
6. Optional: live HTTPS domain acceptance; controlled live Apify runs; repo rename.

---

## N. Final verdict

# CONDITIONAL GO

Technical Phase **7F.2** acceptance is complete for an owner-gated open-source **beta** once mandatory license, security-reporting, and historical-credential gates are closed by the owner.

**Not** GO FOR BETA while those mandatory blockers remain.  
**Not** NO-GO on engineering quality — automated and browser-mocked acceptance passed.

Do not publish a GitHub Release, create a version tag, force-push, rewrite history, or deploy to a public domain without separate owner authorization.
