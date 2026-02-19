#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.local}"
NODE_PATH_PREFIX="${NODE_PATH_PREFIX:-/opt/homebrew/opt/node@20/bin}"

API_PID_FILE="/tmp/prostyle_api.pid"
WORKER_PID_FILE="/tmp/prostyle_worker.pid"
FRONTEND_PID_FILE="/tmp/prostyle_frontend.pid"

API_LOG="/tmp/prostyle_api.log"
WORKER_LOG="/tmp/prostyle_worker.log"
FRONTEND_LOG="/tmp/prostyle_frontend.log"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f ".env.local.example" ]]; then
  echo "env file '$ENV_FILE' not found, falling back to .env.local.example"
  set -a
  # shellcheck disable=SC1091
  source ".env.local.example"
  set +a
else
  echo "No env file found. Expected '$ENV_FILE' or '.env.local.example'."
  exit 1
fi

export PATH="${NODE_PATH_PREFIX}:$PATH"
export WORKER_RUN_ONCE=false

is_running() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  if kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  return 1
}

start_one() {
  local name="$1"
  local cmd="$2"
  local pid_file="$3"
  local log_file="$4"

  if is_running "$pid_file"; then
    echo "$name already running (pid $(cat "$pid_file"))"
    return
  fi

  nohup bash -lc "$cmd" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  echo "started $name (pid $pid), log: $log_file"
}

stop_one() {
  local name="$1"
  local pid_file="$2"
  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    echo "$name not running"
    return
  fi
  local pid
  pid="$(cat "$pid_file")"
  kill "$pid" 2>/dev/null || true
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
  echo "stopped $name"
}

status_one() {
  local name="$1"
  local pid_file="$2"
  if is_running "$pid_file"; then
    echo "$name: running (pid $(cat "$pid_file"))"
  else
    echo "$name: stopped"
  fi
}

start_all() {
  start_one "api" "npm run api" "$API_PID_FILE" "$API_LOG"
  start_one "worker" "npm run worker" "$WORKER_PID_FILE" "$WORKER_LOG"
  start_one "frontend" "npm run frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG"
  echo "frontend: http://127.0.0.1:3000"
  echo "api health: http://127.0.0.1:3001/v1/health"
}

stop_all() {
  stop_one "frontend" "$FRONTEND_PID_FILE"
  stop_one "worker" "$WORKER_PID_FILE"
  stop_one "api" "$API_PID_FILE"
}

status_all() {
  status_one "api" "$API_PID_FILE"
  status_one "worker" "$WORKER_PID_FILE"
  status_one "frontend" "$FRONTEND_PID_FILE"
}

case "${1:-}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  status)
    status_all
    ;;
  *)
    echo "usage: scripts/dev-stack.sh {start|stop|restart|status}"
    echo "optional: ENV_FILE=.env.local NODE_PATH_PREFIX=/opt/homebrew/opt/node@20/bin"
    exit 1
    ;;
esac
