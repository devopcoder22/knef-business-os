# KNEF Business OS

Production-grade, self-hosted ERP + AI platform for KNEF Gadgets, Lagos Nigeria.

## Architecture

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript, Node.js 20 |
| Database | PostgreSQL 16 + pgvector, Prisma 5 |
| Cache/Queue | Redis 7, BullMQ |
| Auth | Passport.js (local + JWT), bcrypt (cost 12) |
| Reverse Proxy | Caddy 2 |
| Containers | Docker + Docker Compose |

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 1. Clone and install dependencies

```bash
git clone <repo>
cd knef-business-os
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in required values:
# - JWT_SECRET (64 hex chars: openssl rand -hex 64)
# - JWT_REFRESH_SECRET (64 hex chars)
# - ENCRYPTION_KEY (64 hex chars: openssl rand -hex 32 — wait, this is 32 bytes = 64 hex)
# - DB_PASSWORD
```

### 3. Start infrastructure (DB + Redis)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db redis -d
```

### 4. Run migrations and seed

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start development servers

```bash
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Swagger UI: http://localhost:4000/api/docs

### Default development credentials

```
Email: admin@knef.local
Password: Admin123!
```

---

## Production Deployment

### 1. Prepare server (Ubuntu 22.04 recommended)

```bash
# Install Docker
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# Install Docker Compose plugin
apt-get install docker-compose-plugin
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in ALL values with strong secrets
# openssl rand -hex 64  # for JWT secrets
# openssl rand -hex 32  # for ENCRYPTION_KEY (output is 64 hex chars = 32 bytes)
```

### 3. Update domain

Edit `infrastructure/caddy/Caddyfile` — replace `yourdomain.com` with your actual domain.
Edit `docker-compose.yml` — update `NEXT_PUBLIC_API_URL`.

### 4. Build and start

```bash
docker compose up -d --build
```

### 5. Run migrations

```bash
docker compose exec api npx prisma migrate deploy
```

### 6. Seed (first deployment only)

```bash
docker compose exec api node dist/database/seed.js
# Or: docker compose exec api npx prisma db seed
```

### 7. Set up backups

```bash
# Add to crontab (runs at 2am daily)
0 2 * * * cd /path/to/knef-business-os && ./scripts/backup.sh >> /var/log/knef-backup.log 2>&1
```

---

## Project Structure

```
knef-business-os/
├── apps/
│   ├── api/                # NestJS backend
│   │   └── src/
│   │       ├── config/     # Zod-validated env config
│   │       ├── common/     # Guards, decorators, filters, interceptors
│   │       └── modules/    # Feature modules (auth, users, roles, etc.)
│   └── web/                # Next.js frontend
│       └── src/
│           ├── app/        # App Router pages
│           ├── components/ # Shared UI components
│           ├── lib/        # API client, utils
│           └── stores/     # Zustand state stores
├── packages/
│   ├── database/           # Prisma schema + client singleton
│   ├── constants/          # Shared permissions, events, feature flags
│   ├── types/              # Shared TypeScript types
│   └── utils/              # Shared utilities (crypto, currency, numbers)
├── infrastructure/
│   ├── caddy/              # Caddy reverse proxy config
│   └── docker/             # Dockerfiles (api, web, worker)
└── scripts/
    ├── backup.sh           # Encrypted database backup
    └── restore.sh          # Database restore from backup
```

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/login | Login with email + password |
| POST | /api/v1/auth/register | Register new organization |
| POST | /api/v1/auth/refresh | Refresh access token |
| POST | /api/v1/auth/logout | Logout |
| GET | /api/v1/auth/me | Get current user |
| GET | /api/v1/health | Health check (DB + Redis) |
| GET | /api/v1/users | List users (admin) |
| GET | /api/v1/roles | List roles |
| GET | /api/v1/feature-flags | List feature flags |
| PATCH | /api/v1/feature-flags/:key | Toggle feature flag |
| GET | /api/v1/audit | Paginated audit log |
| GET | /api/v1/settings | System settings |

Full API documentation available at `/api/docs` (Swagger UI, development only).

## Security Features

- JWT access tokens (15min TTL) + httpOnly refresh tokens (30 day, rotated)
- bcrypt password hashing (cost factor 12)
- Account lockout after 5 failed attempts (15min Redis key)
- AES-256-GCM encryption for stored secrets (API keys, OAuth tokens)
- TOTP 2FA with speakeasy
- Permission-based access control with role + user-level overrides
- Redis-cached permission resolution (5min TTL)
- Helmet security headers
- Rate limiting (ThrottlerModule)
- Complete audit trail for all mutations
- Feature flags per organization
