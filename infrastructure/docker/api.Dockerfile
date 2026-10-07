# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

# Copy workspace manifests (include .npmrc so shamefully-hoist is active during install)
COPY .npmrc* package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/package.json
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

COPY . .

# Generate Prisma client then compile database package to dist/
RUN pnpm --filter @knef/database db:generate
RUN pnpm --filter @knef/database build

# Build all packages then the API
RUN pnpm --filter @knef/constants build
RUN pnpm --filter @knef/utils build
RUN pnpm --filter @knef/types build
RUN pnpm --filter @knef/api build

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM node:20-alpine AS development
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter @knef/database db:generate

EXPOSE 4000
CMD ["pnpm", "--filter", "@knef/api", "dev"]

# ─── Stage 4: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built app and hoisted node_modules (shamefully-hoist puts everything here)
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages

# Copy Prisma schema for migrations
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./packages/database/prisma

RUN mkdir -p /app/uploads /app/backups && chown -R nestjs:nodejs /app/uploads /app/backups

USER nestjs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/apps/api/src/main.js"]
