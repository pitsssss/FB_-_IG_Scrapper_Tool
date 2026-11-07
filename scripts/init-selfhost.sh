#!/usr/bin/env bash
# Initialize .env for Docker Compose without requiring host Node.js.
# Requires: Docker Engine. Idempotent — never overwrites existing secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.example ]]; then
  echo "error: .env.example missing" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "created .env from .env.example"
else
  echo "keeping existing .env"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: Docker is required for init-selfhost (or install Node ≥22 and run: npm run secrets:generate)" >&2
  exit 1
fi

docker run --rm \
  -v "$ROOT:/work" \
  -w /work \
  node:22-alpine \
  node scripts/generate-compose-secrets.mjs

echo ""
echo "Next (local HTTP):"
echo "  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build"
echo "  Open http://127.0.0.1:8080/setup"
echo "Copy BOOTSTRAP_SETUP_TOKEN from .env into the setup form."
echo "Escrow DATA_ENCRYPTION_KEY separately from volume backups."
