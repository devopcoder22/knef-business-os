-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AutonomyLevel" AS ENUM ('ADVISORY', 'DRAFT', 'APPROVAL_REQUIRED', 'LIMITED_AUTONOMY', 'SCHEDULED_AUTONOMY');
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiAutonomyPolicy" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope"          TEXT NOT NULL,
    "scopeId"        TEXT,
    "level"          "AutonomyLevel" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "scopeLimits"    JSONB NOT NULL DEFAULT '{}',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdBy"      TEXT,
    "updatedBy"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAutonomyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiAutonomyPolicy_organizationId_scope_scopeId_key" ON "AiAutonomyPolicy"("organizationId", "scope", "scopeId");
CREATE INDEX IF NOT EXISTS "AiAutonomyPolicy_organizationId_idx" ON "AiAutonomyPolicy"("organizationId");

-- AlterTable AIAction
ALTER TABLE "AIAction"
    ADD COLUMN IF NOT EXISTS "autonomyLevel"  TEXT,
    ADD COLUMN IF NOT EXISTS "policyDecision" TEXT,
    ADD COLUMN IF NOT EXISTS "expiresAt"      TIMESTAMP(3);
