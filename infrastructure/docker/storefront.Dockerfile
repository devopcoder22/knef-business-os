# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY .npmrc* package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/storefront/package.json ./apps/storefront/package.json

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.1.4 --activate

RUN pnpm --filter @knef/storefront build

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM node:20-alpine AS development
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3001
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["pnpm", "--filter", "@knef/storefront", "dev"]

# ─── Stage 4: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output does not include public folder — copy separately
COPY --from=builder /app/apps/storefront/public ./public 2>/dev/null || true

RUN mkdir -p .next && chown nextjs:nodejs .next

# Standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ || exit 1

CMD ["node", "apps/storefront/server.js"]
