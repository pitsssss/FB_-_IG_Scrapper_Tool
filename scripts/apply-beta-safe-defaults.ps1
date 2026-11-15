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
#   .\scripts\apply-beta-safe-defaults.ps1 -Confirm
# Advanced override (explicit; still never touches secrets):
#   .\scripts\apply-beta-safe-defaults.ps1 -Confirm -Force
param(
  [switch]$Confirm,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvPath = Join-Path $Root.Path ".env"

if (-not $Confirm) {
  Write-Error @"
Refusing to modify .env without -Confirm.

This script is for FRESH external beta tester installs only.
It sets APIFY_DAILY_RUN_LIMIT=0 and disables warmers/enrichment.
Do not run it against an existing operator environment unless you intend that.

Example:
  .\scripts\apply-beta-safe-defaults.ps1 -Confirm
"@
}

if (-not (Test-Path $EnvPath)) {
  Write-Error ".env missing. Run .\scripts\init-selfhost.ps1 first."
}

function Get-EnvValue([string]$Text, [string]$Key) {
  $m = [regex]::Match($Text, "(?m)^" + [regex]::Escape($Key) + "=(.*)$")
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value.Trim()
}

function Upsert-EnvLine([string]$Text, [string]$Key, [string]$Value) {
  $pattern = "(?m)^" + [regex]::Escape($Key) + "=.*$"
  $line = "$Key=$Value"
  if ($Text -match $pattern) {
    return [regex]::Replace($Text, $pattern, $line)
  }
  if (-not $Text.EndsWith("`n") -and -not $Text.EndsWith("`r`n")) {
    $Text += "`r`n"
  }
  return $Text + $line + "`r`n"
}

$text = [System.IO.File]::ReadAllText($EnvPath)
$token = Get-EnvValue $text "APIFY_TOKEN"
$cookieSecure = Get-EnvValue $text "ADMIN_COOKIE_SECURE"
$origins = Get-EnvValue $text "ADMIN_ALLOWED_ORIGINS"

if (-not $Force) {
  if ($token -and $token.Length -gt 0) {
    Write-Error "APIFY_TOKEN is already set. Refusing to alter an operator-like .env. Use a fresh tester clone, or pass -Force if you explicitly accept changing quota/warm defaults only (secrets are still untouched)."
  }
  if ($cookieSecure -eq "1") {
    Write-Error "ADMIN_COOKIE_SECURE=1 looks like a non-local install. Refusing without -Force."
  }
  if ($origins -and ($origins -notmatch '127\.0\.0\.1:8080') -and ($origins -notmatch '^http://localhost:8080$')) {
    Write-Error "ADMIN_ALLOWED_ORIGINS is not the local beta loopback origin. Refusing without -Force."
  }
}

$text = Upsert-EnvLine $text "APIFY_DAILY_RUN_LIMIT" "0"
$text = Upsert-EnvLine $text "WARM_PAGES" ""
$text = Upsert-EnvLine $text "INSTAGRAM_WARM_PROFILES" ""
$text = Upsert-EnvLine $text "INSTAGRAM_PROFILE_ENRICHMENT" "0"
[System.IO.File]::WriteAllText($EnvPath, $text)

Write-Host "Beta safe defaults applied (no secrets printed or regenerated):"
Write-Host "  APIFY_DAILY_RUN_LIMIT=0"
Write-Host "  WARM_PAGES="
Write-Host "  INSTAGRAM_WARM_PROFILES="
Write-Host "  INSTAGRAM_PROFILE_ENRICHMENT=0"
Write-Host "Leave APIFY_TOKEN empty for this beta. Do not enable paid Actors."
