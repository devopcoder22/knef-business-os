# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY .npmrc* package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/mcp-server/package.json ./apps/mcp-server/

RUN pnpm install --frozen-lockfile --prod=false

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY .npmrc* package.json pnpm-workspace.yaml ./
COPY apps/mcp-server ./apps/mcp-server

RUN pnpm --filter @knef/mcp-server build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S mcpserver && adduser -S mcpserver -u 1001
WORKDIR /app

ENV NODE_ENV=production
ENV MCP_SERVER_PORT=4100

COPY --from=builder --chown=mcpserver:mcpserver /app/apps/mcp-server/dist ./dist
COPY --from=builder --chown=mcpserver:mcpserver /app/apps/mcp-server/package.json ./
COPY --from=deps --chown=mcpserver:mcpserver /app/node_modules ./node_modules

USER mcpserver

EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4100/health || exit 1

CMD ["node", "dist/index.js"]
