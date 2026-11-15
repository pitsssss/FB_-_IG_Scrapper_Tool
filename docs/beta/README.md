# Pre-release external testing instructions

Trusted-tester materials for **controlled, self-hosted** validation. There is **no public hosted beta** and **no published product release** yet. Testers build from source with Docker Compose on their own machines.

| Expectation | Detail |
| --- | --- |
| Hosting | Self-hosted on the tester’s computer (loopback `http://127.0.0.1:8080`) |
| Images | Build from source — do not assume published GHCR images |
| Credentials | Each tester creates their own administrator and API keys |
| Apify | No real Apify token required for this phase |
| Cache | Empty cache / cache-miss responses are **expected** after a fresh install |
| Live scraping | Intentionally disabled (`APIFY_DAILY_RUN_LIMIT=0`) |

| Document | Purpose |
| --- | --- |
| [TESTER_INSTALLATION_GUIDE.md](./TESTER_INSTALLATION_GUIDE.md) | Clone → init → cost-safe defaults → Compose → admin → API key |
| [TESTER_CHECKLIST.md](./TESTER_CHECKLIST.md) | PASS / FAIL / BLOCKED acceptance matrix |
| [FEEDBACK_TEMPLATE.md](./FEEDBACK_TEMPLATE.md) | Bug / UX report form (no secrets) |
| [EXIT_CRITERIA.md](./EXIT_CRITERIA.md) | When external results count as pass |
| [REMOTE_STAGING_OPTIONAL.md](./REMOTE_STAGING_OPTIONAL.md) | Optional VPS plan — not provisioned |

Helper scripts (repo root):

- `scripts/init-selfhost.ps1` / `scripts/init-selfhost.sh`
- `scripts/apply-beta-safe-defaults.ps1 -Confirm` / `scripts/apply-beta-safe-defaults.sh --confirm`

Invitation of testers is an owner decision. Do not treat these docs as a public launch announcement.
