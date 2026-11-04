# Product design — Self-Hosted Developer Platform

Planning documents for evolving **Social Media Posts API** into a secure, self-hosted developer platform with a Next.js dashboard.

**Status:** Design only (Step 7A). No dashboard implementation in this phase.

## Documents

| Document | Purpose |
| --- | --- |
| [SELF_HOSTED_ARCHITECTURE.md](./SELF_HOSTED_ARCHITECTURE.md) | Current vs target architecture, boundaries, flows |
| [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) | Bootstrap, auth, secrets, threat model |
| [DASHBOARD_REQUIREMENTS.md](./DASHBOARD_REQUIREMENTS.md) | Screens, journeys, acceptance criteria |
| [STORAGE_AND_CONFIG_DESIGN.md](./STORAGE_AND_CONFIG_DESIGN.md) | Persistence, encryption, migration |
| [DEPLOYMENT_DESIGN.md](./DEPLOYMENT_DESIGN.md) | Docker Compose, proxy, volumes |
| [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) | Phases 7B–7F |

## Architecture Decision Records

| ADR | Topic |
| --- | --- |
| [ADR-001](./decisions/ADR-001-nextjs.md) | Next.js framework choice |
| [ADR-002](./decisions/ADR-002-backend-preservation.md) | Preserve Node.js posts API |
| [ADR-003](./decisions/ADR-003-admin-auth.md) | Admin authentication |
| [ADR-004](./decisions/ADR-004-apify-token.md) | Apify token persistence |
| [ADR-005](./decisions/ADR-005-api-keys.md) | API key lifecycle |
| [ADR-006](./decisions/ADR-006-management-storage.md) | Management storage |
| [ADR-007](./decisions/ADR-007-docker-topology.md) | Docker topology |
| [ADR-008](./decisions/ADR-008-usage-and-quota.md) | Usage tracking vs Apify quota |

## Non-goals (confirmed)

- Hosted multi-tenant SaaS
- Public registration / social login
- Billing / shared Apify accounts
- Changing public posts response schema
- Rewriting Git history for past privacy exposure

## Baseline evidence (Step 7A)

- Commit inspected at authoring: see git history at merge time of this docs commit.
- Public posts API: `GET /api/v1/facebook/posts`, `GET /api/v1/instagram/posts` with `page=<username>`, `x-api-key`.
- Zero runtime npm dependencies today; config via env; file cache + filesystem Apify quota; single-replica Docker Compose + Caddy.
- **LICENSE file:** absent at Step 7A (owner must choose a license separately).
