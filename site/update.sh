#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
project="${PROJECT_DIR:-../personal-website}"
node site/collect.mjs --project "$project"
node site/build.mjs
docker compose -f site/docker-compose.yml up -d
echo "site updated: http://127.0.0.1:${SITE_PORT:-8080}/"