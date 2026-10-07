-- AlterTable: add gtin to products
ALTER TABLE "products" ADD COLUMN "gtin" TEXT;

-- AlterTable: add gtin to product_variants
ALTER TABLE "product_variants" ADD COLUMN "gtin" TEXT;
