# Social Media Posts API — Dashboard

Next.js App Router administrator UI for the self-hosted Social Media Posts API.

**Phase 7C.1:** Real administrator setup, login, server-side sessions, CSRF, and route protection are implemented. Apify token management and API key CRUD remain Phase 7C.2.

## Versions

| Package | Version |
| --- | --- |
| Next.js | 16.4.5 |
| React | 19.3.0 |
| TypeScript | 5.x (strict) |
| Tailwind CSS | 4.x |

## Prerequisites

- Node.js **≥ 22.5** (API uses built-in `node:sqlite`)
- Running posts API with management auth configured
- Matching `ADMIN_INTERNAL_SECRET` on API and dashboard

## Install

```bash
cd apps/dashboard
npm install
cp .env.example .env.local
```

`.env.local` (server-only — never `NEXT_PUBLIC_` for secrets):

```bash
API_INTERNAL_URL=http://127.0.0.1:3000
ADMIN_INTERNAL_SECRET=<same-as-api>
```

## First-time administrator setup

1. On the API host, generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

2. Set on the **API**:

```bash
BOOTSTRAP_SETUP_TOKEN=<token>
ADMIN_INTERNAL_SECRET=<shared>
ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:3001
MANAGEMENT_DIR=./data/management
```

3. Set the same `ADMIN_INTERNAL_SECRET` and `API_INTERNAL_URL` on the dashboard.

4. Start API, then dashboard (`npm run dev`).

5. Open `/setup`, enter the bootstrap token, username, and password (≥12 characters).

6. After success you are signed in. Setup cannot be repeated; restart does not reopen it.

## Login / logout

- `/login` — username + password
- Sign out — header button calls `POST /api/auth/logout` (revokes server session)
- Sessions: HttpOnly cookie `smp_admin_session`, CSRF cookie `smp_admin_csrf`, absolute 12h / idle 2h

## Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```

## Routes

| Path | Access |
| --- | --- |
| `/setup`, `/login` | Public (auth pages) |
| `/overview`, `/playground`, … | Authenticated admin only |
| `/api/auth/*` | Same-origin BFF to API `/api/v1/admin/*` |

Unauthenticated visitors are redirected to `/login` (middleware + server `requireAdmin`).

## Architecture

- Browser talks only to Next.js same-origin `/api/auth/*`.
- BFF uses `API_INTERNAL_URL` + `ADMIN_INTERNAL_SECRET` (never exposed to the browser).
- API owns SQLite sessions; dashboard sets cookies on its origin.
- Public `x-api-key` posts API remains completely separate.

## Recovery

Password reset requires **host access** (not HTTP):

```bash
# from repository root
npm run admin:recover -- --password 'new-strong-password'
```

Revokes all sessions. Does not delete caches or Apify quota.

## Security notes

- HTTPS in production; set `ADMIN_COOKIE_SECURE=1` behind TLS.
- Configure reverse proxy carefully; set `TRUST_PROXY=1` only when the proxy strips client spoofing of `X-Forwarded-For`.
- No public password-reset endpoint.
- Management features for Apify / API keys are not available yet (7C.2).

## Known unfinished (7C.2+)

- Encrypted Apify token storage / connect UI
- API key CRUD
- Live playground refresh
- Cache purge / quota reset controls
- Docker Compose multi-service topology (7E)
