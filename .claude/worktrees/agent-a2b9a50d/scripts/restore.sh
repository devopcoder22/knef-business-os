#!/bin/bash
set -euo pipefail

# KNEF Business OS — Database Restore Script
# Usage: ./scripts/restore.sh /path/to/backup.sql.gz.gpg
# WARNING: This will REPLACE all data in the database!

BACKUP_FILE="${1:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: Please provide the backup file path."
  echo "Usage: $0 /app/backups/daily/knef_2024-01-01_02-00.sql.gz.gpg"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "================================================"
echo " KNEF Business OS — Database Restore"
echo "================================================"
echo "Backup file: ${BACKUP_FILE}"
echo ""
echo "WARNING: This will OVERWRITE all current database data!"
read -r -p "Type 'RESTORE' to confirm: " confirmation

if [[ "${confirmation}" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

echo "[$(date -Iseconds)] Starting restore..."

# Decrypt and decompress, then restore
gpg --batch \
    --yes \
    --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
    --decrypt "${BACKUP_FILE}" | \
  gunzip | \
  docker compose exec -T db psql \
    -U knef \
    --no-password \
    -d knef_prod \
    -v ON_ERROR_STOP=1

echo "[$(date -Iseconds)] Restore complete!"
echo "Please restart the API and verify application health."
