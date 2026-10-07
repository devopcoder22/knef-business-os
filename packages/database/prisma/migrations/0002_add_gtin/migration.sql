-- AlterTable: add gtin to products
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gtin" TEXT;

-- AlterTable: add gtin to product_variants
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
