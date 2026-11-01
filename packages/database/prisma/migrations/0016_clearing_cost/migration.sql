-- AlterTable: add clearingCost to PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "clearingCost" DECIMAL(15,2) NOT NULL DEFAULT 0;
