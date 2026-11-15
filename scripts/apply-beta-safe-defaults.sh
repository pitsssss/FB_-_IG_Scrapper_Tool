#!/usr/bin/env bash
# Apply cost-safe Apify / warmer defaults for FRESH external beta tester installs.
#
# Intended audience: a new clone on a tester machine after init-selfhost.
# NOT for silently changing an existing operator/production .env.
#
# Touches only:
#   APIFY_DAILY_RUN_LIMIT, WARM_PAGES, INSTAGRAM_WARM_PROFILES, INSTAGRAM_PROFILE_ENRICHMENT
# Never prints or regenerates secrets, encryption keys, API keys, or tokens.
#
# Usage (from repo root):
#   ./scripts/apply-beta-safe-defaults.sh --confirm
# Advanced override:
#   ./scripts/apply-beta-safe-defaults.sh --confirm --force
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_PATH="$ROOT/.env"
CONFIRM=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --confirm) CONFIRM=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/apply-beta-safe-defaults.sh --confirm [--force]

Fresh external beta installs only. Sets APIFY_DAILY_RUN_LIMIT=0 and disables
warmers/enrichment. Does not modify secrets. Refuses operator-like .env
unless --force is also passed.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$CONFIRM" -ne 1 ]]; then
  cat >&2 <<'EOF'
Refusing to modify .env without --confirm.

This script is for FRESH external beta tester installs only.
It sets APIFY_DAILY_RUN_LIMIT=0 and disables warmers/enrichment.
Do not run it against an existing operator environment unless you intend that.

Example:
  ./scripts/apply-beta-safe-defaults.sh --confirm
EOF
  exit 1
fi

if [[ ! -f "$ENV_PATH" ]]; then
  echo ".env missing. Run ./scripts/init-selfhost.sh first." >&2
  exit 1
fi

get_env() {
  local key="$1"
  # shellcheck disable=SC2002
  awk -F= -v k="$key" '$1==k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_PATH"
}

TOKEN="$(get_env APIFY_TOKEN | tr -d '\r')"
COOKIE_SECURE="$(get_env ADMIN_COOKIE_SECURE | tr -d '\r')"
ORIGINS="$(get_env ADMIN_ALLOWED_ORIGINS | tr -d '\r')"

if [[ "$FORCE" -ne 1 ]]; then
  if [[ -n "${TOKEN}" ]]; then
    echo "APIFY_TOKEN is already set. Refusing to alter an operator-like .env. Use a fresh tester clone, or pass --force (secrets still untouched)." >&2
    exit 1
  fi
  if [[ "$COOKIE_SECURE" == "1" ]]; then
    echo "ADMIN_COOKIE_SECURE=1 looks like a non-local install. Refusing without --force." >&2
    exit 1
  fi
  if [[ -n "$ORIGINS" && "$ORIGINS" != *"127.0.0.1:8080"* && "$ORIGINS" != "http://localhost:8080" ]]; then
    echo "ADMIN_ALLOWED_ORIGINS is not the local beta loopback origin. Refusing without --force." >&2
    exit 1
  fi
fi

upsert() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_PATH"; then
    awk -v k="$key" -v v="$value" '
      BEGIN { FS=OFS="=" }
      $1==k {
        # Preserve keys that may contain "=" in value by rewriting whole line.
        print k "=" v
        next
      }
      { print }
    ' "$ENV_PATH" > "$ENV_PATH.tmp"
    mv "$ENV_PATH.tmp" "$ENV_PATH"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_PATH"
  fi
}

upsert APIFY_DAILY_RUN_LIMIT 0
upsert WARM_PAGES ""
upsert INSTAGRAM_WARM_PROFILES ""
upsert INSTAGRAM_PROFILE_ENRICHMENT 0

echo "Beta safe defaults applied (no secrets printed or regenerated):"
echo "  APIFY_DAILY_RUN_LIMIT=0"
echo "  WARM_PAGES="
echo "  INSTAGRAM_WARM_PROFILES="
echo "  INSTAGRAM_PROFILE_ENRICHMENT=0"
echo "Leave APIFY_TOKEN empty for this beta. Do not enable paid Actors."
