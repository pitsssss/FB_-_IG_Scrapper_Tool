# ADR-001: Next.js framework choice

**Status:** Accepted (design)  
**Phase:** 7A

## Decision

Use **Next.js (App Router) + React + TypeScript** for the administrator dashboard under `apps/dashboard/`.

## Context

The product needs a secure, responsive management UI, API playground, and documentation surface. The existing backend is a zero-dependency Node HTTP API for posts. Repository already documents a consumer example at `examples/nextjs-app-router/` (integration client, not this dashboard).

## Alternatives

| Option | Tradeoff |
| --- | --- |
| Plain React SPA (Vite) | Weaker defaults for server-side secrets; more custom BFF work |
| Remix | Strong; less alignment with existing Next examples/ecosystem docs |
| Server-rendered templates in Node | Slower UI velocity; couples UI to API process |
| No UI (env-only) | Fails product vision |

## Tradeoffs

- Adds a second Node app and dependencies (dashboard only).
- Must discipline `NEXT_PUBLIC_*` and Server Actions so secrets stay server-side.
- Prefer stable Next release lines; avoid canary unless a hard requirement appears.

## Security implications

Server Components / Route Handlers / Server Actions may hold server env — never expose Apify token or API key hashes to the client bundle. Prefer calling the API admin surface over embedding scrape logic in Next.

## Migration path

Dashboard can evolve independently; posts API remains authoritative. If Next is later replaced, admin HTTP API remains the stable management contract.
