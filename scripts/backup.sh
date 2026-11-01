#!/usr/bin/env bash
# KNEF Business OS — PostgreSQL Backup Script
# Run by the worker BackupProcessor via child_process.spawn.
# Requires: pg_dump (postgresql-client), gzip, gpg (optional)
#
# Env vars:
#   DATABASE_URL               — required, PostgreSQL connection URI
#   BACKUP_DIR                 — default /app/backups
#   BACKUP_RETENTION_DAYS      — default 7
#   BACKUP_ENCRYPTION_PASSPHRASE — optional; omit to skip GPG encryption
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAILY_DIR="${BACKUP_DIR}/daily"
SQL_FILE="${DAILY_DIR}/knef_${TIMESTAMP}.sql"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# ── Sanity check the backup directory ────────────────────────────────────────
# Resolve to absolute path and confirm it is under BACKUP_DIR to prevent
# any path traversal from environment variable manipulation.
mkdir -p "${DAILY_DIR}"
REAL_DAILY=$(realpath "${DAILY_DIR}")
REAL_BASE=$(realpath "${BACKUP_DIR}")
if [[ "${REAL_DAILY}" != "${REAL_BASE}"* ]]; then
  log "ERROR: DAILY_DIR is not under BACKUP_DIR — aborting (path traversal guard)"
  exit 1
fi

log "Starting PostgreSQL backup → ${SQL_FILE}"

# ── Parse DATABASE_URL to avoid password appearing in pg_dump arguments ───────
# Format: postgresql://user:password@host:port/dbname[?params]
# We export PGPASSWORD so the password never appears in ps aux output.
_strip_scheme="${DATABASE_URL#*://}"
_userinfo="${_strip_scheme%@*}"
_hostpath="${_strip_scheme#*@}"

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

unset _strip_scheme _userinfo _hostpath _hostport _dbpath

export PGPASSWORD="${DB_PASS}"
unset DB_PASS

# ── Run pg_dump — password is in PGPASSWORD, not in arguments ─────────────────
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file="${SQL_FILE}"

unset PGPASSWORD

# ── Verify dump ───────────────────────────────────────────────────────────────
if [ ! -f "${SQL_FILE}" ]; then
  log "ERROR: Dump file not created: ${SQL_FILE}"
  exit 1
fi
SQL_SIZE=$(stat -c%s "${SQL_FILE}" 2>/dev/null || stat -f%z "${SQL_FILE}")
if [ "${SQL_SIZE}" -eq 0 ]; then
  log "ERROR: Dump file is empty"
  rm -f "${SQL_FILE}"
  exit 1
fi
log "Dump verified: ${SQL_SIZE} bytes"

# ── Compress ──────────────────────────────────────────────────────────────────
gzip "${SQL_FILE}"
GZ_FILE="${SQL_FILE}.gz"
log "Compressed: ${GZ_FILE}"

# ── Optional GPG encryption ───────────────────────────────────────────────────
if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  gpg --batch --yes \
    --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
    --symmetric \
    --cipher-algo AES256 \
    "${GZ_FILE}"
  rm -f "${GZ_FILE}"
  FINAL_FILE="${GZ_FILE}.gpg"
  log "Encrypted: ${FINAL_FILE}"
else
  FINAL_FILE="${GZ_FILE}"
  log "GPG encryption skipped (BACKUP_ENCRYPTION_PASSPHRASE not set)"
fi

# ── Final verification ────────────────────────────────────────────────────────
FINAL_SIZE=$(stat -c%s "${FINAL_FILE}" 2>/dev/null || stat -f%z "${FINAL_FILE}")
if [ "${FINAL_SIZE}" -eq 0 ]; then
  log "ERROR: Final backup file is empty"
  exit 1
fi

# Output the file path on stdout for the processor to capture
echo "BACKUP_FILE=${FINAL_FILE}"
echo "BACKUP_SIZE=${FINAL_SIZE}"
log "Backup complete: ${FINAL_FILE} (${FINAL_SIZE} bytes)"

# ── Retention: remove files older than RETENTION_DAYS ────────────────────────
# Restricted to DAILY_DIR/daily with maxdepth 1 — no path traversal possible.
log "Removing backups older than ${RETENTION_DAYS} days..."
find "${REAL_DAILY}" -maxdepth 1 \( -name 'knef_*.sql.gz' -o -name 'knef_*.sql.gz.gpg' \) \
  -type f -mtime "+${RETENTION_DAYS}" -delete

log "Done."
