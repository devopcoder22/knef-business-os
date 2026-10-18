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
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFZ_7Qph45mfl9bO

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

# Standalone output (brings apps/storefront/server.js and traced node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static

# Next.js standalone output does not include the public folder — copy it next to server.js
# so the standalone server can serve /robots.txt and other static assets.
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/public ./apps/storefront/public

RUN mkdir -p apps/storefront/.next && chown nextjs:nodejs apps/storefront/.next

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ || exit 1

CMD ["node", "apps/storefront/server.js"]
