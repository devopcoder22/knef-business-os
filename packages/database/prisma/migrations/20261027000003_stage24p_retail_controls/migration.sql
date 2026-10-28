-- Phase 24P — Retail Operational Controls
-- Stock count lifecycle, cycle counts, price history, print templates, bank reconciliation

-- ─── CountStatus: extend with new lifecycle statuses ───────────────────────────
-- NOTE: ALTER TYPE ... ADD VALUE cannot be used in the same transaction as its values.
-- COMMIT/BEGIN breaks the implicit transaction so the new values are visible below.
COMMIT;
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "CountStatus" ADD VALUE IF NOT EXISTS 'POSTED';
BEGIN;

-- ─── StockCount: lifecycle and scope fields ─────────────────────────────────────
ALTER TABLE "StockCount"
  ADD COLUMN IF NOT EXISTS "scopeType"       TEXT,
  ADD COLUMN IF NOT EXISTS "scope"           JSONB,
  ADD COLUMN IF NOT EXISTS "submittedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "postedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "assignedTo"      TEXT,
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

-- Change status default to DRAFT
ALTER TABLE "StockCount" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"CountStatus";

-- ─── StockCountItem: precision and cost snapshot ────────────────────────────────
-- Migrate integer qty columns to decimal (safe — preserves existing values)
ALTER TABLE "StockCountItem"
  ALTER COLUMN "systemQty" TYPE DECIMAL(15,4) USING "systemQty"::DECIMAL(15,4),
  ALTER COLUMN "countedQty" TYPE DECIMAL(15,4) USING "countedQty"::DECIMAL(15,4),
  ALTER COLUMN "variance" TYPE DECIMAL(15,4) USING "variance"::DECIMAL(15,4);

ALTER TABLE "StockCountItem"
  ADD COLUMN IF NOT EXISTS "unitCostSnapshot" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "varianceValue"    DECIMAL(15,2);

CREATE INDEX IF NOT EXISTS "StockCountItem_productId_idx" ON "StockCountItem"("productId");
CREATE INDEX IF NOT EXISTS "StockCount_organizationId_status_idx" ON "StockCount"("organizationId", "status");

-- ─── Product: reorderPoint and reorderQuantity ──────────────────────────────────
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "reorderPoint"    DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS "reorderQuantity" DECIMAL(15,4);

-- ─── CycleCountStatus enum ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CycleCountStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── CycleCount ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CycleCount" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "locationId"     TEXT         NOT NULL,
  "reference"      TEXT         NOT NULL,
  "status"         "CycleCountStatus" NOT NULL DEFAULT 'SCHEDULED',
  "frequency"      TEXT         NOT NULL,
  "categoryId"     TEXT,
  "scheduledAt"    TIMESTAMP(3) NOT NULL,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "createdBy"      TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CycleCount_organizationId_reference_key"
  ON "CycleCount"("organizationId", "reference");
CREATE INDEX IF NOT EXISTS "CycleCount_organizationId_idx"
  ON "CycleCount"("organizationId");
CREATE INDEX IF NOT EXISTS "CycleCount_locationId_idx"
  ON "CycleCount"("locationId");
CREATE INDEX IF NOT EXISTS "CycleCount_organizationId_status_idx"
  ON "CycleCount"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "CycleCount_scheduledAt_idx"
  ON "CycleCount"("scheduledAt");

ALTER TABLE "CycleCount"
  ADD CONSTRAINT "CycleCount_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── CycleCountItem ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CycleCountItem" (
  "id"           TEXT         NOT NULL,
  "cycleCountId" TEXT         NOT NULL,
  "productId"    TEXT         NOT NULL,
  "variantId"    TEXT,
  "systemQty"    DECIMAL(15,4) NOT NULL,
  "countedQty"   DECIMAL(15,4),
  "variance"     DECIMAL(15,4),
  "countedAt"    TIMESTAMP(3),
  CONSTRAINT "CycleCountItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CycleCountItem_cycleCountId_idx"
  ON "CycleCountItem"("cycleCountId");
CREATE INDEX IF NOT EXISTS "CycleCountItem_productId_idx"
  ON "CycleCountItem"("productId");

ALTER TABLE "CycleCountItem"
  ADD CONSTRAINT "CycleCountItem_cycleCountId_fkey"
  FOREIGN KEY ("cycleCountId") REFERENCES "CycleCount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── PriceType enum ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PriceType" AS ENUM ('COST', 'SELLING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── PriceHistory ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PriceHistory" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "productId"      TEXT         NOT NULL,
  "variantId"      TEXT,
  "priceType"      "PriceType"  NOT NULL,
  "oldPrice"       DECIMAL(15,2) NOT NULL,
  "newPrice"       DECIMAL(15,2) NOT NULL,
  "reason"         TEXT,
  "source"         TEXT,
  "changedBy"      TEXT,
  "effectiveAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PriceHistory_organizationId_idx"
  ON "PriceHistory"("organizationId");
CREATE INDEX IF NOT EXISTS "PriceHistory_productId_idx"
  ON "PriceHistory"("productId");
CREATE INDEX IF NOT EXISTS "PriceHistory_productId_priceType_idx"
  ON "PriceHistory"("productId", "priceType");
CREATE INDEX IF NOT EXISTS "PriceHistory_organizationId_effectiveAt_idx"
  ON "PriceHistory"("organizationId", "effectiveAt");

ALTER TABLE "PriceHistory"
  ADD CONSTRAINT "PriceHistory_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PrintTemplateType enum ──────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PrintTemplateType" AS ENUM ('RECEIPT','INVOICE','PO','GRN','QUOTATION','BARCODE_LABEL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── PrintTemplate ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PrintTemplate" (
  "id"             TEXT               NOT NULL,
  "organizationId" TEXT               NOT NULL,
  "name"           TEXT               NOT NULL,
  "templateType"   "PrintTemplateType" NOT NULL,
  "isDefault"      BOOLEAN            NOT NULL DEFAULT false,
  "isActive"       BOOLEAN            NOT NULL DEFAULT true,
  "content"        TEXT               NOT NULL,
  "variables"      JSONB              NOT NULL DEFAULT '[]',
  "paperSize"      TEXT               NOT NULL DEFAULT 'A4',
  "orientation"    TEXT               NOT NULL DEFAULT 'portrait',
  "createdBy"      TEXT,
  "updatedBy"      TEXT,
  "createdAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrintTemplate_organizationId_name_templateType_key"
  ON "PrintTemplate"("organizationId", "name", "templateType");
CREATE INDEX IF NOT EXISTS "PrintTemplate_organizationId_idx"
  ON "PrintTemplate"("organizationId");
CREATE INDEX IF NOT EXISTS "PrintTemplate_organizationId_templateType_idx"
  ON "PrintTemplate"("organizationId", "templateType");

-- ─── ImportStatus enum ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ImportStatus" AS ENUM ('PENDING','PROCESSING','COMPLETE','FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── MatchStatus enum ───────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED','AUTO_MATCHED','MANUALLY_MATCHED','CONFIRMED','EXCLUDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── BankStatementImport ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankStatementImport" (
  "id"             TEXT          NOT NULL,
  "organizationId" TEXT          NOT NULL,
  "bankAccountId"  TEXT          NOT NULL,
  "fileName"       TEXT          NOT NULL,
  "fileType"       TEXT          NOT NULL,
  "rowCount"       INTEGER       NOT NULL DEFAULT 0,
  "matchedCount"   INTEGER       NOT NULL DEFAULT 0,
  "unmatchedCount" INTEGER       NOT NULL DEFAULT 0,
  "status"         "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "importedBy"     TEXT,
  "importedAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BankStatementImport_organizationId_idx"
  ON "BankStatementImport"("organizationId");
CREATE INDEX IF NOT EXISTS "BankStatementImport_bankAccountId_idx"
  ON "BankStatementImport"("bankAccountId");
CREATE INDEX IF NOT EXISTS "BankStatementImport_status_idx"
  ON "BankStatementImport"("status");

ALTER TABLE "BankStatementImport"
  ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── BankImportTransaction ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BankImportTransaction" (
  "id"             TEXT           NOT NULL,
  "importId"       TEXT           NOT NULL,
  "organizationId" TEXT           NOT NULL,
  "bankAccountId"  TEXT           NOT NULL,
  "date"           TIMESTAMP(3)   NOT NULL,
  "description"    TEXT           NOT NULL,
  "amount"         DECIMAL(15,2)  NOT NULL,
  "type"           "TransactionType" NOT NULL,
  "reference"      TEXT,
  "externalRef"    TEXT,
  "matchedTxnId"   TEXT,
  "matchStatus"    "MatchStatus"  NOT NULL DEFAULT 'UNMATCHED',
  "confirmedAt"    TIMESTAMP(3),
  "confirmedBy"    TEXT,
  "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankImportTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BankImportTransaction_importId_idx"
  ON "BankImportTransaction"("importId");
CREATE INDEX IF NOT EXISTS "BankImportTransaction_organizationId_idx"
  ON "BankImportTransaction"("organizationId");
CREATE INDEX IF NOT EXISTS "BankImportTransaction_matchStatus_idx"
  ON "BankImportTransaction"("matchStatus");
CREATE INDEX IF NOT EXISTS "BankImportTransaction_date_idx"
  ON "BankImportTransaction"("date");

ALTER TABLE "BankImportTransaction"
  ADD CONSTRAINT "BankImportTransaction_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
