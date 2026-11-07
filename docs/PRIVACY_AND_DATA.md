# Privacy and local data handling

Self-hosted deployments store data on the operator’s volume. This is intentional.

## What is stored

| Location | Contents |
| --- | --- |
| `/data/cache` | Cached public post JSON, Instagram profile metadata, `apify-quota.json` (local attempt counters) |
| `/data/management` | SQLite: admin email/password hash, sessions, MFA secrets (encrypted), recovery code hashes, API key hashes + metadata, encrypted Apify token, settings, audit/usage events |
| `.env` (host) | Bootstrap/BFF/encryption secrets, optional SMTP and legacy env keys |
| Browser cookies | `smp_admin_session` (HttpOnly), `smp_admin_csrf` |

Cached social posts are **copies of public provider responses**. Retention follows cache TTL and manual cache delete; there is no automatic GDPR erasure workflow beyond operator-controlled delete/backup rotation.

## What is not claimed

- We do not claim “no data is stored.”
- Local Usage metrics are **not** Apify invoices.
- Operators remain responsible for lawful processing, platform/provider terms, and retention policies.

## Screenshots and public docs

Use only neutral demo accounts (`cern`, `nasa`) in public materials. Never publish admin emails, tokens, or customer account lists.
