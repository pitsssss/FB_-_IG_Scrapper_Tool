# Invited-tester materials (historical)

Materials prepared for a **controlled, invited** self-hosted tester program.

| Status | Detail |
| --- | --- |
| Public GitHub Pre-release | **Published:** [v0.1.0-beta.1](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/releases/tag/v0.1.0-beta.1) |
| Tester invitations | **Not sent** — owner skipped the invitation step ([exception](../release/BETA_PUBLICATION_EXCEPTION.md)) |
| Hosted SaaS demo | None |

These guides remain useful for anyone who wants a cost-safe local install (`APIFY_DAILY_RUN_LIMIT=0`, empty token). Prefer the main [README](../../README.md) and [SELF_HOSTING_GUIDE](../SELF_HOSTING_GUIDE.md) for current public install paths (including published GHCR images).

| Expectation (local tester path) | Detail |
| --- | --- |
| Hosting | Self-hosted on the tester’s computer (loopback `http://127.0.0.1:8080`) |
| Source install | Build with Compose local overlay, or use published images for production HTTPS |
| Credentials | Each operator creates their own administrator and API keys |
| Apify | No real Apify token required for a cache-only first boot |
| Cache | Empty cache / cache-miss responses are **expected** after a fresh install |
| Live scraping | Keep disabled until you explicitly opt in (`APIFY_DAILY_RUN_LIMIT=0`) |

| Document | Purpose |
| --- | --- |
| [TESTER_INSTALLATION_GUIDE.md](./TESTER_INSTALLATION_GUIDE.md) | Clone → init → cost-safe defaults → Compose → admin → API key |
| [TESTER_CHECKLIST.md](./TESTER_CHECKLIST.md) | PASS / FAIL / BLOCKED acceptance matrix |
| [FEEDBACK_TEMPLATE.md](./FEEDBACK_TEMPLATE.md) | Bug / UX report form (no secrets) |
| [EXIT_CRITERIA.md](./EXIT_CRITERIA.md) | When invited-tester results would count as pass |
| [REMOTE_STAGING_OPTIONAL.md](./REMOTE_STAGING_OPTIONAL.md) | Optional VPS plan — not provisioned |

Helper scripts (repo root):

- `scripts/init-selfhost.ps1` / `scripts/init-selfhost.sh`
- `scripts/apply-beta-safe-defaults.ps1 -Confirm` / `scripts/apply-beta-safe-defaults.sh --confirm`
