# KNEF Business OS V1.1 — Operations Runbook

**System:** KNEF Business OS  
**Version:** V1.1 (branch `v1.1-development`, commit `797d702`)  
**Last updated:** 2026-10-06  
**Operator contact:** joao.pinton@imeri.com

---

## 1. Startup Procedure

Services must start in dependency order. Docker Compose `depends_on` with healthchecks enforces this automatically when using the production compose files, but manual awareness of the order matters during troubleshooting.

**Dependency order:** `db` → `redis` → `api` → `worker` → `web` → `mcp-server` → `caddy`

### Standard production startup

```bash
cd /opt/knef-business-os

# Start with both compose files (base + production overrides)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify all containers reached healthy/running state
docker compose ps
```

Expected output: all services show `Up` or `Up (healthy)`. The `api` container will show `(healthy)` once its internal healthcheck (`GET /api/v1/health/live`) passes.

### Starting individual services (targeted restart)

```bash
# Restart only the API (e.g., after config change)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api

# Restart only the worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps worker

# Restart only the MCP server
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps mcp-server
```

### Wait for readiness before routing traffic

After startup, confirm the API is ready to serve traffic (DB + Redis reachable) before considering the deployment complete:

```bash
curl -sf http://localhost:4000/api/v1/health/ready && echo "READY" || echo "NOT READY"
```

If `NOT READY`, check `docker compose logs api` and `docker compose logs db` for errors before proceeding.

---

## 2. Shutdown Procedure

Graceful shutdown preserves BullMQ queue state and prevents database connection errors in logs. Always stop application services before stopping infrastructure.

### Graceful full shutdown

```bash
cd /opt/knef-business-os

# Stop application-layer services first (caddy, mcp-server, web, api, worker)
docker compose stop caddy mcp-server web api worker

# Confirm they are stopped before stopping infrastructure
docker compose ps

# Stop infrastructure (db and redis) — data volumes are preserved
docker compose stop db redis
```

### Emergency stop (all at once)

```bash
docker compose down
# Volumes are NOT deleted — data persists in postgres_data and redis_data named volumes
```

Do NOT use `docker compose down -v` in production — that removes all named volumes including the database.

### Pre-shutdown checks

Before any planned shutdown, verify no active backup is running:

```bash
docker compose logs worker --since 5m | grep -i backup
```

If a backup is in progress (logged as `Starting PostgreSQL backup`), wait for `Backup complete` before stopping.

---

## 3. Health Checks

The system exposes two distinct health endpoints on the API container (internal port 4000, proxied through Caddy at your domain).

### Liveness — `GET /api/v1/health/live`

Checks whether the NestJS process is alive and responding. Does **not** check database or Redis. Returns immediately.

```bash
# Direct container check (from host)
curl http://localhost:4000/api/v1/health/live

# Via Caddy (from external)
curl https://yourdomain.com/api/v1/health/live
```

**Expected response:**
```json
{
  "status": "ok",
  "service": "knef-api",
  "uptime": 3842,
  "timestamp": "2026-10-06T14:23:01.000Z"
}
```

**What it means:** If liveness fails, the NestJS process has crashed. Docker will restart the container automatically (policy: `unless-stopped`). If liveness keeps failing after restarts, check `docker compose logs api` for a fatal startup error.

### Readiness — `GET /api/v1/health/ready`

Checks that both PostgreSQL (via Prisma ping) and Redis are reachable from the API container. This is what you check to confirm the system is ready to serve real traffic.

```bash
curl http://localhost:4000/api/v1/health/ready
```

**Expected response (all healthy):**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

**What it means:** If `database` is `down`, the API cannot serve requests — check `docker compose logs db`. If `redis` is `down`, BullMQ queues and rate limiting are broken — check `docker compose logs redis`. A failing readiness check means the container should not receive traffic but does NOT mean it should be restarted (the process itself is healthy).

### Docker internal healthcheck

The `api` container runs its own healthcheck defined in `docker-compose.yml`:

```bash
# See healthcheck status
docker inspect knef-business-os-api-1 --format='{{.State.Health.Status}}'
# Outputs: healthy | unhealthy | starting
```

If unhealthy, the last 5 check logs are visible via `docker inspect` in the `Health.Log` array.

---

## 4. Backup Procedure

Backups are performed by the BullMQ `BackupProcessor` in the `worker` container, which calls `scripts/backup.sh` via `child_process.spawn`. The script runs pg_dump, compresses with gzip, and optionally encrypts with GPG (AES-256) if `BACKUP_ENCRYPTION_PASSPHRASE` is set.

### Backup output location

Inside the worker container: `/app/backups/daily/`  
On the host: Docker named volume `backups` (inspect path with `docker volume inspect knef-business-os_backups`)

### Trigger a manual backup

```bash
# Execute backup script inside the worker container
docker compose exec worker bash /app/scripts/backup.sh

# The script outputs the final file path on stdout, e.g.:
# BACKUP_FILE=/app/backups/daily/knef_20261006_143000.sql.gz.gpg
# BACKUP_SIZE=4827136
```

Alternatively, run the script directly on the host if `DATABASE_URL` and `BACKUP_ENCRYPTION_PASSPHRASE` are in your shell environment:

```bash
export DATABASE_URL="postgresql://knef:PASSWORD@localhost:5432/knef_prod"
export BACKUP_ENCRYPTION_PASSPHRASE="your-passphrase"
./scripts/backup.sh
```

Note: In production, `db` is not exposed to the host port. Run inside the container.

### Verify a backup file

```bash
# List backups with sizes and dates
docker compose exec worker ls -lh /app/backups/daily/

# Verify a .gz.gpg backup (encrypted) — check it can be decrypted without fully restoring
docker compose exec worker bash -c '
  gpg --batch --yes \
    --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
    --decrypt /app/backups/daily/knef_20261006_143000.sql.gz.gpg \
  | gunzip | head -20
'

# Verify a .gz backup (unencrypted)
docker compose exec worker bash -c 'gunzip -c /app/backups/daily/knef_20261006_143000.sql.gz | head -20'

# The first lines should contain PostgreSQL dump header comments
```

### Retention policy

The script automatically deletes backup files older than `BACKUP_RETENTION_DAYS` (default: 7) days from `/app/backups/daily/`. Set `BACKUP_RETENTION_DAYS=14` in `.env` to extend retention.

### Off-server copy

The named volume is local to the server. Copy backups off-server regularly:

```bash
# Get the volume path on the host
VOLUME_PATH=$(docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}')

# Copy to a remote server
rsync -avz "${VOLUME_PATH}/daily/" backup-server:/backups/knef/daily/

# Or upload to S3
aws s3 sync "${VOLUME_PATH}/daily/" s3://your-bucket/knef/backups/daily/
```

---

## 5. Restore Procedure

The restore script (`scripts/restore.sh`) is a manual, operator-supervised operation. The worker never calls it. It will prompt for typed confirmation before overwriting the database.

### When to use restore

- Database corruption detected
- Accidental bulk delete of critical data
- Migrating to a new server
- Recovery from host crash with database volume loss

### How to invoke

```bash
# From within the worker container (recommended in production — has pg client tools)
docker compose exec worker bash

# Inside the container shell:
./scripts/restore.sh /app/backups/daily/knef_20261006_020000.sql.gz.gpg

# OR: for an unencrypted backup
./scripts/restore.sh /app/backups/daily/knef_20261006_020000.sql.gz
```

### What the script does

1. Validates the backup file exists
2. Prints a summary (file path, size) and a destructive-action warning
3. Prompts: **type `RESTORE` to confirm** (any other input aborts cleanly)
4. Parses `DATABASE_URL` from the environment — password never appears in process arguments
5. For `.gpg` files: decrypts using `BACKUP_ENCRYPTION_PASSPHRASE`, decompresses, pipes to `psql`
6. For `.gz` files: decompresses, pipes to `psql`
7. Uses `-v ON_ERROR_STOP=1` — aborts on first SQL error rather than continuing with a partial restore

### Pre-restore steps

```bash
# 1. Stop all services that write to the database
docker compose stop api worker mcp-server web caddy

# 2. Verify the backup file integrity (see Section 4)

# 3. Run the restore
docker compose exec -e DATABASE_URL="${DATABASE_URL}" \
  -e BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE}" \
  worker ./scripts/restore.sh /app/backups/daily/knef_20261006_020000.sql.gz.gpg

# 4. Restart all services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 5. Validate (see Disaster Recovery doc for full validation checklist)
curl http://localhost:4000/api/v1/health/ready
```

---

## 6. Database Migration

KNEF Business OS uses Prisma Migrations. There are currently 14 migrations (0001–0014) deployed to production.

**Rule:** Always use `prisma migrate deploy` in production — NEVER `prisma migrate dev` (which regenerates the dev history and can corrupt the production migration table) and NEVER `prisma migrate reset` (which drops all data).

### Pre-migration backup (mandatory)

```bash
# Take a backup before any migration
docker compose exec worker bash /app/scripts/backup.sh
# Confirm BACKUP_FILE is printed and non-zero size
```

### Run migrations

```bash
# Deploy all pending migrations
docker compose exec api pnpm prisma migrate deploy

# Expected output when all migrations are applied:
# Prisma Migrate applied the following migration(s):
#   0014_performance_indexes
# (or "All migrations have been applied" if nothing is pending)
```

### Check migration status

```bash
# View applied and pending migrations
docker compose exec api pnpm prisma migrate status
```

### Post-migration validation

```bash
# Confirm migration_lock.toml matches expected provider (postgresql)
docker compose exec api cat node_modules/.prisma/client/schema.prisma | head -5

# Confirm the API readiness health check passes (Prisma pool connects successfully)
curl http://localhost:4000/api/v1/health/ready
```

### Migration 0013 note

Migration `0013_payment_gateway_ref_unique` adds a unique constraint on `payment_gateway_ref`. If running this migration on a database with existing duplicate `payment_gateway_ref` values, the migration will fail. Check for duplicates before migrating:

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT payment_gateway_ref, COUNT(*) FROM payments WHERE payment_gateway_ref IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;"
```

If duplicates exist, resolve them manually before deploying migration 0013.

---

## 7. Worker Queue Management

The `worker` container runs BullMQ processors connected to Redis. Queues are persistent (Redis `appendonly yes`, `noeviction` policy) — jobs survive worker restarts.

### Check queue state (from worker container)

```bash
docker compose exec worker node -e "
const { Queue } = require('bullmq');
const q = new Queue('backup', { connection: { host: 'redis', port: 6379 } });
q.getJobCounts('waiting','active','failed','completed','delayed').then(c => {
  console.log(JSON.stringify(c, null, 2));
  process.exit(0);
});
"
```

### Inspect failed jobs via Redis directly

```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}"

# List all BullMQ queue names
KEYS bull:*:failed

# Count failed jobs in the backup queue
LLEN bull:backup:failed

# View the most recent failed job
LRANGE bull:backup:failed 0 0
```

### Restart the worker

```bash
# Restart cleanly — BullMQ will resume processing pending jobs automatically
docker compose restart worker

# Verify it started cleanly
docker compose logs worker --since 60s
```

### Clear failed jobs (after investigation)

Only clear failed jobs after you have diagnosed and documented the failure reason.

```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" DEL bull:backup:failed
```

### Trigger a manual backup job (via worker queue)

The automated backup runs daily at 02:00 UTC via a scheduled BullMQ job. To trigger immediately:

```bash
docker compose exec worker node -e "
const { Queue } = require('bullmq');
const q = new Queue('backup', { connection: { host: 'redis', port: 6379 } });
q.add('manual-backup', {}, { jobId: 'manual-' + Date.now() }).then(() => {
  console.log('backup job queued');
  process.exit(0);
});
"
```

---

## 8. Redis Operations

Redis is used for: BullMQ job queues, JWT blocklist (short-lived access token revocations), account lockout counters, rate limiting counters, and session state.

**Configuration in production:** `appendonly yes`, `maxmemory 256mb`, `maxmemory-policy noeviction` (prevents evicting queue data; OOM will reject writes instead of silently dropping jobs).

### Connect to Redis CLI

```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}"
```

### Check memory usage

```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" INFO memory | grep -E 'used_memory_human|maxmemory_human|mem_fragmentation_ratio'
```

Key metrics:
- `used_memory_human` — current usage
- `maxmemory_human` — limit (256mb)
- `mem_fragmentation_ratio` — above 1.5 indicates fragmentation; consider restart during low-traffic window

### Check keyspace

```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" INFO keyspace
# Shows db0 with key count and expiry counts
```

### Flush specific namespaces (cautiously)

Do NOT flush all of Redis — this will delete all BullMQ jobs, including pending and delayed jobs. To clear specific keys:

```bash
# Clear rate limiting counters only (safe, they regenerate)
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" --scan --pattern 'throttle:*' | xargs docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" DEL

# Clear account lockout keys only
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" --scan --pattern 'lockout:*' | xargs docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" DEL
```

**Never use `FLUSHDB` or `FLUSHALL` in production without first dumping and re-queuing any active BullMQ jobs.**

### Restart Redis

```bash
docker compose restart redis

# Redis persistence (AOF) will replay on start — jobs will be restored from disk
# Verify queue state is intact after restart
docker compose logs redis --since 30s | grep -i "DB loaded"
```

---

## 9. PostgreSQL Operations

### Connect to database

```bash
docker compose exec db psql -U knef -d knef_prod
```

### Check active connections

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT count(*), state FROM pg_stat_activity WHERE datname='knef_prod' GROUP BY state;"
```

Prisma uses a connection pool. Expected connections from `api`: 5–20 depending on load. If you see hundreds of connections in `idle` state, consider adding `connection_limit` to the DATABASE_URL.

### Check connection limit

```bash
docker compose exec db psql -U knef -d knef_prod -c "SHOW max_connections;"
# Default PostgreSQL: 100. The docker image may set this differently.
```

### Run VACUUM (maintenance)

PostgreSQL auto-vacuum runs automatically, but you can trigger manual vacuum after bulk deletes:

```bash
# Non-blocking: analyze statistics without locking
docker compose exec db psql -U knef -d knef_prod -c "VACUUM ANALYZE;"

# Full vacuum (table lock — only during maintenance window)
docker compose exec db psql -U knef -d knef_prod -c "VACUUM FULL VERBOSE;"
```

### Check table sizes

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
   FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 20;"
```

### Check disk space used by PostgreSQL volume

```bash
docker system df -v | grep postgres_data
# Or:
du -sh $(docker volume inspect knef-business-os_postgres_data --format '{{.Mountpoint}}')
```

### View PostgreSQL logs

```bash
docker compose logs db --since 1h | grep -i error
docker compose logs db -f  # tail live
```

### Slow query detection

```bash
docker compose exec db psql -U knef -d knef_prod -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
   AND state = 'active';"
```

---

## 10. Log Inspection

All containers log to Docker's default JSON logging driver. Use `docker compose logs` from the project directory.

### Which containers have meaningful logs

| Container | What it logs |
|-----------|-------------|
| `api` | HTTP requests, auth events, Prisma queries (debug mode), NestJS bootstrap |
| `worker` | BullMQ job start/complete/fail, backup script output |
| `web` | Next.js server-side rendering errors |
| `mcp-server` | MCP tool calls, API relay errors |
| `caddy` | Access logs (JSON) at `/var/log/caddy/access.log` inside container |
| `db` | PostgreSQL startup, connection errors, fatal errors |
| `redis` | Startup, AOF rewrite events, connection errors |

### Common log commands

```bash
# Tail all containers simultaneously
docker compose logs -f

# Tail a single service (most common)
docker compose logs -f api
docker compose logs -f worker

# Last 200 lines of API logs
docker compose logs api --tail=200

# Logs since a timestamp
docker compose logs api --since "2026-10-06T14:00:00"

# Grep for errors across all containers
docker compose logs --since 1h 2>&1 | grep -i error

# Caddy access log (structured JSON)
docker compose exec caddy tail -f /var/log/caddy/access.log | python3 -m json.tool
```

### API request logs

The NestJS API logs every request. Look for `[NestApplication]` for startup, `[ExceptionFilter]` for handled errors, and `[Prisma]` for DB query logs (only if `DATABASE_LOG_LEVEL=query` is set in `.env`).

---

## 11. Common Failures and Resolution

### API container won't start

**Symptom:** `docker compose ps` shows `api` as `Restarting` or `Exit 1`.

**Diagnose:**
```bash
docker compose logs api --tail=50
```

**Common causes:**
- Missing required environment variable: look for `Error: ... is required` or `Cannot read properties of undefined`
  - Fix: check `.env` file, ensure all variables from `.env.example` are set, then `docker compose up -d api`
- Port conflict: another process on port 4000
  - Fix: `lsof -i :4000`, stop the conflicting process
- Failed to connect to DB at startup (DB not yet healthy):
  - Fix: `docker compose up -d db`, wait for `pg_isready`, then `docker compose up -d api`
- Prisma schema/client out of sync (typically after a code change without rebuild):
  - Fix: `docker compose build api && docker compose up -d api`

### Database connection refused

**Symptom:** API logs show `ECONNREFUSED` or Prisma `P1001: Can't reach database server`.

**Diagnose:**
```bash
docker compose exec db pg_isready -U knef -d knef_prod
docker compose logs db --tail=30
```

**Common causes:**
- `db` container not running: `docker compose up -d db` and wait for healthcheck to pass
- Incorrect `DATABASE_URL` in `.env` (wrong host, port, password)
- PostgreSQL data volume permissions issue after host reboot: `docker compose logs db` will show the specific error

### Redis out of memory (OOM) or writes rejected

**Symptom:** Worker logs show `COMMAND_WRITE_OOM_ERROR` or BullMQ jobs stop processing.

**Diagnose:**
```bash
docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" INFO memory | grep used_memory_human
```

**Resolution:**
- Policy is `noeviction` — Redis will reject writes rather than drop job data
- Do NOT change to a non-noeviction policy while jobs are active (jobs would be silently lost)
- Investigate what is consuming memory: `MEMORY DOCTOR` in redis-cli
- Clear expendable namespaces (rate limit, lockout keys — see Section 8)
- If memory is genuinely exhausted by queue data: drain the queue (let jobs complete), then restart redis

### Worker stuck / jobs not processing

**Symptom:** Jobs are `waiting` in the queue but the worker is not picking them up.

**Diagnose:**
```bash
docker compose logs worker --tail=50
docker compose ps worker  # check if it's running
```

**Resolution:**
```bash
# Restart the worker — BullMQ will re-acquire job locks and resume
docker compose restart worker

# If worker is crash-looping, check for missing env vars or DB connection issues
docker compose logs worker --tail=100
```

BullMQ uses Redis-based locks with TTL. If the worker crashed while processing a job, the job will become `stalled` and be moved back to `waiting` automatically after the lock TTL expires (default: 30 seconds).

### Email delivery failure

**Symptom:** Users not receiving password reset, invite, or notification emails.

**Diagnose:**
```bash
# Look for SMTP errors in API logs
docker compose logs api --since 2h | grep -i smtp
docker compose logs api --since 2h | grep -i "mail\|email\|nodemailer"
```

**Common causes:**
- SMTP credentials wrong or expired: update `SMTP_USER`/`SMTP_PASS` in `.env`, restart api
- SMTP port blocked by server firewall: test with `docker compose exec api nc -zv ${SMTP_HOST} ${SMTP_PORT}`
- Rate limit from email provider: check provider dashboard for daily send limits
- `SMTP_FROM_EMAIL` domain not verified with provider: verify SPF/DKIM records

---

## 12. Secret Rotation

### JWT Secret rotation (`JWT_SECRET`, `JWT_REFRESH_SECRET`)

**Downtime impact:** All existing access tokens and refresh tokens are invalidated immediately. All users are logged out.

**Procedure:**
1. Generate new secrets: `openssl rand -hex 64`
2. Update `.env` with new values
3. Restart API: `docker compose restart api`
4. All users must log in again — no data loss

**Safe window:** Rotate during low-traffic hours. Notify users of forced logout beforehand if possible.

### ENCRYPTION_KEY rotation

**Downtime impact:** Significant. All encrypted fields in the database (AI API keys, SMTP credentials, OAuth tokens, Telegram bot token, 2FA secrets) must be re-encrypted with the new key. This requires a custom migration script.

**Procedure:**
1. Take a full backup first (mandatory)
2. Write and test a migration script that reads each encrypted field with the old key, decrypts, re-encrypts with the new key, and writes back
3. Stop all services that read encrypted fields (api, worker)
4. Run the migration script
5. Update `.env` with new `ENCRYPTION_KEY`
6. Restart api and worker
7. Validate that encrypted features work (AI, SMTP, Telegram)

**Do not attempt in-place rotation without the re-encryption script.** If `ENCRYPTION_KEY` is changed without re-encrypting data, all encrypted fields become unreadable and features will fail silently.

### Database password rotation (`DB_PASSWORD`)

**Downtime impact:** API and worker lose database connectivity until restarted with the new password.

**Procedure:**
1. Change password in PostgreSQL: `docker compose exec db psql -U knef -d knef_prod -c "ALTER USER knef PASSWORD 'newpassword';"`
2. Update `DB_PASSWORD` and `DATABASE_URL` in `.env`
3. Restart api and worker: `docker compose restart api worker`
4. Verify readiness: `curl http://localhost:4000/api/v1/health/ready`

### Payment provider webhook secrets

**Downtime impact:** Incoming webhooks will fail signature validation during the transition window (brief — only between provider updating their secret and your server being updated).

**Procedure:**
1. Update secret in provider dashboard (Paystack / Flutterwave)
2. Update `PAYSTACK_WEBHOOK_SECRET` or `FLUTTERWAVE_WEBHOOK_SECRET` in `.env`
3. Restart api: `docker compose restart api`
4. Test with a provider test webhook

### External API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)

**Downtime impact:** AI features will fail between key revocation at provider and restart.

**Procedure:**
1. Generate new key at provider dashboard
2. Update key in `.env`
3. Restart api: `docker compose restart api`
4. Revoke old key at provider dashboard (after confirming new key works)

---

## 13. Admin Bootstrap

On a fresh production install, there is no admin user. The seed script creates system data (roles, permissions, feature flags) but does NOT create an admin user when `NODE_ENV=production`.

### Run seed (idempotent — safe to re-run)

```bash
docker compose exec api pnpm prisma db seed
```

The seed script creates roles and permissions, and skips the demo admin user (`admin@knef.local`) when `NODE_ENV=production`. It uses upsert operations and is safe to run multiple times.

### Create the first Super Admin

After seeding, create the first admin user via the CLI command:

```bash
docker compose exec api pnpm run cli:create-admin
# The CLI will prompt for email, name, and password
```

If no CLI command exists or it fails, create the admin directly via Prisma:

```bash
# Generate a bcrypt hash of your chosen password (cost factor 12)
docker compose exec api node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('YourSecurePassword123!', 12).then(h => console.log(h));
"

# Then insert the admin user
docker compose exec db psql -U knef -d knef_prod -c "
INSERT INTO users (id, email, name, password_hash, role, is_active, organization_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@yourdomain.com',
  'System Administrator',
  '\$2b\$12\$YOUR_HASH_HERE',
  'SUPER_ADMIN',
  true,
  (SELECT id FROM organizations LIMIT 1),
  NOW(), NOW()
);"
```

### Change the default password immediately

If the seed created `admin@knef.local / Admin123!` (only in non-production environments), change the password immediately via the web UI or API before exposing the system externally.

---

## 14. Alerting / Monitoring

V1.1 does not include automated alerting (no PagerDuty, no Prometheus). Monitoring is manual for this release.

### Recommended manual checks (daily)

```bash
# 1. All containers running and healthy
docker compose ps

# 2. API liveness
curl -sf http://localhost:4000/api/v1/health/live

# 3. API readiness (DB + Redis)
curl -sf http://localhost:4000/api/v1/health/ready

# 4. Disk space (backups volume and DB volume)
df -h
du -sh $(docker volume inspect knef-business-os_postgres_data --format '{{.Mountpoint}}')
du -sh $(docker volume inspect knef-business-os_backups --format '{{.Mountpoint}}')

# 5. Backup ran last night
docker compose exec worker ls -lth /app/backups/daily/ | head -5

# 6. Error count in last 24 hours
docker compose logs --since 24h 2>&1 | grep -ci error
```

### Uptime monitoring (recommended)

Set up an external uptime monitor (e.g., UptimeRobot free tier, Better Uptime) pointing to:
- `https://yourdomain.com/api/v1/health/live` — 30-second interval, HTTP 200 expected

This will alert you if the server or Caddy is down without requiring any in-server tooling.

### Disk space thresholds

| Threshold | Action |
|-----------|--------|
| >70% disk used | Investigate — clean old Docker images, reduce retention |
| >85% disk used | Urgent — extend volume or delete old backups immediately |
| >95% disk used | Critical — PostgreSQL will start failing writes |

```bash
# Clean up unused Docker images (does not affect running containers)
docker image prune -f
docker builder prune -f
```

### Log rotation

Docker JSON logs can grow unboundedly. Add log rotation to `/etc/docker/daemon.json` on the host:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Restart Docker daemon after changing: `sudo systemctl restart docker`. This applies to all new containers.
