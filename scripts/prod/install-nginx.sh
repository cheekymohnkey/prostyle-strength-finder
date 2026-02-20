#!/usr/bin/env bash
set -euo pipefail

API_HOST="${API_HOST:?Set API_HOST, e.g. api.example.com}"
APP_HOST="${APP_HOST:?Set APP_HOST, e.g. app.example.com}"
API_PORT="${API_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
TEMPLATE_PATH="${TEMPLATE_PATH:-deploy/nginx/prostyle.conf.template}"
TARGET_NAME="${TARGET_NAME:-prostyle.conf}"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "Template file not found: $TEMPLATE_PATH"
  exit 1
fi

tmp_file="$(mktemp)"
sed \
  -e "s|__API_HOST__|$API_HOST|g" \
  -e "s|__APP_HOST__|$APP_HOST|g" \
  -e "s|__API_PORT__|$API_PORT|g" \
  -e "s|__FRONTEND_PORT__|$FRONTEND_PORT|g" \
  "$TEMPLATE_PATH" >"$tmp_file"

sudo cp "$tmp_file" "/etc/nginx/sites-available/$TARGET_NAME"
sudo ln -sf "/etc/nginx/sites-available/$TARGET_NAME" "/etc/nginx/sites-enabled/$TARGET_NAME"
rm -f "$tmp_file"

sudo nginx -t
sudo systemctl reload nginx

echo "Installed nginx site: $TARGET_NAME"
