# Optional remote staging plan (not provisioned)

For trusted testers who **cannot** install Docker locally.
**Status:** documentation only. **No host was provisioned. No public URL. No purchase.**

Ask the owner for a **separate deployment approval** before any hosting action.

---

## Architecture (proposed)

```text
Trusted tester browser
        │ HTTPS
        ▼
  Small VPS / cloud VM (isolated)
        ├── Caddy (TLS termination, production Compose)
        ├── api (single replica)
        └── dashboard
             └── named volumes: api_data, caddy_data (fresh — never owner volumes)
```

## Prerequisites

| Item | Requirement |
| --- | --- |
| Host | Fresh Ubuntu LTS (or similar) with Docker Engine + Compose v2 |
| DNS | A/AAAA for a test-only hostname you control |
| Ports | 80 + 443 reachable from the internet (or VPN-restricted) |
| Secrets | Brand-new `.env` via `init-selfhost` + beta safe defaults **or** production cookie/TLS settings |
| Admin | New administrator created on that host only |
| Access | Limit to named testers (firewall allowlist, VPN, or short-lived IP rules) |

## Environment differences vs local beta

| Variable | Local beta | Remote staging |
| --- | --- | --- |
| Compose files | `docker-compose.yml` + `docker-compose.local.yml` | `docker-compose.yml` only |
| URL | `http://127.0.0.1:8080` | `https://<test-domain>` |
| `API_DOMAIN` | `localhost` | `<test-domain>` |
| `ADMIN_ALLOWED_ORIGINS` | `http://127.0.0.1:8080` | `https://<test-domain>` |
| `ADMIN_COOKIE_SECURE` | `0` | `1` |
| `TRUST_PROXY` | `1` | `1` |
| `APIFY_DAILY_RUN_LIMIT` | `0` | `0` (same cost-safe rule) |

## Cost / sizing (estimates only)

| Resource | Typical starting point |
| --- | --- |
| vCPU / RAM | 1–2 vCPU, 2–4 GB RAM |
| Disk | 20–40 GB |
| Transfer | Low for 2–3 testers |
| Money | Provider hourly/monthly rates apply — **owner must approve spend** |

## Safe ops

1. Fresh clone on the VM — never copy owner `.env` or volumes.
2. Apply beta safe defaults (`APIFY_DAILY_RUN_LIMIT=0`, empty warm lists, enrichment off).
3. Create a **test-only** administrator.
4. Back up management data before experiments (`docs/BACKUP_RESTORE.md`).
5. Tear down with explicit approval; prefer `docker compose down` without `-v` until data is expendable.
6. When finished, rotate any exposed tokens and delete the VM.

## Hard prohibitions

- Do not expose the owner’s localhost tunnel
- Do not reuse owner Apify token, API keys, cookies, or MFA
- Do not publish a shared “demo” password in the public repo
- Do not enable paid Apify runs without explicit opt-in

## Approval checkpoint

Before provisioning: owner confirms budget, domain, tester list, and destroy date. Until then, testers use the local Docker path in `TESTER_INSTALLATION_GUIDE.md`.
