-- Stage 12: Automation Engine
-- Extends AutomationRule with location scoping + audit fields.
-- Adds AutomationExecution for persistent execution history.

-- Add new columns to AutomationRule
ALTER TABLE "AutomationRule" ADD COLUMN "locationId" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "AutomationRule" ADD COLUMN "updatedBy" TEXT;

-- Index for location-scoped rule lookups
CREATE INDEX "AutomationRule_locationId_idx" ON "AutomationRule"("locationId");

-- AutomationExecution — persistent execution history
CREATE TABLE "AutomationExecution" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "ruleId"          TEXT NOT NULL,
    "eventId"         TEXT NOT NULL,
    "eventType"       TEXT NOT NULL,
    "locationId"      TEXT,
    "status"          TEXT NOT NULL DEFAULT 'PENDING',
    "actionType"      TEXT NOT NULL,
    "actionIndex"     INTEGER NOT NULL DEFAULT 0,
    "causationId"     TEXT,
    "automationDepth" INTEGER NOT NULL DEFAULT 0,
    "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"     TIMESTAMP(3),
    "attempt"         INTEGER NOT NULL DEFAULT 0,
    "failureCategory" TEXT,
    "errorMessage"    TEXT,
    "resultMetadata"  JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- Idempotency: same rule + event + action slot may only execute once
CREATE UNIQUE INDEX "AutomationExecution_ruleId_eventId_actionIndex_key"
    ON "AutomationExecution"("ruleId", "eventId", "actionIndex");

CREATE INDEX "AutomationExecution_organizationId_idx" ON "AutomationExecution"("organizationId");
CREATE INDEX "AutomationExecution_ruleId_idx"          ON "AutomationExecution"("ruleId");
CREATE INDEX "AutomationExecution_eventId_idx"         ON "AutomationExecution"("eventId");
CREATE INDEX "AutomationExecution_status_idx"          ON "AutomationExecution"("status");

ALTER TABLE "AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
