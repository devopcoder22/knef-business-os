# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/constants/package.json ./packages/constants/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/types/package.json ./packages/types/package.json

RUN pnpm install --frozen-lockfile --prod=false

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/constants/node_modules ./packages/constants/node_modules
COPY --from=deps /app/packages/utils/node_modules ./packages/utils/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY . .

RUN pnpm --filter @knef/database db:generate
RUN pnpm --filter @knef/constants build
RUN pnpm --filter @knef/utils build
RUN pnpm --filter @knef/types build
RUN pnpm --filter @knef/worker build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init postgresql-client

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/packages ./packages
COPY --from=builder --chown=worker:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=worker:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=worker:nodejs /app/scripts ./scripts

RUN mkdir -p /app/uploads /app/backups && \
    chown -R worker:nodejs /app/uploads /app/backups && \
    chmod +x /app/scripts/backup.sh /app/scripts/redis-healthcheck.js

USER worker

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
