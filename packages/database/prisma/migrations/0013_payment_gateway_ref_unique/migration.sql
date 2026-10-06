-- Migration: 0013_payment_gateway_ref_unique
-- Adds a unique constraint on Payment(organizationId, gatewayRef) to enforce
-- DB-level idempotency for gateway payment references per organization.
--
-- PostgreSQL NULL semantics: each NULL value is treated as distinct in a unique
-- index, so multiple rows with gatewayRef = NULL do not violate this constraint.
-- Manual cash/bank-transfer payments (gatewayRef = NULL) are unaffected.
--
-- DEPLOYMENT PREREQUISITE: If the production database contains rows where the
-- same non-null gatewayRef appears more than once for the same organizationId,
-- those duplicates must be resolved manually before running this migration.
-- Run the following query to identify conflicts:
--
--   SELECT "organizationId", "gatewayRef", COUNT(*)
--   FROM "Payment"
--   WHERE "gatewayRef" IS NOT NULL
--   GROUP BY "organizationId", "gatewayRef"
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX "Payment_organizationId_gatewayRef_key"
  ON "Payment"("organizationId", "gatewayRef");
