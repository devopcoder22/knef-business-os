-- Stage 24A: External Integration Connection Foundation
-- Adds ExternalConnection (OAuth + API key provider connections)
-- and IntegrationSyncLog (job tracking) to support social, ads,
-- Shopify, WhatsApp and marketplace integrations.

CREATE TABLE "external_connections" (
    "id"                      TEXT NOT NULL,
    "organizationId"          TEXT NOT NULL,
    "provider"                TEXT NOT NULL,
    "displayName"             TEXT NOT NULL,
    "status"                  TEXT NOT NULL DEFAULT 'pending',
    "externalAccountId"       TEXT,
    "externalAccountName"     TEXT,
    "externalAccountEmail"    TEXT,
    "externalPageId"          TEXT,
    "externalPageName"        TEXT,
    "accessTokenEncrypted"    TEXT,
    "refreshTokenEncrypted"   TEXT,
    "tokenExpiresAt"          TIMESTAMP(3),
    "tokenRefreshedAt"        TIMESTAMP(3),
    "tokenStatus"             TEXT,
    "scopes"                  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apiKeyEncrypted"         TEXT,
    "apiSecretEncrypted"      TEXT,
    "lastHealthCheckAt"       TIMESTAMP(3),
    "healthStatus"            TEXT,
    "errorCount"              INTEGER NOT NULL DEFAULT 0,
    "lastErrorAt"             TIMESTAMP(3),
    "lastErrorMessage"        TEXT,
    "metadata"                JSONB,
    "connectedByUserId"       TEXT,
    "connectedAt"             TIMESTAMP(3),
    "disconnectedAt"          TIMESTAMP(3),
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_sync_logs" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId"   TEXT NOT NULL,
    "provider"       TEXT NOT NULL,
    "jobType"        TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"    TIMESTAMP(3),
    "itemsProcessed" INTEGER,
    "itemsFailed"    INTEGER,
    "errorMessage"   TEXT,
    "metadata"       JSONB,

    CONSTRAINT "integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one connection per provider + external account per org
CREATE UNIQUE INDEX "external_connections_orgId_provider_extAccountId_key"
    ON "external_connections"("organizationId", "provider", "externalAccountId");

-- Performance indexes
CREATE INDEX "external_connections_organizationId_provider_idx"
    ON "external_connections"("organizationId", "provider");

CREATE INDEX "external_connections_organizationId_status_idx"
    ON "external_connections"("organizationId", "status");

CREATE INDEX "integration_sync_logs_organizationId_connectionId_idx"
    ON "integration_sync_logs"("organizationId", "connectionId");

CREATE INDEX "integration_sync_logs_organizationId_provider_status_idx"
    ON "integration_sync_logs"("organizationId", "provider", "status");

CREATE INDEX "integration_sync_logs_connectionId_startedAt_idx"
    ON "integration_sync_logs"("connectionId", "startedAt");

-- Foreign keys
ALTER TABLE "external_connections"
    ADD CONSTRAINT "external_connections_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_connections"
    ADD CONSTRAINT "external_connections_connectedByUserId_fkey"
    FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_sync_logs"
    ADD CONSTRAINT "integration_sync_logs_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_sync_logs"
    ADD CONSTRAINT "integration_sync_logs_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "external_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
