-- Stage 24E: Social Media Publishing
-- social_accounts: connected pages/profiles/accounts per provider

CREATE TABLE "social_accounts" (
    "id"                 TEXT NOT NULL,
    "organizationId"     TEXT NOT NULL,
    "connectionId"       TEXT NOT NULL,
    "provider"           TEXT NOT NULL,
    "providerAccountId"  TEXT NOT NULL,
    "accountType"        TEXT NOT NULL,
    "displayName"        TEXT NOT NULL,
    "username"           TEXT,
    "avatarUrl"          TEXT,
    "externalBusinessId" TEXT,
    "capabilities"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalStatus"     TEXT NOT NULL DEFAULT 'CONNECTED',
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt"       TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_attempts" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "draftId"           TEXT NOT NULL,
    "variantId"         TEXT,
    "socialAccountId"   TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "attemptNumber"     INTEGER NOT NULL DEFAULT 1,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey"    TEXT NOT NULL,
    "externalPostId"    TEXT,
    "providerPublishId" TEXT,
    "providerStatus"    TEXT,
    "attemptedAt"       TIMESTAMP(3),
    "publishedAt"       TIMESTAMP(3),
    "errorCode"         TEXT,
    "errorMessage"      TEXT,
    "isRetryable"       BOOLEAN NOT NULL DEFAULT false,
    "retryAfter"        TIMESTAMP(3),
    "providerEventId"   TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "publication_attempts_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_organizationId_provider_providerAccountId_key"
    UNIQUE ("organizationId", "provider", "providerAccountId");

ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_idempotencyKey_key"
    UNIQUE ("idempotencyKey");

-- Indexes
CREATE INDEX "social_accounts_organizationId_idx" ON "social_accounts"("organizationId");
CREATE INDEX "social_accounts_connectionId_idx" ON "social_accounts"("connectionId");
CREATE INDEX "social_accounts_isActive_idx" ON "social_accounts"("isActive");

CREATE INDEX "publication_attempts_organizationId_idx" ON "publication_attempts"("organizationId");
CREATE INDEX "publication_attempts_draftId_idx" ON "publication_attempts"("draftId");
CREATE INDEX "publication_attempts_socialAccountId_idx" ON "publication_attempts"("socialAccountId");
CREATE INDEX "publication_attempts_status_retryAfter_idx" ON "publication_attempts"("status", "retryAfter");
CREATE INDEX "publication_attempts_providerEventId_idx" ON "publication_attempts"("providerEventId");

-- Foreign keys
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "external_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "content_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
