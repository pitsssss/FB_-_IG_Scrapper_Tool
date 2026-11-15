# External beta — Tester acceptance checklist

Mark each item **PASS**, **FAIL**, or **BLOCKED**.
Use `docs/beta/FEEDBACK_TEMPLATE.md` for every FAIL / BLOCKED item.

| Field | Your value |
| --- | --- |
| Anonymous tester ID | e.g. `beta-T2` |
| Git commit tested | `git rev-parse HEAD` |
| OS | |
| Docker version | `docker version` (Client/Server) |
| Browser | |
| Date (UTC) | |

**Reminder:** A fresh install with empty Apify token and `APIFY_DAILY_RUN_LIMIT=0` **will** show empty cache / cache-miss style responses. That is **PASS** for cache-only mode — do not mark it as a scraping failure.

---

## INSTALLATION

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| I1 | First `git clone` succeeds | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| I2 | `init-selfhost` creates/updates `.env` without errors | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| I3 | `apply-beta-safe-defaults -Confirm/--confirm` sets daily limit `0` + empty warm lists + enrichment `0` | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| I4 | `docker compose … up -d --build` completes | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| I5 | `docker compose … ps` shows api/dashboard/caddy healthy/running | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| I6 | `GET http://127.0.0.1:8080/health` succeeds | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## AUTHENTICATION

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| A1 | `/setup` opens; bootstrap token accepted | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A2 | Administrator account created | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A3 | Login with new credentials works | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A4 | After login/setup, Overview appears (no permanent blank screen) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A5 | Logout works | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A6 | Protected dashboard routes require auth when logged out | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| A7 | Second setup attempt is rejected | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## DASHBOARD

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| D1 | Overview loads meaningful content/empty-state | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| D2 | Mobile (~375px): navigation usable (drawer/portal) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| D3 | Tablet (~768px): navigation usable | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| D4 | Desktop: sidebar navigation usable | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| D5 | Dark / light theme toggle behaves | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## API KEYS

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| K1 | Create scoped API key | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K2 | Secret shown once / copy works | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K3 | List shows metadata, not raw secret again | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K4 | Request without `x-api-key` rejected (e.g. 401) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K5 | Request with wrong/missing scope rejected | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K6 | Revoke key succeeds | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| K7 | Revoked key rejected on API | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## PLAYGROUND

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| P1 | Can select cache-only / non-paid path | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| P2 | Facebook username input accepted (e.g. `cern`) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| P3 | Instagram username input accepted (e.g. `nasa`) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| P4 | Missing-cache message is clear (not a fake scrape crash) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| P5 | No evidence of paid Apify execution | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## CACHE

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| C1 | Empty-state behavior is understandable | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| C2 | Platform filter works (or disabled clearly when empty) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| C3 | Freshness filter works (or disabled clearly when empty) | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## OPERATIONS

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| O1 | Usage & Logs page loads | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| O2 | Settings page loads | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| O3 | Quota-disabled / daily limit `0` state is visible or consistent | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| O4 | API Documentation reachable | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## PERSISTENCE

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| R1 | `docker compose … down` then `up -d` (no `-v`) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| R2 | Same administrator can still log in | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| R3 | API keys / settings still present | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| R4 | Did **not** run destructive volume cleanup | ☐ PASS ☐ FAIL ☐ BLOCKED | |

---

## SECURITY

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| S1 | No secrets in UI responses, screenshots, or shared logs | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| S2 | No unexpected paid Apify attempts (token empty + limit 0) | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| S3 | Unauthenticated users cannot reach admin management APIs | ☐ PASS ☐ FAIL ☐ BLOCKED | |
| S4 | Security findings reported privately per `SECURITY.md` | ☐ N/A ☐ DONE | |

---

## Overall

| Verdict | ☐ Ready to recommend invite ☐ Needs fixes ☐ Blocked |
| --- | --- |
| Highest severity found | ☐ none ☐ LOW ☐ MEDIUM ☐ HIGH ☐ BLOCKER |
| Would install again? | ☐ Yes ☐ No |
