# External beta — Feedback template

Copy this file (or paste into email / private channel) **once per issue**.
Do **not** attach passwords, API keys, Apify tokens, session cookies, MFA codes, or unredacted `.env` files.

---

## Tester metadata

| Field | Value |
| --- | --- |
| Anonymous tester identifier | e.g. `beta-T2` |
| Operating system | e.g. Windows 11 23H2 / macOS 14 / Ubuntu 22.04 |
| Docker version | Client + Server from `docker version` |
| Browser and version | e.g. Edge 131 |
| Tested Git commit | output of `git rev-parse HEAD` |
| Installation outcome | ☐ Success ☐ Partial ☐ Failed |

---

## Features tested

List areas covered (checkboxes ok):

- [ ] Installation / Compose
- [ ] Admin setup / login / logout
- [ ] Overview / responsive nav / themes
- [ ] API keys
- [ ] Public API auth
- [ ] Playground (cache-only)
- [ ] Cache UI
- [ ] Usage & Logs / Settings / Docs
- [ ] Restart persistence

---

## Bug / observation

**Title:** _(short)_

**Severity:**

| Level | Meaning |
| --- | --- |
| **BLOCKER** | Cannot install or use essential features |
| **HIGH** | Core feature broken or serious security issue |
| **MEDIUM** | Incorrect behavior with a workaround |
| **LOW** | Minor UX or documentation issue |

**Severity chosen:** ☐ BLOCKER ☐ HIGH ☐ MEDIUM ☐ LOW

**Description:**

**Reproduction steps:**

1.
2.
3.

**Expected result:**

**Actual result:**

---

## Evidence (sanitized)

Attach **only** redacted screenshots or log snippets.

### Redaction rules

Before sharing logs or screenshots:

1. Remove lines containing `BOOTSTRAP_SETUP_TOKEN`, `ADMIN_INTERNAL_SECRET`, `DATA_ENCRYPTION_KEY`, `APIFY_TOKEN`, `API_KEYS`, `x-api-key`, cookies, `Set-Cookie`, CSRF tokens, passwords.
2. Replace secrets with `[REDACTED]`.
3. Crop screenshots so tokens and emails you care about are not visible (or blur them).
4. Do not upload your entire `.env`.
5. Prefer `docker compose … logs --tail 80` excerpts over full dumps.

**Screenshot / log notes:**

---

## Improvement suggestions

_(UX wording, docs clarity, missing empty-states, etc.)_

---

## Security vulnerabilities

If you believe you found a security issue (auth bypass, secret leak, RCE, privilege escalation):

1. **Do not** open a public GitHub Issue.
2. Follow **`SECURITY.md`** — report via [GitHub Security Advisories](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/security/advisories).
3. Include commit SHA and local disposable repro only.

---

## Cache-only reminder

Missing posts for `cern` / `nasa` on a fresh install with `APIFY_DAILY_RUN_LIMIT=0` is **expected**. Describe the UI message quality; do not file it as “scraper broken” unless a paid run was explicitly approved and configured.
