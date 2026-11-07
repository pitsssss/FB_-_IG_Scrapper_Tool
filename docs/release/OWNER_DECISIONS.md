# Owner decisions required before public release

These items **block** calling the project a completed public open-source release. Technical Phase **7F.2** produced a **CONDITIONAL GO** (see [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md)).

## 1. LICENSE_DECISION_REQUIRED

No `LICENSE` file is committed. Do **not** auto-select a license.

| License | Commercial use | Redistribution / modification | Attribution | Copyleft | Patents |
| --- | --- | --- | --- | --- | --- |
| **MIT** | Yes | Yes | Required notice | None | No explicit grant |
| **Apache-2.0** | Yes | Yes | NOTICE + change notes | None | Explicit patent grant/termination |
| **GPL-3.0** | Yes (with GPL terms) | Yes | Required | Strong — derivatives must be GPL | Patent provisions + strong copyleft |

**Recommendation:** **Apache-2.0** for a self-hosted infrastructure tool (patent grant + clear attribution without viral copyleft). Choose **MIT** if maximum simplicity is preferred. Choose **GPL-3.0** only if the owner wants to require share-alike for derivative SaaS/products.

Owner must reply with the SPDX id (e.g. `Apache-2.0`) before a `LICENSE` file is added.

## 2. Security reporting channel

`SECURITY.md` references GitHub Security Advisories. Owner must **enable private vulnerability reporting** on the GitHub repository (or publish an authorized contact).

Acceptance status: **PRIVATE_REPORTING_NOT_VERIFIED** (no authorized API confirmation in the 7F.2 environment).

Until then, mark security-reporting readiness incomplete for a fully public launch.

## 3. Historical Git privacy

Sanitized audit result (`npm run privacy:history`):

- Pattern hits exist (counts only; **values omitted**). At HEAD, `apify_api_` occurrences inspected in tracked Postman artifacts are **negative-assertion needles**, not live token values. Env assignment hits include `.env.example` empty placeholders and synthetic test harness writers.
- Historical commits (including retired Postman artifacts) still require **owner private review**.
- Status: **HISTORICAL_PRIVACY: REVIEW_REQUIRED**

**Owner actions:**

1. Privately review sample commit SHAs printed by the audit (values are not printed by the tool).
2. **Rotate** any credentials that were ever real (Apify, API keys, encryption keys, bootstrap tokens) — do not rely on history rewrite alone.
3. Decide whether to authorize a **separate**, planned history-remediation procedure (filter-repo / BFG). This requires explicit approval, coordination with forks/clones, and is **not** performed automatically.
4. Understand that rewritten objects may remain in forks, CI caches, and mirrors.

Unresolved **real** credential exposure is a **release blocker** until rotation is confirmed (or owner records that matches were never production-real).

## 4. Repository rename (optional)

GitHub repository name may still be the historical scraper name. Product name is **Social Media Posts API**. Renaming the GitHub repo is optional and owner-only.

## 5. Live HTTPS & paid Apify acceptance

- `LIVE_HTTPS_NOT_VERIFIED` until the owner points a real DNS name at a deployment and confirms certificates + Secure cookies (checklist in FINAL_ACCEPTANCE_REPORT).
- Controlled live Apify runs remain optional acceptance, never part of default CI.
- Browser acceptance established **MOCKED PROVIDER VERIFIED** only.

## 6. Public GitHub Release / tag

Do not publish `v0.1.0-beta.1` (or any tag) until items 1–3 are resolved to the owner’s satisfaction. Proposed version is a draft only.
