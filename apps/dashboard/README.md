# Social Media Posts API — Dashboard

Next.js App Router administrator UI for the self-hosted Social Media Posts API.

**Phase 7C.2:** Apify provider connection, managed API keys, and read-only cache/quota inspection are wired to the authenticated management API.

## Prerequisites

- Node.js **≥ 22.5** on the API host
- Running posts API with management auth + `DATA_ENCRYPTION_KEY` (for provider save)
- Matching `ADMIN_INTERNAL_SECRET` on API and dashboard

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

Password recovery remains host-only: `npm run admin:recover` on the API.

Encryption key loss: encrypted Apify tokens cannot be recovered — reconnect with a new token after restoring/setting `DATA_ENCRYPTION_KEY`.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
```

## Known unfinished (7D)

- Live playground / paid refresh confirmation
- Cache purge / quota reset controls
- Full settings editor
- Docker Compose multi-service topology
