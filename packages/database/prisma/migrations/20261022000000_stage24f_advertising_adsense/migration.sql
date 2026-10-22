-- Stage 24F — Advertising Integrations & Google AdSense
-- Purely additive migration — no DROP statements, no modifications to existing tables

-- advertising_accounts
CREATE TABLE "advertising_accounts" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT NOT NULL,
    "connectionId"        TEXT NOT NULL,
    "provider"            TEXT NOT NULL,
    "providerAccountId"   TEXT NOT NULL,
    "displayName"         TEXT NOT NULL,
    "currency"            TEXT NOT NULL DEFAULT 'USD',
    "timezone"            TEXT NOT NULL DEFAULT 'UTC',
    "accountStatus"       TEXT NOT NULL DEFAULT 'UNKNOWN',
    "capabilities"        JSONB NOT NULL DEFAULT '[]',
    "approvalStatus"      TEXT NOT NULL DEFAULT 'PENDING_PROVIDER_REVIEW',
    "lastSyncedAt"        TIMESTAMP(3),
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertising_accounts_pkey" PRIMARY KEY ("id")
);

-- advertising_campaigns
CREATE TABLE "advertising_campaigns" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "advertisingAccountId" TEXT NOT NULL,
    "provider"             TEXT NOT NULL,
    "providerCampaignId"   TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "status"               TEXT NOT NULL DEFAULT 'UNKNOWN',
    "objective"            TEXT,
    "budgetType"           TEXT,
    "budgetAmountMicros"   BIGINT,
    "currency"             TEXT,
    "startDate"            TIMESTAMP(3),
    "endDate"              TIMESTAMP(3),
    "providerStatus"       TEXT,
    "lastSyncedAt"         TIMESTAMP(3),
    "rawMeta"              JSONB NOT NULL DEFAULT '{}',
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertising_campaigns_pkey" PRIMARY KEY ("id")
);

-- advertising_ad_groups
CREATE TABLE "advertising_ad_groups" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "campaignId"        TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "providerAdGroupId" TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'UNKNOWN',
    "bidAmountMicros"   BIGINT,
    "rawMeta"           JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt"      TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertising_ad_groups_pkey" PRIMARY KEY ("id")
);

-- advertising_ads
CREATE TABLE "advertising_ads" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adGroupId"      TEXT NOT NULL,
    "provider"       TEXT NOT NULL,
    "providerAdId"   TEXT NOT NULL,
    "name"           TEXT,
    "status"         TEXT NOT NULL DEFAULT 'UNKNOWN',
    "rawMeta"        JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt"   TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertising_ads_pkey" PRIMARY KEY ("id")
);

-- advertising_metric_snapshots
CREATE TABLE "advertising_metric_snapshots" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "advertisingAccountId" TEXT NOT NULL,
    "campaignId"           TEXT,
    "date"                 DATE NOT NULL,
    "provider"             TEXT NOT NULL,
    "impressions"          INTEGER NOT NULL DEFAULT 0,
    "clicks"               INTEGER NOT NULL DEFAULT 0,
    "spend"                DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency"             TEXT NOT NULL,
    "conversions"          DECIMAL(18,6),
    "conversionValue"      DECIMAL(18,6),
    "reach"                INTEGER,
    "cpc"                  DECIMAL(18,6),
    "cpm"                  DECIMAL(18,6),
    "ctr"                  DECIMAL(10,6),
    "cpa"                  DECIMAL(18,6),
    "roas"                 DECIMAL(10,4),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advertising_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- advertising_actions
CREATE TABLE "advertising_actions" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "provider"             TEXT NOT NULL,
    "advertisingAccountId" TEXT NOT NULL,
    "campaignId"           TEXT,
    "actionType"           TEXT NOT NULL,
    "status"               TEXT NOT NULL DEFAULT 'DRAFT',
    "requestPayload"       JSONB NOT NULL,
    "previousValue"        JSONB,
    "proposedValue"        JSONB,
    "approvalId"           TEXT,
    "providerRequestId"    TEXT,
    "providerResult"       JSONB,
    "errorMessage"         TEXT,
    "requestedById"        TEXT NOT NULL,
    "approvedById"         TEXT,
    "submittedAt"          TIMESTAMP(3),
    "appliedAt"            TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertising_actions_pkey" PRIMARY KEY ("id")
);

-- ── Unique Constraints ────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "advertising_accounts_organizationId_provider_providerAccountId_key"
    ON "advertising_accounts"("organizationId", "provider", "providerAccountId");

CREATE UNIQUE INDEX "advertising_campaigns_advertisingAccountId_providerCampaignId_key"
    ON "advertising_campaigns"("advertisingAccountId", "providerCampaignId");

CREATE UNIQUE INDEX "advertising_ad_groups_campaignId_providerAdGroupId_key"
    ON "advertising_ad_groups"("campaignId", "providerAdGroupId");

CREATE UNIQUE INDEX "advertising_ads_adGroupId_providerAdId_key"
    ON "advertising_ads"("adGroupId", "providerAdId");

CREATE UNIQUE INDEX "advertising_metric_snapshots_advertisingAccountId_campaignId_date_provider_key"
    ON "advertising_metric_snapshots"("advertisingAccountId", "campaignId", "date", "provider");

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX "advertising_accounts_organizationId_provider_idx"
    ON "advertising_accounts"("organizationId", "provider");

CREATE INDEX "advertising_accounts_connectionId_idx"
    ON "advertising_accounts"("connectionId");

CREATE INDEX "advertising_campaigns_organizationId_provider_idx"
    ON "advertising_campaigns"("organizationId", "provider");

CREATE INDEX "advertising_campaigns_advertisingAccountId_idx"
    ON "advertising_campaigns"("advertisingAccountId");

CREATE INDEX "advertising_ad_groups_organizationId_idx"
    ON "advertising_ad_groups"("organizationId");

CREATE INDEX "advertising_ad_groups_campaignId_idx"
    ON "advertising_ad_groups"("campaignId");

CREATE INDEX "advertising_ads_organizationId_idx"
    ON "advertising_ads"("organizationId");

CREATE INDEX "advertising_ads_adGroupId_idx"
    ON "advertising_ads"("adGroupId");

CREATE INDEX "advertising_metric_snapshots_organizationId_provider_date_idx"
    ON "advertising_metric_snapshots"("organizationId", "provider", "date");

CREATE INDEX "advertising_metric_snapshots_advertisingAccountId_date_idx"
    ON "advertising_metric_snapshots"("advertisingAccountId", "date");

CREATE INDEX "advertising_actions_organizationId_status_idx"
    ON "advertising_actions"("organizationId", "status");

CREATE INDEX "advertising_actions_organizationId_provider_idx"
    ON "advertising_actions"("organizationId", "provider");

CREATE INDEX "advertising_actions_advertisingAccountId_idx"
    ON "advertising_actions"("advertisingAccountId");

-- ── Foreign Key Constraints ───────────────────────────────────────────────────

ALTER TABLE "advertising_accounts"
    ADD CONSTRAINT "advertising_accounts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_accounts"
    ADD CONSTRAINT "advertising_accounts_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "external_connections"("id") ON UPDATE CASCADE;

ALTER TABLE "advertising_campaigns"
    ADD CONSTRAINT "advertising_campaigns_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_campaigns"
    ADD CONSTRAINT "advertising_campaigns_advertisingAccountId_fkey"
    FOREIGN KEY ("advertisingAccountId") REFERENCES "advertising_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_ad_groups"
    ADD CONSTRAINT "advertising_ad_groups_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_ad_groups"
    ADD CONSTRAINT "advertising_ad_groups_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "advertising_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_ads"
    ADD CONSTRAINT "advertising_ads_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_ads"
    ADD CONSTRAINT "advertising_ads_adGroupId_fkey"
    FOREIGN KEY ("adGroupId") REFERENCES "advertising_ad_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_metric_snapshots"
    ADD CONSTRAINT "advertising_metric_snapshots_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_metric_snapshots"
    ADD CONSTRAINT "advertising_metric_snapshots_advertisingAccountId_fkey"
    FOREIGN KEY ("advertisingAccountId") REFERENCES "advertising_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_metric_snapshots"
    ADD CONSTRAINT "advertising_metric_snapshots_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "advertising_campaigns"("id") ON UPDATE CASCADE;

ALTER TABLE "advertising_actions"
    ADD CONSTRAINT "advertising_actions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "advertising_actions"
    ADD CONSTRAINT "advertising_actions_advertisingAccountId_fkey"
    FOREIGN KEY ("advertisingAccountId") REFERENCES "advertising_accounts"("id") ON UPDATE CASCADE;

ALTER TABLE "advertising_actions"
    ADD CONSTRAINT "advertising_actions_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "advertising_campaigns"("id") ON UPDATE CASCADE;

ALTER TABLE "advertising_actions"
    ADD CONSTRAINT "advertising_actions_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "advertising_actions"
    ADD CONSTRAINT "advertising_actions_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON UPDATE CASCADE;
