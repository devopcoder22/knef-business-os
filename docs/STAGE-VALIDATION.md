# Stage Validation Environment

A fully isolated local Docker Compose stack for migration testing, UAT, and feature validation before production deploys. It shares no database, Redis, volumes, queues, or secrets with production.

## Port allocation

| Service    | Host port | Container port |
|------------|-----------|----------------|
| PostgreSQL | 5434      | 5432           |
| Redis      | 6381      | 6379           |
| API        | 4001      | 4000           |
| Admin web  | 3003      | 3000           |
| Storefront | 3004      | 3001           |
| MCP server | 4102      | 4100           |

## Starting the stack

```bash
# From repo root — build fresh images and bring up all services
docker compose -f docker-compose.yml -f docker-compose.stage-validation.yml \
  --project-name knef-stage-validation up -d --build

# Run pending migrations against the isolated DB
DATABASE_URL=postgresql://knef:stage_validation_password@localhost:5434/knef_stage_validation \
  npx prisma migrate deploy --schema packages/database/prisma/schema.prisma

# Check health
./scripts/stage-validation-health.sh
```

## Stopping / tearing down

```bash
# Stop containers, keep volumes (data preserved)
docker compose -f docker-compose.yml -f docker-compose.stage-validation.yml \
  --project-name knef-stage-validation down

# Full teardown including volumes (data destroyed)
docker compose -f docker-compose.yml -f docker-compose.stage-validation.yml \
  --project-name knef-stage-validation down -v
```

## Environment files

| File | Purpose |
|------|---------|
| `apps/api/.env.stage-validation` | API + Worker env vars (isolated secrets, all outbound integrations disabled) |
| `apps/storefront/.env.stage-validation` | Storefront env vars (JWT secret must match API) |
| `docker-compose.stage-validation.yml` | Compose overrides for port offsets and env files |

All three files are gitignored. Secrets are local-only and not shared with production.

## Safety invariants

- **`SOCIAL_PUBLISHING_ENABLED=false`** — no outbound publishing to any social platform
- **`SMTP_HOST=`** — empty, so email is logged not sent
- **`TELEGRAM_BOT_TOKEN=NOT_CONFIGURED`** — no Telegram messages
- **All OAuth credentials `NOT_CONFIGURED`** — OAuth flows will fail safely
- **Separate Compose project name** (`knef-stage-validation`) — Docker creates isolated named volumes; no overlap with `knef-business-os` production volumes or `knef-uat` volumes
- **DB**: `knef_stage_validation` (separate from `knef_prod` and `knef_uat`)
- **All secrets freshly generated** — no shared keys with production

## After first login

Replace placeholders in both env files and restart:

```bash
# 1. Log in to Admin web at http://localhost:3003
# 2. Go to Settings → E-commerce → API Keys → create key
# 3. Note the Organization ID and Location ID from Settings → Organization / Locations
# 4. Update both env files with real values
# 5. Restart storefront
docker compose -f docker-compose.yml -f docker-compose.stage-validation.yml \
  --project-name knef-stage-validation restart storefront
```

## Running migrations on the isolated DB

```bash
# Forward-only migration deploy (never reset/drop)
DATABASE_URL=postgresql://knef:stage_validation_password@localhost:5434/knef_stage_validation \
  npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

## Difference from UAT environment

| | UAT (`knef-uat`) | Stage validation (`knef-stage-validation`) |
|---|---|---|
| Purpose | Acceptance testing pre-production | Migration testing, Stage 24 feature validation |
| DB | `knef_uat` (port 5433) | `knef_stage_validation` (port 5434) |
| Redis | port 6380 | port 6381 |
| API | port 4000 | port 4001 |
| Admin web | port 3002 | port 3003 |
| Storefront | port 3001 | port 3004 |
| Stage 24E social publishing | not configured | explicitly disabled |
