#!/bin/bash
set -euo pipefail

# KNEF Business OS — Database Backup Script
# Runs daily via cron: 0 2 * * * /app/scripts/backup.sh >> /var/log/knef-backup.log 2>&1

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DATE=$(date +%Y-%m-%d_%H-%M)
DAILY_DIR="${BACKUP_DIR}/daily"
BACKUP_FILE="${DAILY_DIR}/knef_${DATE}.sql"

# Ensure backup directory exists
mkdir -p "${DAILY_DIR}"

echo "[$(date -Iseconds)] Starting backup..."

# Dump database
docker compose exec -T db pg_dump \
  -U knef \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  knef_prod > "${BACKUP_FILE}"

# Compress
gzip "${BACKUP_FILE}"
echo "[$(date -Iseconds)] Compressed: ${BACKUP_FILE}.gz"

# Encrypt
gpg --batch \
    --yes \
    --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
    --symmetric \
    --cipher-algo AES256 \
    "${BACKUP_FILE}.gz"

# Remove unencrypted compressed file
rm "${BACKUP_FILE}.gz"

FINAL_FILE="${BACKUP_FILE}.gz.gpg"
FILE_SIZE=$(du -sh "${FINAL_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: ${FINAL_FILE} (${FILE_SIZE})"

# Cleanup: keep last 7 daily backups
find "${DAILY_DIR}" -name "*.gpg" -mtime +7 -delete
echo "[$(date -Iseconds)] Cleanup complete. Retaining last 7 backups."

# Optional: verify backup count
BACKUP_COUNT=$(find "${DAILY_DIR}" -name "*.gpg" | wc -l)
echo "[$(date -Iseconds)] Current backup count: ${BACKUP_COUNT}"
