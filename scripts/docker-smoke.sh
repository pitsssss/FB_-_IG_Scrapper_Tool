#!/usr/bin/env bash
# Local/CI Docker smoke: build image, health + auth checks, optional volume persistence.
# Requires: docker, curl, node. No real APIFY_TOKEN / production secrets.
set -euo pipefail
# Prevent Git Bash on Windows from rewriting Docker bind paths / workdirs.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE_TAG="${IMAGE_TAG:-fb-posts-api:smoke-local}"
API_PORT="${API_PORT:-18080}"
NET_NAME="${NET_NAME:-fb-posts-smoke-net}"
VOL_NAME="${VOL_NAME:-fb-posts-smoke-vol}"
API_NAME="${API_NAME:-fb-posts-smoke-api}"
FAKE_NAME="${FAKE_NAME:-fb-posts-smoke-fake}"
SMOKE_KEY="smoke$(openssl rand -hex 16 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")"

# Portable HTTP GET via Node (avoids Git-Bash/MSYS curl /dev/null and %{http_code} issues).
# mode: "code" | "body"
http_req() {
  local mode="$1"
  local url="$2"
  local header_name="${3:-}"
  local header_value="${4:-}"
  node -e '
const http = require("http");
const https = require("https");
const mode = process.argv[1];
const url = process.argv[2];
const headerName = process.argv[3] || "";
const headerValue = process.argv[4] || "";
const u = new URL(url);
const lib = u.protocol === "https:" ? https : http;
const headers = {};
if (headerName) headers[headerName] = headerValue;
const req = lib.request(
  {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || (u.protocol === "https:" ? 443 : 80),
    path: u.pathname + u.search,
    method: "GET",
    headers,
  },
  (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (mode === "code") process.stdout.write(String(res.statusCode));
      else process.stdout.write(body);
    });
  }
);
req.on("error", (err) => {
  console.error(err.message);
  process.exit(2);
});
req.end();
' "$mode" "$url" "$header_name" "$header_value"
}

http_code() { http_req code "$@"; }
http_body() { http_req body "$@"; }

cleanup() {
  docker rm -f "$API_NAME" >/dev/null 2>&1 || true
  docker rm -f "$FAKE_NAME" >/dev/null 2>&1 || true
  docker network rm "$NET_NAME" >/dev/null 2>&1 || true
  # Keep volume only if KEEP_VOLUME=1 (debugging). Default: remove.
  if [ "${KEEP_VOLUME:-0}" != "1" ]; then
    docker volume rm "$VOL_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== docker smoke: build $IMAGE_TAG =="
docker build -t "$IMAGE_TAG" .

echo "== network + fake upstream container =="
docker network create "$NET_NAME" >/dev/null
# Run fake upstream from a node image mounting repo scripts + fixtures (no secrets).
# MSYS_NO_PATHCONV avoids Git-Bash rewriting absolute container paths like -w /.
MSYS_NO_PATHCONV=1 docker run -d --name "$FAKE_NAME" --network "$NET_NAME" \
  -v "${ROOT}/scripts:/scripts:ro" \
  -v "${ROOT}/test/fixtures:/test/fixtures:ro" \
  --workdir // \
  node:22-alpine \
  node //scripts/fake-upstream.js 8799 >/dev/null

# Wait for fake upstream
for i in $(seq 1 30); do
  if docker exec "$FAKE_NAME" wget -qO- "http://127.0.0.1:8799/__stats" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "== start API container (synthetic env, persistent volume) =="
docker volume create "$VOL_NAME" >/dev/null
# Named volumes are typically root-owned when first mounted. Align ownership for USER node
# the same way operators must on Railway (RAILWAY_RUN_UID=0 or chown via entrypoint).
# For smoke we chown via a short-lived root helper before starting the API as node.
docker run --rm -v "$VOL_NAME:/data" alpine:3.20 chown -R 1000:1000 /data

docker run -d --name "$API_NAME" --network "$NET_NAME" \
  -p "127.0.0.1:${API_PORT}:3000" \
  -v "$VOL_NAME:/data" \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e CACHE_DIR=/data/cache \
  -e API_KEYS="smoke:${SMOKE_KEY}" \
  -e APIFY_TOKEN=dummy \
  -e APIFY_BASE_URL="http://${FAKE_NAME}:8799" \
  -e PROVIDERS=apify \
  -e APIFY_DAILY_RUN_LIMIT=20 \
  -e WARM_PAGES= \
  -e FRESH_TTL_SECONDS=3600 \
  -e UPSTREAM_RETRIES=0 \
  "$IMAGE_TAG" >/dev/null

BASE="http://127.0.0.1:${API_PORT}"
READY=0
for i in $(seq 1 40); do
  if CODE="$(http_code "$BASE/health" 2>/dev/null || true)" && [ "$CODE" = "200" ]; then
    READY=1
    break
  fi
  sleep 0.5
done
if [ "$READY" != "1" ]; then
  echo "FAIL: API never became healthy"
  docker logs "$API_NAME" >&2 || true
  exit 1
fi

echo "== /health =="
HEALTH="$(http_body "$BASE/health")"
echo "$HEALTH" | grep -q '"status":"ok"'

echo "== auth missing/invalid =="
CODE_MISSING="$(http_code "$BASE/api/v1/facebook/posts?page=cern")"
CODE_BAD="$(http_code "$BASE/api/v1/facebook/posts?page=cern" "x-api-key" "wrong")"
test "$CODE_MISSING" = "401"
test "$CODE_BAD" = "401"

echo "== live fetch via fake upstream =="
LIVE="$(http_body "$BASE/api/v1/facebook/posts?page=cern&limit=3" "x-api-key" "$SMOKE_KEY")"
echo "$LIVE" | grep -q '"success":true'
echo "$LIVE" | grep -q '"source":"live"'
IDS="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.data.posts.map(p=>p.id).join(','))" "$LIVE")"
test -n "$IDS"

echo "== cache dir writable by runtime user =="
docker exec "$API_NAME" sh -c 'touch /data/cache/.smoke-write && test -f /data/cache/.smoke-write'
WRITE_USER="$(docker exec "$API_NAME" id -un)"
echo "write_user=$WRITE_USER"

echo "== effective user inside container =="
EFFECTIVE_USER="$(docker exec "$API_NAME" id -un)"
echo "effective_user=$EFFECTIVE_USER"
test "$EFFECTIVE_USER" = "node"

echo "== logs must not contain synthetic key =="
LOGS="$(docker logs "$API_NAME" 2>&1 || true)"
echo "$LOGS" | grep -F "$SMOKE_KEY" && { echo "FAIL: key leaked in logs"; exit 1; } || true
echo "$LOGS" | grep -F "dummy" && { echo "FAIL: dummy token leaked in logs"; exit 1; } || true

echo "== stop API (SIGTERM) and restart with same volume, quota-disabled =="
docker stop -t 10 "$API_NAME" >/dev/null
docker rm "$API_NAME" >/dev/null
docker run -d --name "$API_NAME" --network "$NET_NAME" \
  -p "127.0.0.1:${API_PORT}:3000" \
  -v "$VOL_NAME:/data" \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e CACHE_DIR=/data/cache \
  -e API_KEYS="smoke:${SMOKE_KEY}" \
  -e APIFY_TOKEN=dummy \
  -e APIFY_BASE_URL="http://${FAKE_NAME}:8799" \
  -e PROVIDERS=apify \
  -e APIFY_DAILY_RUN_LIMIT=0 \
  -e WARM_PAGES= \
  -e FRESH_TTL_SECONDS=3600 \
  "$IMAGE_TAG" >/dev/null

READY=0
for i in $(seq 1 40); do
  if CODE="$(http_code "$BASE/health" 2>/dev/null || true)" && [ "$CODE" = "200" ]; then
    READY=1
    break
  fi
  sleep 0.5
done
if [ "$READY" != "1" ]; then
  echo "FAIL: API never became healthy after restart"
  docker logs "$API_NAME" >&2 || true
  exit 1
fi

CACHED="$(http_body "$BASE/api/v1/facebook/posts?page=cern&limit=3" "x-api-key" "$SMOKE_KEY")"
echo "$CACHED" | grep -q '"success":true'
SOURCE="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.meta.source)" "$CACHED")"
IDS2="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.data.posts.map(p=>p.id).join(','))" "$CACHED")"
echo "restart_source=$SOURCE"
echo "ids_match=$( [ "$IDS" = "$IDS2" ] && echo true || echo false )"
test "$IDS" = "$IDS2"
echo "$SOURCE" | grep -Eq 'cache|stale-cache'

# Quota file should exist on volume
docker run --rm -v "$VOL_NAME:/data" alpine:3.20 test -f /data/cache/apify-quota.json
echo "quota_file=present"

# Unwritable quota storage must fail closed (reservation / live path rejects)
echo "== unwritable quota fails closed =="
docker stop -t 5 "$API_NAME" >/dev/null
docker rm "$API_NAME" >/dev/null
# Make cache dir immutable for node (owned by root, mode 755, no write for uid 1000)
docker run --rm -v "$VOL_NAME:/data" alpine:3.20 sh -c 'chown -R root:root /data && chmod -R a-w /data'
docker run -d --name "$API_NAME" --network "$NET_NAME" \
  -p "127.0.0.1:${API_PORT}:3000" \
  -v "$VOL_NAME:/data" \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e CACHE_DIR=/data/cache \
  -e API_KEYS="smoke:${SMOKE_KEY}" \
  -e APIFY_TOKEN=dummy \
  -e APIFY_BASE_URL="http://${FAKE_NAME}:8799" \
  -e PROVIDERS=apify \
  -e APIFY_DAILY_RUN_LIMIT=20 \
  -e WARM_PAGES= \
  -e FRESH_TTL_SECONDS=3600 \
  -e UPSTREAM_RETRIES=0 \
  "$IMAGE_TAG" >/dev/null

READY=0
for i in $(seq 1 40); do
  if CODE="$(http_code "$BASE/health" 2>/dev/null || true)" && [ "$CODE" = "200" ]; then
    READY=1
    break
  fi
  sleep 0.5
done
test "$READY" = "1"

# Existing cached posts should still be readable even when disk is unwritable
STILL_CACHED="$(http_body "$BASE/api/v1/facebook/posts?page=cern&limit=3" "x-api-key" "$SMOKE_KEY")"
echo "$STILL_CACHED" | grep -q '"success":true'
STILL_SOURCE="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.meta.source)" "$STILL_CACHED")"
echo "unwritable_disk_source=$STILL_SOURCE"
echo "$STILL_SOURCE" | grep -Eq 'cache|stale-cache'

# Fresh uncached page must fail closed (no silent live without quota persistence)
# Use a page that was never cached in this volume.
FAIL_CLOSED_CODE="$(http_code "$BASE/api/v1/facebook/posts?page=nasa&limit=1" "x-api-key" "$SMOKE_KEY")"
echo "unwritable_live_http=$FAIL_CLOSED_CODE"
# Expect non-200 (quota/disk failure or upstream error path) — not a silent success live scrape
test "$FAIL_CLOSED_CODE" != "200"

# Restore volume ownership for remaining checks / cleanup
docker stop -t 5 "$API_NAME" >/dev/null
docker rm "$API_NAME" >/dev/null
docker run --rm -v "$VOL_NAME:/data" alpine:3.20 sh -c 'chmod -R u+w /data && chown -R 1000:1000 /data'

# Image must not contain .env
docker run --rm --entrypoint sh "$IMAGE_TAG" -c 'test ! -f /.env && test ! -f /app/.env && ls /app/src/index.js >/dev/null'
echo "image_has_no_dotenv=true required_src=present"

# Confirm no leftover containers after trap (explicit stop for clarity)
docker stop -t 5 "$API_NAME" >/dev/null 2>&1 || true

echo "DOCKER_SMOKE: PASS effective_user=$EFFECTIVE_USER"
