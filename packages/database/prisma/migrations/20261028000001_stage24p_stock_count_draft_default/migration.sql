-- Phase 24P follow-up: set StockCount status default to DRAFT
-- This must be a separate migration from the ALTER TYPE ... ADD VALUE statements
-- because PostgreSQL prohibits using a newly-added enum value in the same transaction.

ALTER TABLE "StockCount" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"CountStatus";
