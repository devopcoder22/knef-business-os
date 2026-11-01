-- Add isActive to Role (default true so existing roles remain active)
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserFeatureFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'INHERIT',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserFeatureFlag_userId_idx" ON "UserFeatureFlag"("userId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserFeatureFlag_userId_featureKey_key" ON "UserFeatureFlag"("userId", "featureKey");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UserFeatureFlag" ADD CONSTRAINT "UserFeatureFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;
