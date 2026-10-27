-- Phase 24L: Shopify Integration

CREATE TYPE "ShopifySyncStatus" AS ENUM (
  'NOT_SYNCED', 'SYNCING', 'SYNCED', 'OUT_OF_SYNC',
  'FAILED', 'REQUIRES_MAPPING', 'CONFLICT'
);

CREATE TYPE "ShopifyWebhookStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE'
);

ALTER TYPE "SalesChannel" ADD VALUE IF NOT EXISTS 'SHOPIFY';

CREATE TABLE "ShopifyProductMapping" (
  "id"                     TEXT NOT NULL,
  "organizationId"         TEXT NOT NULL,
  "externalConnectionId"   TEXT NOT NULL,
  "productId"              TEXT NOT NULL,
  "variantId"              TEXT,
  "shopifyProductId"       TEXT NOT NULL,
  "shopifyVariantId"       TEXT,
  "shopifyInventoryItemId" TEXT,
  "shopifyHandle"          TEXT,
  "syncStatus"             "ShopifySyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
  "lastLocalHash"          TEXT,
  "lastSyncedAt"           TIMESTAMP(3),
  "syncError"              TEXT,
  "syncRetryCount"         INTEGER NOT NULL DEFAULT 0,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopifyProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopifyLocationMapping" (
  "id"                   TEXT NOT NULL,
  "organizationId"       TEXT NOT NULL,
  "externalConnectionId" TEXT NOT NULL,
  "locationId"           TEXT NOT NULL,
  "shopifyLocationId"    TEXT NOT NULL,
  "shopifyLocationName"  TEXT,
  "fulfillsOnlineOrders" BOOLEAN NOT NULL DEFAULT false,
  "isActive"             BOOLEAN NOT NULL DEFAULT true,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopifyLocationMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopifyWebhookEvent" (
  "id"                   TEXT NOT NULL,
  "organizationId"       TEXT NOT NULL,
  "externalConnectionId" TEXT NOT NULL,
  "shopifyDeliveryId"    TEXT NOT NULL,
  "shopifyEventId"       TEXT,
  "topic"                TEXT NOT NULL,
  "shopDomain"           TEXT NOT NULL,
  "receivedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"          TIMESTAMP(3),
  "status"               "ShopifyWebhookStatus" NOT NULL DEFAULT 'PENDING',
  "error"                TEXT,
  CONSTRAINT "ShopifyWebhookEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "externalOrderId"      TEXT,
  ADD COLUMN IF NOT EXISTS "externalOrderName"    TEXT,
  ADD COLUMN IF NOT EXISTS "externalProvider"     TEXT,
  ADD COLUMN IF NOT EXISTS "externalConnectionId" TEXT;

-- Unique constraints
ALTER TABLE "ShopifyProductMapping"
  ADD CONSTRAINT "ShopifyProductMapping_org_conn_prod_var_key"
    UNIQUE ("organizationId", "externalConnectionId", "productId", "variantId");
ALTER TABLE "ShopifyProductMapping"
  ADD CONSTRAINT "ShopifyProductMapping_org_conn_spid_svid_key"
    UNIQUE ("organizationId", "externalConnectionId", "shopifyProductId", "shopifyVariantId");
ALTER TABLE "ShopifyLocationMapping"
  ADD CONSTRAINT "ShopifyLocationMapping_org_conn_loc_key"
    UNIQUE ("organizationId", "externalConnectionId", "locationId");
ALTER TABLE "ShopifyLocationMapping"
  ADD CONSTRAINT "ShopifyLocationMapping_org_conn_slid_key"
    UNIQUE ("organizationId", "externalConnectionId", "shopifyLocationId");
ALTER TABLE "ShopifyWebhookEvent"
  ADD CONSTRAINT "ShopifyWebhookEvent_deliveryId_key"
    UNIQUE ("shopifyDeliveryId");

-- Indexes
CREATE INDEX "ShopifyProductMapping_org_conn_idx" ON "ShopifyProductMapping"("organizationId", "externalConnectionId");
CREATE INDEX "ShopifyProductMapping_org_status_idx" ON "ShopifyProductMapping"("organizationId", "syncStatus");
CREATE INDEX "ShopifyProductMapping_productId_idx" ON "ShopifyProductMapping"("productId");
CREATE INDEX "ShopifyLocationMapping_org_conn_idx" ON "ShopifyLocationMapping"("organizationId", "externalConnectionId");
CREATE INDEX "ShopifyWebhookEvent_org_conn_idx" ON "ShopifyWebhookEvent"("organizationId", "externalConnectionId");
CREATE INDEX "ShopifyWebhookEvent_status_idx" ON "ShopifyWebhookEvent"("status");
CREATE INDEX "ShopifyWebhookEvent_topic_status_idx" ON "ShopifyWebhookEvent"("topic", "status");
CREATE INDEX "SalesOrder_external_idx" ON "SalesOrder"("externalOrderId", "externalProvider");
CREATE INDEX "SalesOrder_extconn_idx" ON "SalesOrder"("externalConnectionId");

-- Foreign keys
ALTER TABLE "ShopifyProductMapping"
  ADD CONSTRAINT "ShopifyProductMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShopifyProductMapping_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShopifyProductMapping_externalConnectionId_fkey" FOREIGN KEY ("externalConnectionId") REFERENCES "external_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopifyLocationMapping"
  ADD CONSTRAINT "ShopifyLocationMapping_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShopifyLocationMapping_externalConnectionId_fkey" FOREIGN KEY ("externalConnectionId") REFERENCES "external_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopifyWebhookEvent"
  ADD CONSTRAINT "ShopifyWebhookEvent_externalConnectionId_fkey" FOREIGN KEY ("externalConnectionId") REFERENCES "external_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
