# Social Media Posts API — Dashboard (Phase 7B)

Next.js App Router foundation for the self-hosted administrator UI.

**Not safe for public deployment.** There is no admin authentication yet (Phase 7C). Production builds fail closed unless you are in local development with an explicit server-side preview flag.

## Versions

| Package | Version |
| --- | --- |
| Next.js | 16.4.5 |
| React | 19.3.0 |
| TypeScript | 5.x (strict) |
| Tailwind CSS | 4.x |
| Lucide React | 1.x |
| Vitest | 3.2.x |

shadcn-style primitives are hand-rolled with `class-variance-authority`, `clsx`, and `tailwind-merge` (no full shadcn CLI dependency). React Hook Form / Zod were not required for 7B disabled forms.

## Install

```bash
cd apps/dashboard
npm install
cp .env.example .env.local
```

`.env.local` (server-only):

```bash
DASHBOARD_DEV_PREVIEW=1
API_INTERNAL_URL=http://127.0.0.1:3000
```

Never use `NEXT_PUBLIC_` for preview flags, API keys, or tokens.

## Commands

```bash
npm run dev        # local preview (requires DASHBOARD_DEV_PREVIEW=1)
npm run build      # production build (UI locked)
npm run start      # serve production build (locked)
npm run lint
npm run typecheck
npm run test
```

From repository root (optional convenience):

```bash
npm run dashboard:dev
npm run dashboard:build
npm run dashboard:test
```

## Routes

| Path | Purpose |
| --- | --- |
| `/overview` | Status placeholders + optional `/health` probe |
| `/playground` | Request builder UI (Send disabled) |
| `/api-keys` | Key management foundation |
| `/providers` | Apify / Graph / enrichment cards |
| `/cache` | Cache table empty state |
| `/usage` | Usage & logs empty state |
| `/settings` | Settings sections (save disabled) |
| `/docs` | Public API documentation + copyable examples |
| `/setup` | Setup visual foundation (disabled) |
| `/login` | Login visual foundation (disabled) |

## Architecture

- **Server Components** by default for pages.
- **Client Components** for theme toggle, mobile nav, playground interactions, copy buttons.
- **Server-only** modules: `lib/config/preview.ts`, `lib/config/env.ts`, `lib/api/client.ts`.
- Posts scraping stays in the existing Node API (`src/`). This app does not reimplement providers.

## Theme

CSS variables for light/dark surfaces, teal accent, success/warning/danger. `next-themes` with `class` strategy, system preference default, manual toggle, `suppressHydrationWarning` on `<html>`.

## Security (7B)

1. Preview requires `NODE_ENV=development` **and** `DASHBOARD_DEV_PREVIEW=1`.
2. Production always shows the locked screen — even if the preview env var is set.
3. No fake login, demo passwords, or mock session cookies.
4. No Apify token fields that submit data.
5. No paid scrape execution from the UI.
6. Optional `API_INTERNAL_URL` health check is not admin auth.

## Known unfinished (7C+)

- Admin bootstrap, sessions, CSRF
- Encrypted Apify token storage
- API key CRUD
- Management API + playground execution
- Docker Compose dashboard service (7E)

## Continue to 7C

Implement management persistence and `/api/v1/admin/*` on the Node API, then replace the preview gate with real session auth while keeping this UI shell.
