#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/root/OpenBiliClaw"
WEB_DIR="${PROJECT_ROOT}/web"
SITE_ROOT="/www/wwwroot/bili.qingningplayer.top"

if [[ ! -d "${WEB_DIR}" ]]; then
  echo "web directory not found: ${WEB_DIR}" >&2
  exit 1
fi

if [[ ! -d "${SITE_ROOT}" ]]; then
  echo "site root not found: ${SITE_ROOT}" >&2
  exit 1
fi

cd "${WEB_DIR}"

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run build

rsync -av --delete \
  --exclude '.well-known/' \
  --exclude 'downloads/' \
  --exclude '.user.ini' \
  --exclude '.htaccess' \
  --exclude '404.html' \
  "${WEB_DIR}/dist/" \
  "${SITE_ROOT}/"

find "${SITE_ROOT}" -mindepth 1 \
  ! -path "${SITE_ROOT}/.user.ini" \
  -exec chown www:www {} +

nginx -t
systemctl reload nginx

echo "Deployed OpenBiliClaw Web frontend to ${SITE_ROOT}"
