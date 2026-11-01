-- Migration 0015: Stage 23 storefront models
-- CustomerAccount, CustomerAccountRefreshToken, and SalesOrder delivery fields
-- NOTE: Production table names are camelCase (e.g., "SalesOrder", "Customer")
--       as established in 0001_init — no @@map overrides in schema.

CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpires" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "resetPasswordExpires" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAccountRefreshToken" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAccountRefreshToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deliveryCity" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deliveryState" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "deliveryPhone" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "customerAccountId" TEXT;

CREATE UNIQUE INDEX "CustomerAccount_customerId_key" ON "CustomerAccount"("customerId");
CREATE UNIQUE INDEX "CustomerAccount_organizationId_email_key" ON "CustomerAccount"("organizationId", "email");
CREATE INDEX "CustomerAccount_organizationId_idx" ON "CustomerAccount"("organizationId");
CREATE INDEX "CustomerAccount_email_idx" ON "CustomerAccount"("email");

CREATE UNIQUE INDEX "CustomerAccountRefreshToken_tokenHash_key" ON "CustomerAccountRefreshToken"("tokenHash");
CREATE INDEX "CustomerAccountRefreshToken_customerAccountId_idx" ON "CustomerAccountRefreshToken"("customerAccountId");
CREATE INDEX "CustomerAccountRefreshToken_tokenHash_idx" ON "CustomerAccountRefreshToken"("tokenHash");

CREATE UNIQUE INDEX "SalesOrder_idempotency_key" ON "SalesOrder"("organizationId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX "SalesOrder_customerAccountId_idx" ON "SalesOrder"("customerAccountId");

ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerAccountRefreshToken" ADD CONSTRAINT "CustomerAccountRefreshToken_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
