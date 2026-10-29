#!/usr/bin/env bash
# One-command update + (re)start for a VPS / server terminal.
# Usage:  ./deploy.sh [branch]   (people log in with their own accounts; see DEPLOY.md for the first-time setup code)
# Needs Node 18+. Uses pm2 (installed automatically via npm if missing) to keep the app running.
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
PORT="${PORT:-8080}"
DATA_ROOT="${DATA_ROOT:-$HOME/niec-data}"   # data lives OUTSIDE the repo so updates never touch it

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm install --omit=dev --no-audit --no-fund
npm test --silent

mkdir -p "$DATA_ROOT/student-details" "$DATA_ROOT/counselor-incentive"
command -v pm2 >/dev/null || npm install -g pm2

if pm2 describe niec >/dev/null 2>&1; then
  pm2 reload niec --update-env
  pm2 save
  echo "Reloaded. Logs: pm2 logs niec"
  exit 0
fi

PORT="$PORT" \
STUDENT_DETAILS_DATA_DIR="$DATA_ROOT/student-details" COUNSELOR_DATA_DIR="$DATA_ROOT/counselor-incentive" \
  pm2 start gateway/server.js --name niec
pm2 save
echo "Running on port $PORT. Logs: pm2 logs niec"
