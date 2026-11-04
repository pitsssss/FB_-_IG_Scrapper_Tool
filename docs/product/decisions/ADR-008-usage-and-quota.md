# ADR-008: Local usage tracking vs Apify quota

**Status:** Accepted (design)  
**Phase:** 7A

## Decision

- **Keep** existing filesystem Apify **attempt** budget (`apify-quota.json`, shared FB+IG, UTC day, fail-closed) as the cost-control mechanism for provider calls.
- **Add** separate **local usage/audit events** for the dashboard (request counts, cache hits, login events, admin actions).
- UI must **not** label local counters as Apify USD spend or wallet balance.
- Playground live refresh must call the same `reserve()` path; never bypass quota for convenience.

## Context

`src/apifyQuota.js` documents operational attempt limits, not financial guarantees. `APIFY_MAX_CHARGE_USD_PER_RUN` is a per-run cap query param when set. Quota is single-process only.

## Alternatives

| Option | Verdict |
| --- | --- |
| Replace quota with Apify billing API polling | Fragile; not source of truth for local enforcement |
| Bypass quota for admin playground | Rejected — surprise bills |
| Multi-replica Redis quota | Defer until needed |

## Tradeoffs

- Two metrics systems to explain in UI (local attempts vs local HTTP stats).
- Admins may still incur Apify cost nuances not visible locally (partial runs, Actor pricing changes).

## Security implications

Threat items 11–12. Explicit confirm for paid paths; show remaining local budget before live refresh.

## Migration path

Shared transactional quota store can replace file later without changing dashboard semantics (still “local attempt budget”).
