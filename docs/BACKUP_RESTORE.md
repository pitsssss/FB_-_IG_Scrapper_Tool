# Backup and restore

Self-hosted deployments store durable state in the Docker volume mounted at `/data` on the **api** service:

| Path | Contents |
| --- | --- |
| `/data/cache` | Facebook/Instagram post cache, Instagram profile metadata, shared Apify quota file |
| `/data/management` | SQLite admin DB (sessions, MFA, API keys, encrypted Apify credentials, settings, audit/usage) |

## Encryption key escrow

`DATA_ENCRYPTION_KEY` encrypts provider credentials at rest.

- Back it up **separately** from the SQLite dump (password manager / sealed secret store).
- Never put the key in the same unencrypted archive as the database by default.
- Losing the key permanently prevents decrypting stored Apify tokens (API keys metadata and cache remain readable).

## Consistent SQLite backup

While the API is running, SQLite may use WAL (`app.sqlite-wal`, `app.sqlite-shm`). Copying only `app.sqlite` mid-write can produce a corrupt snapshot.

### Recommended: Node backup helper

```bash
# Prefer stopping the API first when WAL files may exist.
docker compose stop api   # or: docker compose -f docker-compose.yml -f docker-compose.local.yml stop api

# From the repo (host Node ≥ 22), pointing at a local copy of MANAGEMENT_DIR or a volume extract:
npm run backup:management -- --management-dir ./data/management --out ./backups

# Restore into an isolated directory (refuses overwrite unless --force):
npm run backup:management -- --restore ./backups/mgmt-....sqlite --management-dir ./data/management-restore
```

`scripts/backup-management.mjs` copies `app.sqlite` plus `-wal`/`-shm` sidecars when present. It does **not** include `DATA_ENCRYPTION_KEY`.

### Alternative: clean shutdown + volume archive

```bash
docker compose stop api
docker run --rm -v fb-posts-api_api_data:/data -v "$(pwd)/backups:/backups" alpine \
  tar czf /backups/api-data-$(date +%Y%m%d).tgz -C /data .
docker compose start api
```

Adjust the volume name (`docker volume ls`) to match your Compose project.

Also archive:

- `.env` **without** pasting secrets into chat/logs — store privately
- Caddy certificate volume if you need to avoid re-issuance (`caddy_data`)

## Restore (isolated test first)

1. Create a **new** Compose project / empty volume — do not overwrite production without explicit confirmation.
2. Restore `/data/cache` and `/data/management` into the volume.
3. Restore the **same** `DATA_ENCRYPTION_KEY`, `ADMIN_INTERNAL_SECRET`, and related env into `.env`.
4. `docker compose up -d`
5. Verify:
   - Admin login (and MFA if enrolled)
   - Providers page decrypts the Apify token (or shows connected state)
   - API keys still authorize `/api/v1/*`
   - Cache and quota files present

## Rollback limitations

- Schema migrations are **forward-only**. Rolling back the API **image** alone does not undo a newer SQLite schema.
- To roll back after a migration: restore a pre-migration management DB backup **and** run a matching image revision.
- Cache files are versioned by application cache format; prefer restoring cache + management from the same backup point.

## What not to do

- Do not `docker compose down -v` on the operator project unless you intend to destroy data.
- Do not run compose smoke cleanup against production project names.
- Do not print encryption keys, bootstrap tokens, or Apify tokens during restore drills.
