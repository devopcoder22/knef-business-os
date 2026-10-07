# KNEF Business OS V1.1 — Disaster Recovery Plan

**System:** KNEF Business OS  
**Version:** V1.1 (branch `v1.1-development`, commit `797d702`)  
**Last updated:** 2026-10-06  
**Operator contact:** joao.pinton@imeri.com

---

## 1. Overview

This document defines the procedures for recovering the KNEF Business OS from partial or total failure. It covers database restore, application rollback, and decision criteria for each failure scenario.

**Scope:** Single-server Docker Compose deployment. There is no high availability, no automatic failover, and no replica database in V1.1.

**Recovery Point Objective (RPO):** Up to 24 hours of data loss in the worst case (last successful daily backup). If the automated backup ran at 02:00 UTC and failure occurs at 23:59, up to 22 hours of transactions may be unrecoverable.

**Recovery Time Objective (RTO):** Target 1 hour from decision to restore, to application serving traffic. Actual time depends on backup file size and network transfer speed if restoring from off-server.

**What is covered by backups:** The PostgreSQL database (`knef_prod`). This includes all business data: products, sales, inventory, customers, users, permissions, audit logs, financial records, and AI conversation history.

**What is NOT covered by backups:** Uploaded files (Docker volume `uploads`) and Redis queue state. Uploads should be separately replicated (e.g., rsync or S3). Redis queue data is ephemeral — in-flight jobs may need to be re-triggered manually after recovery.

---

## 2. Failure Scenarios

### Scenario A: Database disk full

**Symptoms:**
- API responds `500 Internal Server Error` to write operations
- PostgreSQL logs contain `could not extend file` or `no space left on device`
- `df -h` shows the PostgreSQL volume mount at 100%

**Immediate action:**
```bash
# Confirm disk is full
df -h $(docker volume inspect knef-business-os_postgres_data --format '{{.Mountpoint}}')

# Stop write-heavy services to prevent further damage
docker compose stop api worker

# Free space: remove old backup files if they share the same disk
docker compose exec worker find /app/backups/daily -name 'knef_*.sql.gz*' -mtime +3 -delete

# If the database volume itself is on a separate mount, extend it via your hosting provider
```

**Recovery:** If PostgreSQL was able to checkpoint before running out of space, simply freeing disk space and restarting is sufficient. If the database is corrupt from a mid-write disk full event, proceed to Scenario B (DB corruption).

---

### Scenario B: Database corruption

**Symptoms:**
- PostgreSQL logs show `invalid page in block` or `relation ... does not exist` for system tables
- `prisma migrate status` fails with unexpected errors
- API logs show systematic Prisma `P2002`, `P2025` errors across unrelated operations

**Immediate action:**
```bash
# Stop all services
docker compose stop api worker web mcp-server caddy

# Attempt to assess damage
docker compose exec db psql -U knef -d knef_prod -c "SELECT COUNT(*) FROM users;"
# If this fails, proceed to full restore
```

**Recovery:** Full database restore from the most recent backup. See Section 4.

---

### Scenario C: Redis data loss

**Symptoms:**
- Worker logs show `MISCONF Redis is configured to save RDB snapshots`
- BullMQ jobs disappear from queues
- Rate limit and lockout state is lost

**Immediate action:**
```bash
# Check if the AOF file is intact
ls -lh $(docker volume inspect knef-business-os_redis_data --format '{{.Mountpoint}}')
# Look for appendonly.aof

# Restart Redis — it will replay the AOF file on startup
docker compose restart redis

# Verify queue state recovered
docker compose logs redis --since 60s | grep "DB loaded"
```

**Recovery:** Redis state is reconstructed from the append-only file (AOF) on restart. If the AOF is corrupt, Redis queue state is lost. Manually re-trigger any critical pending jobs (e.g., the backup job). Application data (PostgreSQL) is unaffected.

---

### Scenario D: Host server crash / total data loss

**Symptoms:**
- Server is unresponsive
- All Docker volumes are gone or inaccessible
- You are provisioning a new server

**Recovery:** Full recovery on a new server. See Section 4. Requires an off-server backup copy (on-server backups are also gone). This is why off-server backup transfer is critical.

---

### Scenario E: Accidental bulk delete or data mutation

**Symptoms:**
- User or operator ran a destructive SQL statement or API call that deleted or modified records incorrectly
- Application is still running normally; the problem is in the data, not the infrastructure

**Immediate action:**
```bash
# Stop the API and worker IMMEDIATELY to prevent further writes
docker compose stop api worker

# Assess the scope of deletion
docker compose exec db psql -U knef -d knef_prod -c "
  SELECT COUNT(*) FROM audit_log
  WHERE created_at > NOW() - INTERVAL '30 minutes'
  AND action LIKE '%DELETE%'
  ORDER BY created_at DESC;"
```

**Recovery:** Restore from the last backup prior to the accidental delete. If only a subset of data was affected, a selective restore (restore to a temporary database, extract the affected rows, reinsert) is preferable to a full restore. See Section 4 for the full restore procedure.

---

## 3. Backup Locations

### On-server (primary)

Backups are written to the Docker named volume `backups`, mounted at `/app/backups` inside the `api` and `worker` containers.

Files are stored at: `/app/backups/daily/knef_YYYYMMDD_HHMMSS.sql.gz[.gpg]`

```bash
# Find the host path for the backups volume
docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}'
# Typical output: /var/lib/docker/volumes/knef-business-os_backups/_data

# List available backups
docker compose exec worker ls -lth /app/backups/daily/
```

Retention: 7 days (configurable via `BACKUP_RETENTION_DAYS`).

### Off-server (required for DR)

The on-server backup volume is lost if the host server fails. You MUST maintain off-server copies.

**Recommended approach — rsync to a backup server:**
```bash
# Run this daily after the backup script completes (e.g., in a host cron at 02:30 UTC)
VOLUME_PATH=$(docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}')
rsync -avz --delete "${VOLUME_PATH}/daily/" backup-server:/backups/knef/
```

**Alternative — upload to S3-compatible object storage:**
```bash
VOLUME_PATH=$(docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}')
aws s3 sync "${VOLUME_PATH}/daily/" s3://your-bucket/knef/backups/ \
  --storage-class STANDARD_IA
```

**Minimum off-server retention:** 30 days.

If off-server copies are not configured, the RPO degrades to total data loss on host failure.

---

## 4. Restore Steps

This procedure restores the PostgreSQL database from a `.sql.gz` or `.sql.gz.gpg` backup file. It is destructive — the current database contents are replaced by the backup.

### Prerequisites

- You have the backup file accessible (either in the `backups` volume or transferred to the new server)
- You have `DATABASE_URL` and (if backup is encrypted) `BACKUP_ENCRYPTION_PASSPHRASE` available
- You have access to run `docker compose` commands on the server

### Step 1 — Stop all services that write to the database

```bash
cd /opt/knef-business-os
docker compose stop caddy web mcp-server api worker
docker compose ps  # confirm all are stopped; only db and redis should remain
```

### Step 2 — Identify the correct backup file

```bash
# List available backups (newest first)
docker compose exec -it db bash -c "ls -lth /tmp/" 2>/dev/null || \
docker compose exec worker ls -lth /app/backups/daily/

# Choose the most recent backup before the failure event
# Naming format: knef_YYYYMMDD_HHMMSS.sql.gz[.gpg]
# Example: knef_20261006_020000.sql.gz.gpg  (02:00 UTC on 2026-10-06)
```

If restoring from an off-server copy, transfer the backup file first:

```bash
# Copy from backup server to the backups volume
VOLUME_PATH=$(docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}')
scp backup-server:/backups/knef/knef_20261006_020000.sql.gz.gpg "${VOLUME_PATH}/daily/"
```

### Step 3 — Drop and recreate the database (for full restore)

If the restore is replacing a corrupt or wrong-state database, drop and recreate it first:

```bash
docker compose exec db psql -U knef -d postgres -c "DROP DATABASE IF EXISTS knef_prod;"
docker compose exec db psql -U knef -d postgres -c "CREATE DATABASE knef_prod OWNER knef;"
docker compose exec db psql -U knef -d knef_prod -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker compose exec db psql -U knef -d knef_prod -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Skip this step if the database is intact and you are doing a partial overwrite.

### Step 4 — Run the restore script

```bash
docker compose exec \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE}" \
  worker \
  ./scripts/restore.sh /app/backups/daily/knef_20261006_020000.sql.gz.gpg
```

The script will:
1. Print a warning and prompt you to type `RESTORE`
2. Decrypt (if `.gpg`), decompress, and pipe SQL to `psql`
3. Stop on first SQL error (`-v ON_ERROR_STOP=1`)

If the script exits successfully, proceed to Step 5.

If the script exits with error mid-restore, the database may be in a partial state. Repeat from Step 3.

### Step 5 — Re-apply any migrations newer than the backup

If you ran migrations since the backup was taken, re-apply them:

```bash
docker compose up -d api  # start api temporarily for migration command
docker compose exec api pnpm prisma migrate deploy
docker compose stop api   # stop again before full validation
```

If you are unsure which migrations are included in the backup, check:
```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

### Step 6 — Validate the restore (see Section 5)

Do not restart services until validation passes.

### Step 7 — Restart all services

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose ps  # confirm all healthy
curl http://localhost:4000/api/v1/health/ready
```

---

## 5. Validation After Restore

Run these checks before routing external traffic to the restored system.

### Check: API health

```bash
curl -sf http://localhost:4000/api/v1/health/live && echo "LIVE OK" || echo "LIVE FAIL"
curl -sf http://localhost:4000/api/v1/health/ready && echo "READY OK" || echo "READY FAIL"
```

Both must return `OK`.

### Check: Migration history matches expected

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

The most recent migration should be `0014_performance_indexes`. If a newer migration is missing, re-apply with `prisma migrate deploy`.

### Check: Row counts in key tables

Run these and compare against your known baseline or a screenshot from before the failure:

```bash
docker compose exec db psql -U knef -d knef_prod -c "
SELECT
  (SELECT COUNT(*) FROM users)         AS users,
  (SELECT COUNT(*) FROM organizations) AS organizations,
  (SELECT COUNT(*) FROM products)      AS products,
  (SELECT COUNT(*) FROM orders)        AS orders,
  (SELECT COUNT(*) FROM payments)      AS payments,
  (SELECT COUNT(*) FROM audit_log)     AS audit_log_entries;
"
```

If any count is unexpectedly zero or dramatically lower than expected, the wrong backup may have been restored, or the backup was incomplete.

### Check: pgvector extension present

```bash
docker compose exec db psql -U knef -d knef_prod -c "\dx vector"
# Should show the vector extension version
```

### Check: Encrypted fields are readable

Log in to the application and verify:
- AI chat responds (requires OPENAI/ANTHROPIC API key decryption)
- If Telegram integration is configured, check that the bot token loads without error in worker logs

### Check: Audit log continuity

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 10;"
```

The most recent audit log entry should be from before the failure event (not from before the backup date, if data was written after the last backup).

---

## 6. Application Rollback

Application rollback means reverting the Docker image to a previous version. It does NOT revert the database schema.

### When to roll back the application

- A new deployment introduced a bug causing API errors (5xx spike)
- A new deployment causes a startup crash (container restarts in loop)
- A business rule or UI change needs to be reverted immediately

### How to roll back the Docker image

```bash
# Build and tag images on deployment — always tag with the git commit SHA
# Example: images are tagged as knef-api:797d702 (current) and knef-api:4d6c5b3 (previous)

# Roll back the API image to the previous commit
docker compose stop api
docker compose up -d api --no-deps  # after updating image tag in compose file

# Or: if using image tags, update the image reference and restart
docker tag knef-api:4d6c5b3 knef-api:current
docker compose up -d --no-deps api
```

If images are not tagged with commit SHAs, roll back via git:

```bash
cd /opt/knef-business-os
git checkout 4d6c5b3  # previous working commit
docker compose build api worker web mcp-server
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### When schema rollback is UNSAFE

**Never run `prisma migrate reset` or manually revert migrations on a production database that has had any data written after the migration.**

Database schema rollbacks in Prisma require manually crafting a "down" migration. If migration `0014_performance_indexes` only adds indexes (no column drops, no NOT NULL constraints), rolling back the code while leaving the schema is safe — the application simply won't use the new indexes.

However, if a migration:
- Adds a `NOT NULL` column with no default
- Renames a column
- Drops a column or table
- Changes a column type

...then rolling back the application code while the new schema is deployed will cause the application to fail with schema mismatch errors. In this case, the correct approach is to roll forward (fix the bug and deploy a patched version), not to reverse the migration.

**Safe rollback scenarios (schema change in migration is additive only):**
- Rolling back from 0014 → 0013 if 0014 only adds indexes: safe, application works with or without those indexes

**Unsafe rollback scenarios:**
- Rolling back from a migration that added a required column: the old application code will try to read or write a column that no longer exists (or vice versa)

If unsure, consult the migration SQL file before attempting a code rollback:

```bash
cat /Users/macbook/Desktop/knef-business-os/packages/database/prisma/migrations/0014_performance_indexes/migration.sql
```

---

## 7. Decision Matrix

Use this matrix when a failure is detected to decide the correct recovery action.

| Situation | Recommended action | Do NOT do |
|-----------|-------------------|-----------|
| New deployment causes 5xx errors, DB schema unchanged | Roll back application image | Restore from backup |
| New deployment crashes on startup | Roll back application image | Restore from backup |
| Database records accidentally deleted by user | Stop writes → restore from last backup | Roll back application |
| Database corruption detected | Stop all services → full restore | Restart and hope |
| Redis queue data lost | Restart redis (AOF replay) → re-queue failed jobs | Restore DB backup |
| Disk full (DB volume) | Free disk space → restart DB → assess | Immediately restore |
| Host server completely lost | Provision new server → restore from off-server backup | — |
| New migration caused data issue | Roll forward with fix deployment | `migrate reset` |
| Schema rollback needed (additive-only migration) | Roll back application image, leave schema | Reverse migration SQL manually |
| Schema rollback needed (destructive migration) | Roll forward with a new corrective migration | Reverse migration SQL manually |
| Backup file cannot be decrypted | Verify `BACKUP_ENCRYPTION_PASSPHRASE` is correct; try the previous backup | Proceed without verification |

---

## 8. RPO and RTO Targets

### Recovery Point Objective (RPO)

| Condition | Maximum data loss |
|-----------|-----------------|
| Automated daily backup at 02:00 UTC, failure at 03:00 UTC | ~1 hour |
| Automated daily backup at 02:00 UTC, failure at 01:59 UTC next day | ~24 hours |
| Off-server backup not configured, host destroyed | All data since last off-server sync (potentially days or weeks) |

To improve RPO: schedule more frequent backups by adding additional BullMQ scheduled jobs pointing to the same `backup.sh` script, or configure logical replication to a standby server (not in V1.1 scope).

### Recovery Time Objective (RTO)

| Task | Estimated time |
|------|---------------|
| Diagnose failure type and decide action | 5–15 minutes |
| Provision new server (if needed) | 15–30 minutes |
| Transfer backup file from off-server storage | 5–20 minutes (depends on size and bandwidth) |
| Run restore script | 2–15 minutes (depends on database size) |
| Validate restore | 5–10 minutes |
| Start services and verify health | 5 minutes |
| **Total (application rollback, no DB restore)** | **~10 minutes** |
| **Total (DB restore, same server)** | **~30–45 minutes** |
| **Total (full disaster, new server)** | **~60–90 minutes** |

Target RTO of 1 hour is achievable for same-server restores. New-server recovery may exceed 1 hour if the backup file is large or if server provisioning takes time.

---

## 9. Contact / Escalation

V1.1 has no automated alerting or on-call rotation. Monitoring is manual.

**System operator:** joao.pinton@imeri.com

**Operator responsibilities:**
- Monitor the system with daily manual checks (see Operations Runbook Section 14)
- Respond to uptime monitor alerts (external HTTP check on `/api/v1/health/live`)
- Execute this recovery plan when a failure is detected
- Document each recovery event: date, failure type, backup used, data lost (if any), time to recovery

**Escalation:** There is no automated escalation in V1.1. If the operator is unavailable, the next person with server SSH access and knowledge of this document should act as primary responder.

**Before executing any recovery action:**
1. Document what you observed (symptoms, time of detection)
2. Take a screenshot or log export of the current state
3. Follow the Decision Matrix in Section 7
4. Log the recovery action taken and its outcome

---

## 10. Known Limitations

The following limitations apply to V1.1 and should be understood before relying on this recovery plan.

**No high availability (HA).** There is a single PostgreSQL instance and a single Redis instance. Any failure of these services results in application downtime. There is no automatic failover to a standby.

**No automatic failover.** If the host server becomes unresponsive, there is no mechanism to automatically promote a replica or switch DNS to a standby server. Manual intervention is required.

**Single server deployment.** All services (Caddy, Next.js, NestJS, Worker, MCP, PostgreSQL, Redis) run on the same physical or virtual server. A host-level failure (hardware, hypervisor, network) takes down the entire system simultaneously.

**RPO limited to daily backups.** Transactions committed in the hours between the last backup and a failure are unrecoverable unless PostgreSQL WAL archiving is configured (not in V1.1 scope). To improve RPO, configure more frequent backups or WAL shipping.

**Backup encryption key must be stored separately.** If `BACKUP_ENCRYPTION_PASSPHRASE` is stored only in the server's `.env` file and the server is destroyed, encrypted backups cannot be decrypted. Store this passphrase in a password manager or secrets vault that is independent of the server.

**Uploads volume not backed up.** Files uploaded by users (product images, documents) are stored in the `uploads` Docker volume. This volume is not included in the `backup.sh` script. A separate file backup mechanism (rsync, S3 sync) must be configured to protect these files.

**Redis queue state not backed up.** BullMQ job data (pending jobs, delayed jobs, retry queues) is stored in Redis. The AOF file provides crash recovery for Redis itself, but if the Redis volume is lost, all queued jobs are gone. Re-trigger critical scheduled jobs (backup, report generation) manually after a Redis volume restore.

**No point-in-time recovery (PITR).** Without WAL archiving, recovery can only restore to a backup snapshot timestamp, not to an arbitrary point in time. If you need PITR, configure PostgreSQL WAL archiving to an external store (e.g., `wal-g` + S3) — this is planned for a future release.
