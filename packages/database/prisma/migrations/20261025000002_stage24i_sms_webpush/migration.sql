-- Phase 24I: SMS + Web Push hardening
-- Extends PushSubscription with audit/failure tracking fields
-- Adds idempotencyKey to CommunicationLog for business-event deduplication

ALTER TABLE "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "failureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revokedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "push_subscriptions_org_active_idx"
  ON "push_subscriptions"("organizationId", "isActive");

ALTER TABLE "communication_logs"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "communication_logs_idempotency_key"
  ON "communication_logs"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
