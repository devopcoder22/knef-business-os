-- Migration: Email Compliance, Subscription Management, Campaign Approval
-- Extends existing communications models; no breaking changes.

-- ── 1. Extend CampaignStatus enum ───────────────────────────────────
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- ── 2. Extend EmailCampaign ──────────────────────────────────────────
ALTER TABLE "EmailCampaign"
  ADD COLUMN IF NOT EXISTS "previewText"      TEXT,
  ADD COLUMN IF NOT EXISTS "replyTo"          TEXT,
  ADD COLUMN IF NOT EXISTS "campaignType"     TEXT NOT NULL DEFAULT 'MARKETING',
  ADD COLUMN IF NOT EXISTS "subscriptionList" TEXT NOT NULL DEFAULT 'GENERAL_MARKETING',
  ADD COLUMN IF NOT EXISTS "createdById"      TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "eligibleCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "suppressedCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deliveredCount"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "complainedCount"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedCount"      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "EmailCampaign_campaignType_idx" ON "EmailCampaign"("campaignType");

-- ── 3. Extend EmailCampaignRecipient ────────────────────────────────
ALTER TABLE "EmailCampaignRecipient"
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failedAt"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "complainedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "errorMessage"      TEXT;

-- ── 4. EmailSubscription (new model) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "EmailSubscription" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "customerId"       TEXT,
  "subscriptionList" TEXT NOT NULL DEFAULT 'GENERAL_MARKETING',
  "status"           TEXT NOT NULL DEFAULT 'SUBSCRIBED',
  "source"           TEXT,
  "consentAt"        TIMESTAMP(3),
  "unsubscribedAt"   TIMESTAMP(3),
  "suppressedAt"     TIMESTAMP(3),
  "suppressionReason" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailSubscription_org_email_list_unique"
  ON "EmailSubscription"("organizationId", "email", "subscriptionList");

CREATE INDEX IF NOT EXISTS "EmailSubscription_organizationId_idx"
  ON "EmailSubscription"("organizationId");

CREATE INDEX IF NOT EXISTS "EmailSubscription_email_idx"
  ON "EmailSubscription"("email");

CREATE INDEX IF NOT EXISTS "EmailSubscription_status_idx"
  ON "EmailSubscription"("status");
