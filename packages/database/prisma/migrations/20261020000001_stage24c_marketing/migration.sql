-- Stage 24C: Marketing & Content Management
-- Additive only — no existing tables altered

CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ContentDraftStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- MarketingCampaign: cross-channel campaign orchestrator
CREATE TABLE "marketing_campaigns" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "objective"       TEXT NOT NULL DEFAULT 'GENERIC',
    "status"          "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "channels"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate"       TIMESTAMP(3),
    "endDate"         TIMESTAMP(3),
    "budgetMetadata"  JSONB,
    "notes"           TEXT,
    "targetSegmentId" TEXT,
    "createdById"     TEXT,
    "approvedById"    TEXT,
    "approvedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- ContentDraft: reusable content pieces per campaign or standalone
CREATE TABLE "content_drafts" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId"     TEXT,
    "title"          TEXT NOT NULL,
    "body"           TEXT,
    "callToAction"   TEXT,
    "destinationUrl" TEXT,
    "targetChannel"  TEXT NOT NULL DEFAULT 'SOCIAL',
    "status"         "ContentDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId"        TEXT,
    "scheduledAt"    TIMESTAMP(3),
    "timezone"       TEXT NOT NULL DEFAULT 'UTC',
    "approvedById"   TEXT,
    "approvedAt"     TIMESTAMP(3),
    "publishedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- ContentVariant: platform-specific version of a draft
CREATE TABLE "content_variants" (
    "id"                TEXT NOT NULL,
    "draftId"           TEXT NOT NULL,
    "platform"          TEXT NOT NULL,
    "body"              TEXT,
    "callToAction"      TEXT,
    "mediaAssetIds"     JSONB NOT NULL DEFAULT '[]',
    "providerName"      TEXT,
    "externalAccountId" TEXT,
    "externalPostId"    TEXT,
    "externalStatus"    TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_variants_pkey" PRIMARY KEY ("id")
);

-- MediaAsset: tracked uploaded media with marketing metadata
CREATE TABLE "media_assets" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById"   TEXT,
    "filename"       TEXT NOT NULL,
    "originalName"   TEXT NOT NULL,
    "mimeType"       TEXT NOT NULL,
    "size"           INTEGER NOT NULL,
    "width"          INTEGER,
    "height"         INTEGER,
    "url"            TEXT NOT NULL,
    "altText"        TEXT,
    "tags"           JSONB NOT NULL DEFAULT '[]',
    "category"       TEXT NOT NULL DEFAULT 'CAMPAIGN_IMAGE',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "marketing_campaigns_organizationId_idx" ON "marketing_campaigns"("organizationId");
CREATE INDEX "marketing_campaigns_status_idx" ON "marketing_campaigns"("status");

CREATE INDEX "content_drafts_organizationId_idx" ON "content_drafts"("organizationId");
CREATE INDEX "content_drafts_campaignId_idx" ON "content_drafts"("campaignId");
CREATE INDEX "content_drafts_status_idx" ON "content_drafts"("status");

CREATE UNIQUE INDEX "content_variants_draftId_platform_key" ON "content_variants"("draftId", "platform");
CREATE INDEX "content_variants_draftId_idx" ON "content_variants"("draftId");

CREATE INDEX "media_assets_organizationId_idx" ON "media_assets"("organizationId");
CREATE INDEX "media_assets_category_idx" ON "media_assets"("category");

-- Foreign keys
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_targetSegmentId_fkey"
    FOREIGN KEY ("targetSegmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
