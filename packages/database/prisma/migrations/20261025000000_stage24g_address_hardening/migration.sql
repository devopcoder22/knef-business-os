-- AddressSource enum
CREATE TYPE "AddressSource" AS ENUM ('GOOGLE_PLACE', 'MANUAL', 'SAVED_ADDRESS', 'ADMIN', 'IMPORTED');

-- SavedAddress table
CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "fullName" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "landmark" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "countryCode" TEXT DEFAULT 'NG',
    "placeId" TEXT,
    "formattedAddress" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "addressSource" "AddressSource" NOT NULL DEFAULT 'MANUAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

-- Extend SalesOrder
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryLandmark" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryCountry" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryPlaceId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryLatitude" DECIMAL(10,7);
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryLongitude" DECIMAL(10,7);
ALTER TABLE "SalesOrder" ADD COLUMN "deliveryAddressSource" "AddressSource";

-- FK constraint
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_customerAccountId_fkey"
    FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "SavedAddress_customerAccountId_idx" ON "SavedAddress"("customerAccountId");
CREATE INDEX "SavedAddress_organizationId_idx" ON "SavedAddress"("organizationId");
