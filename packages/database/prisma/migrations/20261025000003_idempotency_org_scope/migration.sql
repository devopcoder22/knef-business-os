-- Phase 24I Closure Remediation: org-scoped idempotency index
-- Replaces the global unique index on communication_logs.idempotencyKey with an
-- org-scoped composite partial index.  Different organizations are now free to use
-- the same short key string (e.g. "order-confirmed:123") without triggering a
-- unique-constraint violation against each other.

-- Drop the cross-org unique index added in Stage 24I
DROP INDEX IF EXISTS "communication_logs_idempotency_key";

-- Org-scoped: (organizationId, idempotencyKey) must be unique when the key is present
CREATE UNIQUE INDEX "communication_logs_idempotency_org_key"
  ON "communication_logs"("organizationId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
