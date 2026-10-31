# KNEF Business OS — Operations Runbook

## Starting the system (Production)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

REDIS_PASSWORD must be set in .env before starting. Example:
```
REDIS_PASSWORD=<strong-random-password-min-32-chars>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
```

## Viewing logs
```bash
docker compose logs -f api
docker compose logs -f web
```

## Database backup (manual)
```bash
bash scripts/backup.sh
```

## Database restore
```bash
gunzip -c backup.sql.gz | gpg -d | psql $DATABASE_URL
```

## Running migrations
```bash
docker compose exec api npx prisma migrate deploy
```

## Restarting a service
```bash
docker compose restart api
```

## Checking health
```bash
curl https://your-domain.com/api/v1/health
```

## Common issues
- **API not starting**: check DATABASE_URL and run prisma migrate deploy
- **401 Unauthorized**: JWT_SECRET mismatch between API instances
- **Slow queries**: check api logs for "Slow query" warnings
