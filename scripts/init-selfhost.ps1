# Initialize .env for Docker Compose without requiring host Node.js.
# Requires: Docker Engine. Idempotent — never overwrites existing secrets.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

if (-not (Test-Path ".env.example")) {
  Write-Error ".env.example missing"
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "created .env from .env.example"
} else {
  Write-Host "keeping existing .env"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is required for init-selfhost (or install Node >=22 and run: npm run secrets:generate)"
}

$mount = ($Root.Path -replace '\\', '/')
docker run --rm -v "${mount}:/work" -w /work node:22-alpine node scripts/generate-compose-secrets.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Next (local HTTP):"
Write-Host "  docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build"
Write-Host "  Open http://127.0.0.1:8080/setup"
Write-Host "Copy BOOTSTRAP_SETUP_TOKEN from .env into the setup form."
Write-Host "Escrow DATA_ENCRYPTION_KEY separately from volume backups."
