#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/db/run-with-db-restore.sh <command> [args...]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

DB_URL="${DATABASE_URL:-file:./data/prostyle.local.db}"
if [[ ! "${DB_URL}" =~ ^file:(.+)$ ]]; then
  echo "Only file: DATABASE_URL is supported for local restore wrapper. Current: ${DB_URL}" >&2
  exit 2
fi

DB_PATH_RAW="${BASH_REMATCH[1]}"
if [[ "${DB_PATH_RAW}" = /* ]]; then
  DB_PATH="${DB_PATH_RAW}"
else
  DB_PATH="${REPO_ROOT}/${DB_PATH_RAW}"
fi

DB_DIR="$(dirname "${DB_PATH}")"
DB_BASE="$(basename "${DB_PATH}")"
DB_NAME="${DB_BASE%.*}"
DB_EXT=".${DB_BASE##*.}"
if [[ "${DB_NAME}" = "${DB_BASE}" ]]; then
  DB_EXT=".db"
fi

CHECKPOINT_DIR="${DB_DIR}/checkpoints"
mkdir -p "${CHECKPOINT_DIR}"

TIMESTAMP="$(date -u +%Y%m%d-%H%M%SZ)"
SNAPSHOT_PATH="${CHECKPOINT_DIR}/${DB_NAME}.pre-smoke-restore.${TIMESTAMP}${DB_EXT}"
DB_EXISTED_BEFORE=0

if [ -f "${DB_PATH}" ]; then
  cp "${DB_PATH}" "${SNAPSHOT_PATH}"
  DB_EXISTED_BEFORE=1
  echo "[db-restore] Snapshot created: ${SNAPSHOT_PATH}"
else
  echo "[db-restore] No DB file existed before run: ${DB_PATH}"
fi

restore_db() {
  if [ "${DB_EXISTED_BEFORE}" -eq 1 ]; then
    cp "${SNAPSHOT_PATH}" "${DB_PATH}"
    echo "[db-restore] DB restored from snapshot: ${SNAPSHOT_PATH}"
  else
    rm -f "${DB_PATH}"
    echo "[db-restore] Removed DB created during run: ${DB_PATH}"
  fi
}

trap restore_db EXIT

echo "[db-restore] Running command: $*"
"$@"
echo "[db-restore] Command completed successfully."
