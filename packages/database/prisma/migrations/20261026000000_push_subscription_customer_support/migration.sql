-- Stage 24I remediation: support CustomerAccount push subscriptions
-- Makes userId nullable and adds customerAccountId for storefront push

-- 1. Make userId nullable (customers have no row in User table)
ALTER TABLE "push_subscriptions" ALTER COLUMN "userId" DROP NOT NULL;

-- 2. Add customerAccountId column (FK to CustomerAccount)
ALTER TABLE "push_subscriptions" ADD COLUMN "customerAccountId" TEXT;

ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Replace the non-partial unique index with two partial unique indexes
DROP INDEX "push_subscriptions_userId_endpoint_key";

CREATE UNIQUE INDEX "push_subscriptions_userId_endpoint_key"
  ON "push_subscriptions"("userId", "endpoint")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "push_subscriptions_customerAccountId_endpoint_key"
  ON "push_subscriptions"("customerAccountId", "endpoint")
  WHERE "customerAccountId" IS NOT NULL;

-- 4. Index for efficient customer subscription lookups
CREATE INDEX "push_subscriptions_organizationId_customerAccountId_idx"
  ON "push_subscriptions"("organizationId", "customerAccountId");
