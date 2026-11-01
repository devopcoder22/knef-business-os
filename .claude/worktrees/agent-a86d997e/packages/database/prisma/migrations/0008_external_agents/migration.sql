-- Migration: 0008_external_agents
-- Adds ExternalAgent model, enhances AITool with external exposure fields,
-- and adds externalAgentId + requestId to AIAction for traceability.

-- ExternalAgent: identity record for external AI agents/applications
CREATE TABLE "ExternalAgent" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "description"        TEXT,
    "ownerId"            TEXT,
    "status"             TEXT NOT NULL DEFAULT 'ACTIVE',
    "scopes"             TEXT[] NOT NULL DEFAULT '{}',
    "allowedTools"       TEXT[] NOT NULL DEFAULT '{}',
    "autonomyLevel"      TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "apiKeyId"           TEXT,
    "metadata"           JSONB,
    "lastUsedAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAgent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalAgent_organizationId_name_key" ON "ExternalAgent"("organizationId", "name");
CREATE INDEX "ExternalAgent_organizationId_idx" ON "ExternalAgent"("organizationId");
CREATE INDEX "ExternalAgent_apiKeyId_idx" ON "ExternalAgent"("apiKeyId");

-- Enhance AITool with risk level and external exposure
ALTER TABLE "AITool"
    ADD COLUMN "riskLevel"        TEXT NOT NULL DEFAULT 'LOW',
    ADD COLUMN "externalExposure" TEXT NOT NULL DEFAULT 'NOT_EXPOSED';

CREATE INDEX "AITool_externalExposure_idx" ON "AITool"("externalExposure");

-- Add traceability fields to AIAction
ALTER TABLE "AIAction"
    ADD COLUMN "externalAgentId" TEXT,
    ADD COLUMN "requestId"       TEXT;

CREATE INDEX "AIAction_externalAgentId_idx" ON "AIAction"("externalAgentId");
CREATE INDEX "AIAction_requestId_idx" ON "AIAction"("requestId");
