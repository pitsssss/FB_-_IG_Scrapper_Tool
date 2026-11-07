# Social Media Posts API — Dashboard

Next.js App Router administrator UI for the self-hosted Social Media Posts API.

**Phases 7C.1B / 7C.2:** Email administrator setup/login, optional SMTP verification, TOTP MFA, Apify provider connection, managed API keys, and read-only cache/quota inspection.

## Prerequisites

- Node.js **≥ 22.5** on the API host
- Running posts API with management auth
- `DATA_ENCRYPTION_KEY` on the API (provider credentials + TOTP secrets)
- Matching `ADMIN_INTERNAL_SECRET` on API and dashboard
- Optional `SMTP_*` on the API for email verification OTPs (not required)

## Install

```bash
cd apps/dashboard
npm install
cp .env.example .env.local
```

```bash
API_INTERNAL_URL=http://127.0.0.1:3000
ADMIN_INTERNAL_SECRET=<same-as-api>
```

## Operator flows

### Create administrator / sign in

1. Set `BOOTSTRAP_SETUP_TOKEN` on the API → open `/setup` → email + password + token.
2. Sign in at `/login` with email (or legacy username).
3. If MFA is enabled, complete `/mfa` before the dashboard unlocks.
4. Manage email, authenticator MFA, recovery codes, and password under **Settings**.

### Connect Apify

1. Set `DATA_ENCRYPTION_KEY` on the **API** (base64 32 bytes).
2. Open **Providers** → paste token → **Verify** (optional) → **Connect**.
3. Token is validated via Apify `users/me`, encrypted, and activated without restart.
4. **Disconnect** clears the managed credential and **does not** silently fall back to `APIFY_TOKEN`.

### API keys

1. Open **API Keys** → **Create key**.
2. Choose client name + Facebook/Instagram usernames (deny-by-default).
3. Copy the secret once from the warning banner.
4. Rotate / revoke / edit scopes as needed — changes apply immediately.

Environment `API_KEYS` appear as read-only rows.

### Cache & usage

- **Cache** lists metadata only (no purge in this phase).
- **Usage** shows local attempt budget — not Apify dollar spend.

## Recovery

Password recovery remains host-only: `npm run admin:recover` on the API (interactive password preferred). Host recovery also clears TOTP MFA and recovery codes so the operator can regain access.

Encryption key loss: encrypted Apify tokens and TOTP secrets cannot be recovered — reconnect Apify and re-enroll MFA after restoring/setting `DATA_ENCRYPTION_KEY`.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
```

## Playground (7D.1)

1. Open **API Playground** while signed in (full MFA session).
2. **Cache only** (default): Read Cache — never contacts providers or reserves quota.
3. **Live refresh**: Prepare → review local quota → Confirm or Cancel.
   - Confirmation tokens are single-use, short-lived, and bound to the admin session + username/limit.
   - Cancel makes zero provider calls.
4. Results: Visual preview, Raw JSON, Request details, Response metadata (LIVE / CACHE / STALE CACHE).

## Settings, cache & usage (7D.2)

- **Settings:** allowlists, fresh TTL, enrichment, daily attempt limit (≤ env ceiling), warm lists (restart required).
- **Cache:** list/filter + single-entry delete with password confirmation (no purge-all, no quota reset).
- **Usage:** local telemetry for today / 7d / 30d — distinguishes cache hits from provider attempts.

## Docker (Phase 7E)

Prefer the root Compose stack (Caddy + API + this dashboard). See [`docs/SELF_HOSTING_GUIDE.md`](../../docs/SELF_HOSTING_GUIDE.md).

```bash
# from repo root
npm run secrets:generate
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
# http://127.0.0.1:8080
```

Runtime (injected by Compose): `API_INTERNAL_URL=http://api:3000`, `ADMIN_INTERNAL_SECRET`, `PORT=3001`. No secrets in `NEXT_PUBLIC_*`.

## Known unfinished

- Cache purge-all and manual quota reset (intentionally unavailable)
- Live public HTTPS certificate acceptance on a real domain (operator / Phase 7F)
- Open-source license choice (owner)
