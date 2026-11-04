# ADR-002: Preserve existing Node.js posts API

**Status:** Accepted  
**Phase:** 7A

## Decision

Keep `src/` as the sole implementation of Facebook/Instagram posts fetching, normalization, cache, quota, and public routes. Do not reimplement scraping inside Next.js.

## Context

Verified modules: `server.js`, `service.js`, providers, `cache.js`, `apifyQuota.js`, username parsers, Postman/CI coverage. Public contract is a stability commitment (project rules).

## Alternatives

| Option | Why rejected |
| --- | --- |
| Move providers into Next Route Handlers | Duplicate quota/cache; break Postman parity |
| Rewrite in another framework | High risk, no product need |
| Microservice split for scrape workers | Premature for single-instance self-host |

## Tradeoffs

- Management features must extend the API process (or a tightly coupled companion) rather than living only in Next.
- Two packages to build/test — acceptable.

## Security implications

Centralizes secret use and quota enforcement in one place. Dashboard becomes a client of admin APIs, reducing accidental browser-side Apify calls.

## Migration path

Add `/api/v1/admin/*` beside existing routes. Public posts paths remain unchanged.
