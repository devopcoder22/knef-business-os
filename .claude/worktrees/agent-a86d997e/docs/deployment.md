# KNEF Business OS — Deployment Guide

> **Target:** Ubuntu Server + Docker Compose  
> **Last updated:** 2026-09-29

---

## 1. Architecture

```
Ubuntu Server (VPS / Dedicated)
  └── Docker Compose
       ├── caddy        (HTTPS reverse proxy, ports 80/443)
       ├── web          (Next.js, internal :3000)
       ├── api          (NestJS, internal :4000)
       ├── worker       (BullMQ processor, no external port)
       ├── telegram     (Telegram bot, no external port)
       ├── db           (PostgreSQL 16 + pgvector, internal :5432)
       └── redis        (Redis 7, internal :6379)

Docker networks:
  public:   caddy, web, api
  internal: api, worker, telegram, db, redis
```

No service except `caddy` listens on a public port.

---

## 2. Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 40 GB SSD | 100 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Docker | 24+ | latest stable |

---

## 3. First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url> /opt/knef-business-os
cd /opt/knef-business-os

# 2. Copy and fill environment file
cp .env.example .env
nano .env   # fill all required values

# 3. Run setup script (installs Docker if needed, creates volumes)
chmod +x scripts/setup-dev.sh
./scripts/setup.sh

# 4. Start services
docker compose up -d

# 5. Run database migrations
docker compose exec api pnpm prisma migrate deploy

# 6. Seed initial data (roles, permissions, feature flags)
docker compose exec api pnpm prisma db seed

# 7. Create Super Admin account
docker compose exec api pnpm run cli:create-admin
```

---

## 4. Environment Variables

See `.env.example` for all variables. Critical ones:

```bash
# Application
NODE_ENV=production
APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://knef:PASSWORD@db:5432/knef_prod

# Redis
REDIS_URL=redis://redis:6379

# Security — generate with: openssl rand -hex 64
JWT_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>

# Encryption — generate with: openssl rand -hex 32
ENCRYPTION_KEY=<32-byte-hex>

# AI providers (at least one required for AI features)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Payments
PAYSTACK_SECRET_KEY=
PAYSTACK_WEBHOOK_SECRET=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_WEBHOOK_SECRET=

# Email (default SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=noreply@knefgadgets.com
SMTP_FROM_NAME=KNEF Gadgets
```

---

## 5. Updates

```bash
cd /opt/knef-business-os
git pull origin main
docker compose build
docker compose up -d
docker compose exec api pnpm prisma migrate deploy
```

Zero-downtime updates: use `docker compose up -d --no-deps --build api` to rebuild and restart one service without stopping others.

---

## 6. Backups

### Automated backup (via cron)

```bash
# Add to crontab: crontab -e
0 2 * * * /opt/knef-business-os/scripts/backup.sh >> /var/log/knef-backup.log 2>&1
```

### Manual backup

```bash
./scripts/backup.sh
# Creates: /opt/knef-backups/daily/knef_2026-09-29_02-00.sql.gz.gpg
```

### Restore

```bash
./scripts/restore.sh /opt/knef-backups/daily/knef_2026-09-29_02-00.sql.gz.gpg
```

### Retention

- Daily: 7 days
- Weekly: 4 weeks
- Monthly: 3 months

---

## 7. Health Monitoring

```bash
# Check all services
docker compose ps

# View logs
docker compose logs -f api
docker compose logs -f worker

# Health endpoints
curl https://yourdomain.com/api/v1/health
curl https://yourdomain.com/api/v1/readiness
```

---

## 8. Disaster Recovery

To restore on a new server:

```bash
# 1. Set up new server with Docker
# 2. Clone repository
# 3. Copy .env file from secure backup
# 4. Start database container only
docker compose up -d db

# 5. Restore backup
./scripts/restore.sh /path/to/backup.sql.gz.gpg

# 6. Start all services
docker compose up -d

# 7. Verify health
curl http://localhost:4000/health
```

Full recovery time objective (RTO): < 2 hours.  
Recovery point objective (RPO): < 24 hours (last nightly backup).

---

## 9. Development Environment

```bash
# Start dev environment (hot reload, no SSL)
docker compose -f docker-compose.dev.yml up -d

# The API is available at http://localhost:4000
# The web app is at http://localhost:3000
# API docs at http://localhost:4000/api/docs
```

---

## 10. Production Hardening Checklist

Before going live, verify each item:

- [ ] Set strong JWT_SECRET and JWT_REFRESH_SECRET (min 32 chars, use `openssl rand -hex 32`)
- [ ] Set ENCRYPTION_KEY to 64-char hex (`openssl rand -hex 32`)
- [ ] Enable firewall: only ports 80, 443 open externally
- [ ] Set up automatic backups (scripts/backup.sh) as daily cron
- [ ] Configure monitoring: set up `/api/v1/health` uptime checks
- [ ] Review feature flags: enable only features ready for production
- [ ] Set up log aggregation (e.g., tail -f /var/log/caddy/access.log)
- [ ] Test backup restore procedure before go-live
- [ ] Change default admin password (admin@knef.local / Admin123!) immediately
- [ ] Configure Telegram bot for critical alerts
