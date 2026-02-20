#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/prostyle/app}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.prod}"
RUN_USER="${RUN_USER:-$USER}"
UNIT_DIR="/etc/systemd/system"
TEMPLATE_DIR="${TEMPLATE_DIR:-deploy/systemd}"

render_unit() {
  local template="$1"
  local unit_name="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  sed \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    "$template" >"$tmp_file"

  sudo cp "$tmp_file" "$UNIT_DIR/$unit_name"
  rm -f "$tmp_file"
}

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template directory not found: $TEMPLATE_DIR"
  exit 1
fi

render_unit "$TEMPLATE_DIR/prostyle-api.service.template" "prostyle-api.service"
render_unit "$TEMPLATE_DIR/prostyle-worker.service.template" "prostyle-worker.service"
render_unit "$TEMPLATE_DIR/prostyle-frontend.service.template" "prostyle-frontend.service"

sudo systemctl daemon-reload
sudo systemctl enable prostyle-api prostyle-worker prostyle-frontend

if [[ "${START_SERVICES:-0}" == "1" ]]; then
  sudo systemctl restart prostyle-api prostyle-worker prostyle-frontend
fi

echo "Installed systemd units."
echo "To start now: sudo systemctl restart prostyle-api prostyle-worker prostyle-frontend"
echo "To check status: sudo systemctl status prostyle-api prostyle-worker prostyle-frontend --no-pager"
