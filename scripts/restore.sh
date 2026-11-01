#!/usr/bin/env bash
# KNEF Business OS — Database Restore Script
#
# Run this MANUALLY by an operator. The Worker NEVER calls this script.
# Restoring a database is a destructive, human-supervised operation.
#
# Usage:
#   ./scripts/restore.sh /app/backups/daily/knef_20261003_020000.sql.gz.gpg
#   ./scripts/restore.sh /app/backups/daily/knef_20261003_020000.sql.gz
#
# Requires: DATABASE_URL, BACKUP_ENCRYPTION_PASSPHRASE (if backup is encrypted)
set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file>"
  echo "  Example: $0 /app/backups/daily/knef_20261003_020000.sql.gz.gpg"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "=================================================="
echo " KNEF Business OS — Database Restore"
echo "=================================================="
echo " Backup file : ${BACKUP_FILE}"
echo " File size   : $(du -sh "${BACKUP_FILE}" | cut -f1)"
echo ""
echo " *** WARNING: THIS WILL OVERWRITE ALL DATABASE DATA ***"
echo " *** Run this only in a maintenance window.         ***"
echo ""
read -r -p " Type RESTORE to confirm: " confirmation

if [[ "${confirmation}" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "Starting restore from ${BACKUP_FILE} ..."

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"

_strip="${DATABASE_URL#*://}"
_userinfo="${_strip%@*}"
_hostpath="${_strip#*@}"
DB_USER="${_userinfo%:*}"
DB_PASS="${_userinfo#*:}"
_hostport="${_hostpath%%/*}"
_dbpath="${_hostpath#*/}"
DB_NAME="${_dbpath%%\?*}"

if echo "${_hostport}" | grep -q ':'; then
  DB_HOST="${_hostport%:*}"
  DB_PORT="${_hostport##*:}"
else
  DB_HOST="${_hostport}"
  DB_PORT="5432"
fi
unset _strip _userinfo _hostpath _hostport _dbpath

export PGPASSWORD="${DB_PASS}"
unset DB_PASS

# ── Decrypt + decompress + restore ────────────────────────────────────────────
if [[ "${BACKUP_FILE}" == *.gpg ]]; then
  PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backups}"
  log "Decrypting and decompressing..."
  gpg --batch --yes \
    --passphrase "${PASSPHRASE}" \
    --decrypt "${BACKUP_FILE}" \
  | gunzip \
  | psql \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --username="${DB_USER}" \
      --dbname="${DB_NAME}" \
      --no-password \
      -v ON_ERROR_STOP=1
elif [[ "${BACKUP_FILE}" == *.gz ]]; then
  log "Decompressing..."
  gunzip -c "${BACKUP_FILE}" \
  | psql \
      --host="${DB_HOST}" \
      --port="${DB_PORT}" \
      --username="${DB_USER}" \
      --dbname="${DB_NAME}" \
      --no-password \
      -v ON_ERROR_STOP=1
else
  log "Restoring SQL file directly..."
  psql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --no-password \
    -v ON_ERROR_STOP=1 \
    -f "${BACKUP_FILE}"
fi

unset PGPASSWORD

log "Restore complete. Restart all services and verify application health before resuming traffic."
