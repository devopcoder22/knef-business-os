-- CreateTable: storefront testimonials for admin-managed social proof
CREATE TABLE "storefront_testimonials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rating" INTEGER,
    "location" TEXT,
    "productName" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storefront_testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storefront_testimonials_organizationId_isActive_idx" ON "storefront_testimonials"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "storefront_testimonials_organizationId_displayOrder_idx" ON "storefront_testimonials"("organizationId", "displayOrder");

-- AddForeignKey
ALTER TABLE "storefront_testimonials" ADD CONSTRAINT "storefront_testimonials_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
