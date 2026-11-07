# Implementation roadmap

**Phase:** 7A complete when these docs land and offline tests still pass.  
**Rule:** Each later phase must keep public posts contract stable and run `npm test` (plus relevant suites).

---

## Phase overview

```mermaid
flowchart LR
  A[7A Design] --> B[7B Dashboard foundation]
  B --> C[7C Backend management]
  C --> D[7D Complete workflows]
  D --> E[7E Docker + QA]
  E --> F[7F Public release hardening]
```

Dependencies are hard unless noted. No calendar estimates.

---

## 7A — Product architecture & security design *(this phase)*

**Deliverables:** Docs under `docs/product/` + ADRs.  
**Must not:** Scaffold Next.js, change runtime, add deps, clear caches.  
**Acceptance:** Docs accurate vs repo; `npm test`, `npm run e2e`, `npm run postman:offline` pass; docs-only commit.

---

## 7B — Dashboard foundation

**Depends on:** 7A.  
**Status:** Implemented in `apps/dashboard` (Next.js 16.4.5). Phase 7C.1 replaced the preview gate with real session authentication. See `apps/dashboard/README.md`.

**Work**

- Create `apps/dashboard` Next.js App Router + TypeScript skeleton (no scrape logic).
- Pin stable versions of Tailwind / shadcn-style primitives / Lucide (RHF/Zod deferred — unused in 7B).
- App shell: nav, light/dark tokens, responsive layout, empty placeholders for screens.
- Server-only API client stub pointing at configurable `API_INTERNAL_URL`.
- ESLint/tsconfig; ensure no secrets in `NEXT_PUBLIC_*`.
- Root convenience scripts: `dashboard:dev`, `dashboard:build`, `dashboard:test`, etc.

**Acceptance**

- [x] `next build` succeeds for dashboard
- [x] Placeholder routes for Overview, Playground, Keys, Providers, Cache, Usage, Settings, Docs
- [x] Existing API package tests unchanged / still green
- [x] No runtime behavior change to posts API

**Risks:** Monorepo tooling sprawl — keep minimal.

---

## 7C — Backend management capabilities

**Depends on:** 7A; can parallelize lightly with 7B UI shell but needs API before real UI wiring.

### 7C.1 — Secure admin foundation (implemented)

**Work done**

- [x] Management SQLite (`node:sqlite`) + migrations under `MANAGEMENT_DIR`
- [x] `BOOTSTRAP_SETUP_TOKEN` one-time setup; scrypt password hashing
- [x] Server-side sessions, CSRF/origin checks, auth rate limits
- [x] `/api/v1/admin/*` (setup, login, logout, me, password, session)
- [x] Next.js BFF `/api/auth/*` + protected dashboard routes
- [x] Host-only recovery CLI (`npm run admin:recover`)
- [x] Security tests (`test/admin-auth.test.js`, `test/management-db.test.js`)

### 7C.1B — Email identity, OTP, TOTP MFA (implemented)

- [x] Additive management schema v3 (email, OTP, TOTP, recovery, session auth_level)
- [x] Email-based setup + legacy username login compatibility
- [x] Optional SMTP verification OTPs (fail closed when SMTP absent)
- [x] TOTP MFA + recovery codes; MFA-gated sessions before full admin access
- [x] Account security UI (Settings) + `/mfa` challenge
- [x] Interactive CLI recovery (MFA cleared on host reset)
- [x] Tests: `test/admin-auth-mfa.test.js`

### 7C.2 — Secrets & keys (implemented)

- [x] Encrypted Apify token save/validate/disconnect + runtime config holder
- [x] API key CRUD (hash at rest, one-time plaintext), scopes hot-reload
- [x] Read APIs: quota status, cache listing, health detail
- [x] Dual-read env + managed API keys; disconnect suppresses env Apify fallback
- [ ] Admin **force refresh** / playground live scrape (7D)
- [ ] Forced import of env keys into SQLite (optional; dual-read remains)

**Acceptance (7C.1 + 7C.1B + 7C.2)**

- [x] Setup takeover tests pass
- [x] Admin session cannot be used as `x-api-key`; API key cannot hit admin routes
- [x] Public posts contract tests still pass
- [x] Cache/quota files not wiped by migrations
- [x] Apify token never returned after save
- [x] MFA pending sessions cannot call management APIs
- [x] SMTP-absent deployments never claim email verification success

---

## 7D — Complete user workflows

**Depends on:** 7B + 7C.

**Work**

- Wire all dashboard screens to admin APIs.
- Playground visual + JSON + metadata; cache-only vs live confirm UX.
- XSS-safe rendering; CSP groundwork.
- Settings: allowlists, warm lists, TTL, enrichment toggle with warnings.
- In-app API documentation with neutral examples.
- Usage & logs views (local counters only).
- Cache purge with confirmations.

**Acceptance**

- [ ] Journeys J1–J3 from DASHBOARD_REQUIREMENTS succeed against fake upstream / cache-only
- [ ] Live refresh blocked or confirmed when quota exhausted
- [ ] Mobile nav usable for primary flows
- [ ] No fabricated “real” scrape data in UI

**Risks:** Accidental Apify calls in CI — keep fakes; gate live behind explicit scripts.

---

## 7E — Docker integration and QA

**Depends on:** 7D (MVP feature-complete).

**Work**

- Compose: `caddy` + `api` + `dashboard`; same-origin routes.
- Dashboard Dockerfile (standalone).
- Healthchecks; volume paths for management.
- Evolve docker smoke / add dashboard smoke (no real Apify).
- CI: build dashboard; keep matrix Node tests for API.
- Backup/restore doc dry-run.

**Acceptance**

- [ ] Criteria in DEPLOYMENT_DESIGN §14
- [ ] `postman:offline` + unit + e2e green
- [ ] Single-replica documented and enforced in compose comments

**Risks:** Cookie Secure flags on HTTP local vs HTTPS prod — document both.

---

## 7F — Public release hardening

**Depends on:** 7E.

**Work**

- README rewrite for self-hosted platform UX (compose-first).
- SECURITY.md reporting; CONTRIBUTING; **LICENSE choice (owner)**.
- Dependency update policy; secret scanning in CI.
- Privacy regression includes dashboard artifacts.
- Separate plan for historical Git exposure (no silent rewrite).
- Optional: Graph token UI, multi-admin — only if prioritized.

**Acceptance**

- [ ] Fresh clone → compose → setup → Apify connect → key create → playground documented
- [ ] LICENSE present (owner-selected)
- [ ] No private customer data in tracked files
- [ ] Threat mitigations for release checklist signed off

---

## Cross-cutting constraints (all phases)

1. Do not change public response field names/types without coordinated contract updates.
2. Never overwrite good cache with empty/failed upstream.
3. Never log or return secrets.
4. No paid Apify in default CI / `postman:offline`.
5. Neutral public examples only (`cern`, `nasa`).
6. Single API replica until shared quota exists.

---

## Open decisions (product owner)

| ID | Topic | Recommendation | Needs approval |
| --- | --- | --- | --- |
| O1 | OSS license | Do not auto-pick | **Yes** |
| O2 | Management storage driver | SQLite (`node:sqlite` or `better-sqlite3`) vs encrypted JSON interim | **Yes** if adding npm dep or bumping engines |
| O3 | Password KDF library | Argon2id via audited dep vs scrypt built-in | Prefer Argon2id with dep justification |
| O4 | Historical Git remediation | Separate approved rewrite or leave + document | **Yes** before any history rewrite |
| O5 | Env API key migration UX | Dual-read overlay vs forced import at first admin login | Confirm product preference |
| O6 | Force-refresh naming / API shape | Admin-only POST | Confirm before 7C freeze |

---

## Suggested sequencing note for implementers

Start 7B skeleton early for UI iteration, but **do not** call Apify from Next.js. Block playground “live” on 7C admin force-refresh + quota APIs. Treat 7E as the first time Compose is the primary happy path.
