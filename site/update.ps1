param(
  [string]$Project = "..\personal-website"
)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..")
try {
  node site/collect.mjs --project $Project
  node site/build.mjs
  docker compose -f site/docker-compose.yml up -d
  Write-Host "site updated: http://127.0.0.1:$($env:SITE_PORT ?? '8080')/"
} finally {
  Pop-Location
}