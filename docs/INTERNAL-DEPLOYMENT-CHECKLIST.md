# KNEF Business OS V1.1 — Internal Deployment Checklist

**System:** KNEF Business OS  
**Version:** V1.1 (branch `v1.1-development`, commit `797d702`)  
**Last updated:** 2026-10-06  
**Operator:** ___________________________  
**Deployment date/time:** ___________________________  
**Target commit SHA:** ___________________________

---

> Complete every item in order. Do not skip sections. Mark each item `[x]` only after you have confirmed it — not before. If any item fails, stop and resolve before continuing.

---

## Section 1 — Pre-Deployment

### 1.1 Backup

- [ ] **Verify last automated backup ran and succeeded.**
  ```bash
  docker compose exec worker ls -lth /app/backups/daily/ | head -5
  # Confirm the most recent file is from today or last night and is non-zero size
  ```

- [ ] **Take a manual pre-deployment backup right now.**
  ```bash
  docker compose exec worker bash /app/scripts/backup.sh
  # Wait for: "Backup complete: /app/backups/daily/knef_TIMESTAMP.sql.gz[.gpg] (N bytes)"
  # Record the backup filename here: _______________________________
  ```

- [ ] **Confirm the backup file is non-zero and readable.**
  ```bash
  docker compose exec worker ls -lh /app/backups/daily/ | head -3
  # Encrypted backup: verify it can be decrypted (first 5 lines)
  docker compose exec worker bash -c '
    gpg --batch --yes --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" \
      --decrypt /app/backups/daily/knef_TIMESTAMP.sql.gz.gpg | gunzip | head -5'
  # Should print PostgreSQL dump header: "-- PostgreSQL database dump"
  ```

- [ ] **Confirm backup is also stored off-server** (rsync or S3 sync ran, or run it now).

### 1.2 Docker Images

- [ ] **Build new Docker images for all services.**
  ```bash
  cd /opt/knef-business-os
  git pull origin v1.1-development
  git log --oneline -3  # confirm correct commit is checked out

  docker compose -f docker-compose.yml -f docker-compose.prod.yml build \
    --no-cache api worker web mcp-server
  ```
  Build must complete without errors. Record build time: _______

- [ ] **Confirm images were built successfully.**
  ```bash
  docker images | grep knef
  # All four images (api, worker, web, mcp-server) should have a recent timestamp
  ```

### 1.3 Environment File

- [ ] **Review `.env` for correctness before deployment.**
  ```bash
  # Check file exists and is not empty
  wc -l /opt/knef-business-os/.env

  # Confirm critical variables are set (values are not shown)
  grep -E "^(NODE_ENV|DATABASE_URL|REDIS_URL|JWT_SECRET|ENCRYPTION_KEY|APP_URL)=" \
    /opt/knef-business-os/.env
  ```
  All six variables must be present and non-empty.

- [ ] **`NODE_ENV=production` is set.**
  ```bash
  grep "^NODE_ENV=" /opt/knef-business-os/.env
  # Must output: NODE_ENV=production
  ```

- [ ] **`APP_URL` matches the actual domain in use.**
  ```bash
  grep "^APP_URL=" /opt/knef-business-os/.env
  # e.g., APP_URL=https://yourdomain.com
  ```

- [ ] **`DATABASE_URL` points to `db:5432` (not `localhost`).**
  ```bash
  grep "^DATABASE_URL=" /opt/knef-business-os/.env
  # Must contain @db:5432 — not localhost or 127.0.0.1
  ```

- [ ] **`REDIS_URL` points to `redis:6379` (not `localhost`).**
  ```bash
  grep "^REDIS_URL=" /opt/knef-business-os/.env
  # Must contain redis://redis:6379
  ```

### 1.4 Secrets Confirmed

- [ ] **`JWT_SECRET` is a 64-character hex string (minimum).**
  ```bash
  JWT_LEN=$(grep "^JWT_SECRET=" /opt/knef-business-os/.env | cut -d= -f2 | tr -d '\n' | wc -c)
  echo "JWT_SECRET length: ${JWT_LEN}"
  # Must be >= 64
  ```

- [ ] **`JWT_REFRESH_SECRET` is set and different from `JWT_SECRET`.**

- [ ] **`ENCRYPTION_KEY` is a 32-byte (64-character) hex string.**
  ```bash
  ENC_LEN=$(grep "^ENCRYPTION_KEY=" /opt/knef-business-os/.env | cut -d= -f2 | tr -d '\n' | wc -c)
  echo "ENCRYPTION_KEY length: ${ENC_LEN}"
  # Must be 64
  ```

- [ ] **`BACKUP_ENCRYPTION_PASSPHRASE` is set and stored in your password manager separately from this server.**

- [ ] **Payment webhook secrets are set** (`PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_WEBHOOK_SECRET`) if payment features are active.

### 1.5 No Secrets in Git

- [ ] **Confirm `.env` is not tracked by git.**
  ```bash
  git -C /opt/knef-business-os ls-files .env
  # Must output nothing — if it outputs ".env", STOP. The secret file is tracked. Remove it from git immediately.
  ```

- [ ] **Confirm `.gitignore` covers `.env` files.**
  ```bash
  git -C /opt/knef-business-os check-ignore -v .env
  # Must show the ignore rule, e.g.: .gitignore:1:.env
  ```

---

## Section 2 — Migration

### 2.1 Pre-Migration Backup (Mandatory)

- [ ] **Pre-migration backup was taken in Section 1.1 and is verified.** (Do not proceed without this.)
  Backup filename confirmed: _______________________________

### 2.2 Run Migrations

- [ ] **Check current migration status before deploying.**
  ```bash
  docker compose exec api pnpm prisma migrate status
  # Note any pending migrations here: _______________________________
  # If no pending migrations: mark this section complete and skip 2.3
  ```

- [ ] **Deploy pending migrations.**
  ```bash
  docker compose exec api pnpm prisma migrate deploy
  # Expected: lists which migrations were applied, then exits 0
  # If it errors, STOP. Do not proceed. Investigate the error.
  ```

### 2.3 Validate Schema After Migration

- [ ] **Confirm all 14 migrations are applied.**
  ```bash
  docker compose exec db psql -U knef -d knef_prod -c \
    "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at ASC;"
  # Must show 0001_init through 0014_performance_indexes — all with non-null finished_at
  ```

- [ ] **No migrations show `NULL` for `finished_at` (failed mid-apply).**
  ```bash
  docker compose exec db psql -U knef -d knef_prod -c \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL;"
  # Must return 0 rows
  ```

### 2.4 Migration 0013 Unique Constraint Check

This check is only required if migration 0013 (`0013_payment_gateway_ref_unique`) is being applied for the first time on this database.

- [ ] **If deploying 0013 for the first time: confirm no duplicate `payment_gateway_ref` values.**
  ```bash
  docker compose exec db psql -U knef -d knef_prod -c "
    SELECT payment_gateway_ref, COUNT(*)
    FROM payments
    WHERE payment_gateway_ref IS NOT NULL
    GROUP BY payment_gateway_ref
    HAVING COUNT(*) > 1;"
  # Must return 0 rows. If duplicates exist, resolve before deploying.
  ```
  Mark N/A if 0013 was already applied: `[ ] N/A — 0013 already applied`

---

## Section 3 — Service Startup

### 3.1 Start Services in Order

- [ ] **Ensure `db` is running and healthy before starting application services.**
  ```bash
  docker compose up -d db redis
  # Wait for healthchecks to pass
  docker compose ps db redis
  # Both must show (healthy)

  # Poll until ready (max 60 seconds)
  for i in $(seq 1 12); do
    docker compose exec db pg_isready -U knef -d knef_prod && break
    sleep 5
  done
  ```

- [ ] **`db` healthcheck passes.**
  ```bash
  docker inspect knef-business-os-db-1 --format='{{.State.Health.Status}}'
  # Must output: healthy
  ```

- [ ] **`redis` healthcheck passes.**
  ```bash
  docker inspect knef-business-os-redis-1 --format='{{.State.Health.Status}}'
  # Must output: healthy
  ```

- [ ] **Start `api` and `worker`.**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api worker
  # Wait 40 seconds for the api start_period healthcheck
  sleep 40
  docker compose ps api worker
  ```

- [ ] **`api` healthcheck passes (shows `healthy`).**
  ```bash
  docker inspect knef-business-os-api-1 --format='{{.State.Health.Status}}'
  # Must output: healthy
  # If "unhealthy", check: docker compose logs api --tail=50
  ```

- [ ] **`worker` is running (not restarting).**
  ```bash
  docker compose ps worker
  # Status column must show "Up" — not "Restarting" or "Exit"
  ```

- [ ] **Start `web`, `mcp-server`, and `caddy`.**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d web mcp-server caddy
  docker compose ps
  # All 7 services must show Up
  ```

### 3.2 Health Check — Liveness

- [ ] **API liveness endpoint returns 200 with `status: ok`.**
  ```bash
  curl -sf http://localhost:4000/api/v1/health/live
  # Expected: {"status":"ok","service":"knef-api","uptime":...}
  ```

### 3.3 Health Check — Readiness

- [ ] **API readiness endpoint confirms DB and Redis are reachable.**
  ```bash
  curl -sf http://localhost:4000/api/v1/health/ready
  # Expected: {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},...}
  ```

  If `database` shows `down`: check `docker compose logs db` and `docker compose logs api`.  
  If `redis` shows `down`: check `docker compose logs redis` and `docker compose logs api`.

- [ ] **Caddy is serving HTTPS correctly.**
  ```bash
  curl -sf https://yourdomain.com/api/v1/health/live
  # Same response as above, now via Caddy TLS
  ```

---

## Section 4 — Smoke Tests

Complete these tests manually by navigating the web application and hitting the API.

### 4.1 Authentication

- [ ] **Log in with the production admin account.**
  - Navigate to `https://yourdomain.com/login`
  - Enter admin credentials
  - Confirm redirect to the dashboard — no error page

- [ ] **Log out and log back in** to confirm refresh token flow works.

### 4.2 Dashboard and Core Navigation

- [ ] **Dashboard loads without JavaScript errors.**
  - Open browser developer tools → Console
  - Navigate to dashboard
  - No `Uncaught Error` or `Failed to fetch` messages

- [ ] **Dashboard KPI cards display data** (revenue, orders, customers — not all zeros unless the system is newly installed).

- [ ] **Product list page loads** (`/products`)
  - At least the column headers render
  - No 500 error in the network tab

- [ ] **Sales order list loads** (`/sales`)

- [ ] **Customer list loads** (`/customers`)

### 4.3 API Health via HTTP

- [ ] **API liveness via HTTPS (external path):**
  ```bash
  curl -w "\n%{http_code}" https://yourdomain.com/api/v1/health/live
  # Last line must be: 200
  ```

- [ ] **API readiness via HTTPS (external path):**
  ```bash
  curl -w "\n%{http_code}" https://yourdomain.com/api/v1/health/ready
  # Last line must be: 200
  ```

### 4.4 Worker and Redis Connectivity

- [ ] **Worker connected to Redis (no connection errors in logs).**
  ```bash
  docker compose logs worker --since 5m | grep -i "error\|ECONNREFUSED"
  # Must return no output (no errors)
  ```

- [ ] **BullMQ scheduler registered (scheduled backup job present).**
  ```bash
  docker compose logs worker --since 5m | grep -i "scheduler\|cron\|backup"
  # Should show job registration messages from startup
  ```

- [ ] **Redis `PING` responds:**
  ```bash
  docker compose exec redis redis-cli -a "${REDIS_PASSWORD:-changeme}" PING
  # Must output: PONG
  ```

### 4.5 MCP Server

- [ ] **MCP server is running (not restart-looping).**
  ```bash
  docker compose ps mcp-server
  # Status: Up
  docker compose logs mcp-server --since 2m | grep -i error
  # Should return no critical errors
  ```

---

## Section 5 — Post-Deployment

### 5.1 Log Review

- [ ] **Review API logs for errors in the first 5 minutes after startup.**
  ```bash
  docker compose logs api --since 5m | grep -iE "error|exception|fatal|warn"
  # Acceptable: occasional WARN from NestJS throttler or non-critical warnings
  # Not acceptable: repeated ERROR, FATAL, Prisma P2 codes, or ECONNREFUSED
  ```

- [ ] **Review worker logs for errors.**
  ```bash
  docker compose logs worker --since 5m | grep -iE "error|exception|fatal"
  # Not acceptable: repeated connection errors or job processor failures
  ```

- [ ] **Review Caddy access logs for 5xx responses.**
  ```bash
  docker compose exec caddy tail -n 50 /var/log/caddy/access.log | \
    python3 -c "
import sys, json
for line in sys.stdin:
    try:
        entry = json.loads(line)
        status = entry.get('resp_headers', {}).get('status') or entry.get('status', 0)
        if isinstance(status, int) and status >= 500:
            print(line.strip())
    except: pass
"
  # Must produce no output (no 5xx responses logged)
  ```

### 5.2 Backup Schedule

- [ ] **Confirm the automated backup scheduler is active.**
  ```bash
  docker compose logs worker --since 5m | grep -i "backup\|schedule\|cron"
  # Should show: backup job scheduled for 02:00 UTC (or similar)
  ```
  If the backup job is not scheduled, check `BACKUP_DIR` and `DATABASE_URL` are set in `.env` and restart the worker.

### 5.3 Deployment Log

- [ ] **Record this deployment in the deployment log.**

  Fill in the following and append to `/opt/knef-business-os/DEPLOY_LOG.txt` (or your preferred log):

  ```
  Date:          2026-10-06
  Time:          ___:___ UTC
  Operator:      ___________________________
  Commit SHA:    797d702
  Branch:        v1.1-development
  Migrations:    [ ] None  [ ] Applied: _______________________________
  Pre-deploy backup: /app/backups/daily/_____________________________.sql.gz.gpg
  Issues during deploy: [ ] None  [ ] Issues: ________________________
  Rollback taken: [ ] No  [ ] Yes — reason: __________________________
  Post-deploy status: [ ] All checks passed  [ ] Issues: _____________
  ```

---

## Section 6 — Rollback Trigger

Initiate rollback if any of the following are true after deployment:

| Trigger | Threshold |
|---------|-----------|
| API returning 5xx errors | >5% of requests for more than 2 minutes |
| API container restart-looping | 3 or more restarts in 5 minutes |
| Database unavailable | Readiness check `database: down` persisting >2 minutes after startup |
| Business-critical feature broken | Login fails, or orders cannot be created (blocking all sales) |
| Migration failure mid-apply | `pnpm prisma migrate deploy` exits non-zero |

### How to roll back the application image

```bash
cd /opt/knef-business-os

# 1. Stop application services (not db/redis — data must be preserved)
docker compose stop caddy web mcp-server api worker

# 2. Check out the previous working commit
git log --oneline -5  # identify the previous commit SHA
git checkout 4d6c5b3  # substitute the actual previous SHA

# 3. Rebuild images from the previous commit
docker compose -f docker-compose.yml -f docker-compose.prod.yml build \
  --no-cache api worker web mcp-server

# 4. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 5. Verify health
curl -sf http://localhost:4000/api/v1/health/ready && echo "READY" || echo "STILL FAILING"
```

### When NOT to run `prisma migrate reset`

**Never run `prisma migrate reset` on a production database.** This command drops all tables and re-runs migrations from scratch. It is equivalent to wiping the entire database and will result in total data loss.

If a migration caused the failure, the correct action is:

1. Roll back the application code to the version before the migration was introduced
2. The database schema remains at the newer state — this is safe as long as the rollback code does not depend on columns that the migration dropped
3. Write and deploy a corrective forward migration to fix the schema issue
4. Redeploy the application with the corrective migration

If a migration deployed partially (exits mid-run), check `_prisma_migrations` for a row with `finished_at IS NULL` and resolve that specific migration manually with the DBA before redeploying. Contact the development team before modifying the `_prisma_migrations` table directly.
