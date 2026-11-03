# Production checklist (pre-deployment)

This document is an operational checklist. Passing local tests does **not** by itself prove production readiness.

## Secrets

- [ ] `API_KEYS` — unique long random secrets per site (e.g. 48 hex chars)
- [ ] Rotate keys by adding a new `name:secret`, deploying, then removing the old secret
- [ ] `APIFY_TOKEN` injected at runtime (never baked into images or Git)
- [ ] Optional `GRAPH_PAGE_TOKENS` only for pages you manage
- [ ] No secrets in `NEXT_PUBLIC_*`, HTML, mobile apps, or client bundles

## Authorization

- [ ] `API_KEY_PAGE_SCOPES` configured for multi-site deployments (may mix Facebook + Instagram URLs)
- [ ] Every `API_KEYS` name has an explicit scopes array when scopes mode is enabled
- [ ] Global `ALLOWED_PAGES` reviewed (Facebook only)
- [ ] Optional `INSTAGRAM_ALLOWED_PROFILES` reviewed
- [ ] Canonical-key limitation understood (FB slug ≠ numeric id; IG keys are `instagram:<user>`)

## CORS

- [ ] Prefer empty `ALLOWED_ORIGINS` (server-to-server)
- [ ] If browsers must call the API directly, list exact origins (CORS ≠ auth)

## Networking

- [ ] Public HTTPS URL (reverse proxy / platform TLS)
- [ ] Healthcheck: `GET /health`
- [ ] Client timeouts ≥ worst-case live scrape latency for cold pages

## Persistence (required)

- [ ] Durable volume for `CACHE_DIR` (posts + `apify-quota.json`)
- [ ] Directory writable by the runtime user
- [ ] **Single API replica/worker** while quota is filesystem-based
- [ ] Backup/restore plan for `CACHE_DIR`

If disk writes fail, the process may still serve from memory until restart; those entries can be lost on restart.

## Apify controls

- [ ] `APIFY_DAILY_RUN_LIMIT` set as an operational attempt budget across **both** FB + IG Actors
- [ ] Optional `APIFY_MAX_CHARGE_USD_PER_RUN` (applies per run for either Actor)
- [ ] `INSTAGRAM_APIFY_ACTOR` / input keep `dataDetailLevel=basicData` unless enrichment is approved
- [ ] `npm run quota:status` known to operators
- [ ] `APIFY_DAILY_RUN_LIMIT=0` understood as cache-only mode

## Cache warming

- [ ] `WARM_PAGES` only for owned/approved Facebook pages
- [ ] `INSTAGRAM_WARM_PROFILES` only for owned/approved Instagram profiles
- [ ] Interval/concurrency sized so fresh TTL usually yields skipped-fresh
- [ ] Warm targets also allowed by scopes / `ALLOWED_PAGES` / `INSTAGRAM_ALLOWED_PROFILES`

## Upstream outage behavior

- Cached pages continue via `cache` / `stale-cache`
- Uncached pages return `502 UPSTREAM_UNAVAILABLE`
- Empty/failed refreshes never wipe good cache

## Process lifecycle

- [ ] Start: `node src/index.js` (or `npm run start:prod`) with env injected
- [ ] `PORT` / `HOST` honored (platforms may inject `PORT`)
- [ ] SIGTERM/SIGINT stop warmer then HTTP server

## Logging / troubleshooting

- [ ] Confirm API keys and tokens never appear in logs
- [ ] Upstream errors are generic to clients
- [ ] Use `/health` for liveness only — it does **not** prove Apify or disk health

## Rollback

- [ ] Keep previous container image / release
- [ ] Preserve volume across rollbacks
- [ ] Revert app release without deleting `CACHE_DIR`

## Acceptance criteria (before go-live)

- [ ] `npm test` and `npm run e2e` green on the release commit
- [ ] Scoped client A/B authorization verified against staging
- [ ] Volume mount verified with a write + restart cache hit
- [ ] Quota file survives restart
- [ ] No horizontal replicas until shared quota exists

## Optional: Railway notes

- Railway injects `PORT` — bind `HOST=0.0.0.0`.
- Attach a volume (e.g. mount path `/data`) and set `CACHE_DIR=/data/cache`.
- This image runs as non-root `USER node` (uid 1000). Railway volumes are typically
  **root-owned** at runtime; without a writable mount the cache/quota cannot persist.
  Set `RAILWAY_RUN_UID=0` so the process can write the attached volume, **or** use an
  equivalent platform-supported ownership fix. Prefer documenting this over baking a
  permanent root-only app image. Re-check current Railway volume docs at deploy time:
  https://docs.railway.com/volumes
- Volume-backed services may incur brief redeploy downtime; plan accordingly.
- Do not enable multiple replicas with filesystem-only Apify quota.
- A green `/health` check is not proof of upstream or volume durability.
- Safe first staging profile: single replica, volume attached, `WARM_PAGES` empty,
  `APIFY_DAILY_RUN_LIMIT=0` (cache-only) until a controlled live Apify budget is approved.

## Still NOT proven by this repository alone

- Live Apify spend / actor reliability in production
- **Live Instagram Actor response capture / profile-photo coverage / paid-run cost**
- Live hosting/CDN/TLS configuration
- Multi-region failover
- Long-term disk integrity under platform outages
