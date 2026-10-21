-- Stage 24E Remediation: Explicit publication target selection
-- Prevents scheduler from fanning out to all connected accounts

CREATE TABLE "social_publication_targets" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "draftId"         TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "provider"        TEXT NOT NULL,
    "variantId"       TEXT,
    "isCancelled"     BOOLEAN NOT NULL DEFAULT false,
    "createdBy"       TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_publication_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_publication_targets_draftId_socialAccountId_key"
    ON "social_publication_targets"("draftId", "socialAccountId");

CREATE INDEX "social_publication_targets_organizationId_draftId_idx"
    ON "social_publication_targets"("organizationId", "draftId");

CREATE INDEX "social_publication_targets_organizationId_socialAccountId_idx"
    ON "social_publication_targets"("organizationId", "socialAccountId");

ALTER TABLE "social_publication_targets"
    ADD CONSTRAINT "social_publication_targets_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_publication_targets"
    ADD CONSTRAINT "social_publication_targets_draftId_fkey"
    FOREIGN KEY ("draftId") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_publication_targets"
    ADD CONSTRAINT "social_publication_targets_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_publication_targets"
    ADD CONSTRAINT "social_publication_targets_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "content_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
