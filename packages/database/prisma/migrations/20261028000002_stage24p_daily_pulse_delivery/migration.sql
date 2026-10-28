-- Phase 24P: Daily Pulse scheduled delivery config + idempotency log

CREATE TABLE "DailyPulseConfig" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled"        BOOLEAN NOT NULL DEFAULT false,
  "deliveryTime"   TEXT NOT NULL DEFAULT '08:00',
  "timezone"       TEXT NOT NULL DEFAULT 'UTC',
  "channels"       JSONB NOT NULL DEFAULT '[]',
  "recipientIds"   JSONB NOT NULL DEFAULT '[]',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyPulseConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyPulseConfig_organizationId_key" ON "DailyPulseConfig"("organizationId");

CREATE TABLE "DailyPulseDelivery" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "pulseDate"      DATE NOT NULL,
  "channel"        TEXT NOT NULL,
  "recipientRef"   TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"         TIMESTAMP(3),
  "error"          TEXT,
  CONSTRAINT "DailyPulseDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyPulseDelivery_idempotencyKey_key" ON "DailyPulseDelivery"("idempotencyKey");
CREATE INDEX "DailyPulseDelivery_organizationId_pulseDate_idx" ON "DailyPulseDelivery"("organizationId", "pulseDate");
