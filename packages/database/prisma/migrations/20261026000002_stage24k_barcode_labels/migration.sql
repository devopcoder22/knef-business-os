-- Stage 24K: Barcode types for product label printing
CREATE TYPE "BarcodeType" AS ENUM ('CODE128', 'EAN13');

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcodeType" "BarcodeType" DEFAULT 'CODE128';
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "barcodeType" "BarcodeType" DEFAULT 'CODE128';

-- Backfill: products with a 13-digit numeric gtin → EAN13, else CODE128
UPDATE "Product" SET "barcodeType" = 'EAN13'
  WHERE gtin IS NOT NULL AND gtin ~ '^[0-9]{13}$';
