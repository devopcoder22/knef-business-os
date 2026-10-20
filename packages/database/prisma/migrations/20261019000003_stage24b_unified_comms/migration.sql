-- Stage 24B: Unified Communications Foundation
-- Adds: SmsProvider, ChannelPreference, PushSubscription, WhatsAppConfig, CommunicationLog

CREATE TABLE "sms_providers" (
    "id"               TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "provider"         TEXT NOT NULL,
    "apiKeyEncrypted"  TEXT NOT NULL,
    "senderId"         TEXT,
    "isDefault"        BOOLEAN NOT NULL DEFAULT false,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_preferences" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT,
    "email"          TEXT,
    "phone"          TEXT,
    "channel"        TEXT NOT NULL,
    "messageType"    TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'subscribed',
    "consentAt"      TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "source"         TEXT,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_subscriptions" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "endpoint"       TEXT NOT NULL,
    "p256dhKey"      TEXT NOT NULL,
    "authKey"        TEXT NOT NULL,
    "userAgent"      TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_configs" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "phoneNumberId"        TEXT NOT NULL,
    "businessAccountId"    TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "webhookVerifyToken"   TEXT,
    "isActive"             BOOLEAN NOT NULL DEFAULT true,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_logs" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "userId"            TEXT,
    "channel"           TEXT NOT NULL,
    "messageType"       TEXT NOT NULL,
    "recipient"         TEXT NOT NULL,
    "subject"           TEXT,
    "status"            TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "errorMessage"      TEXT,
    "attemptCount"      INTEGER NOT NULL DEFAULT 0,
    "sentAt"            TIMESTAMP(3),
    "deliveredAt"       TIMESTAMP(3),
    "failedAt"          TIMESTAMP(3),
    "metadata"          JSONB,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "sms_providers"       ADD CONSTRAINT "sms_providers_organizationId_fkey"       FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_preferences" ADD CONSTRAINT "channel_preferences_organizationId_fkey"  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_preferences" ADD CONSTRAINT "channel_preferences_userId_fkey"          FOREIGN KEY ("userId")         REFERENCES "users"("id")         ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions"  ADD CONSTRAINT "push_subscriptions_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions"  ADD CONSTRAINT "push_subscriptions_userId_fkey"           FOREIGN KEY ("userId")         REFERENCES "users"("id")         ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_configs"    ADD CONSTRAINT "whatsapp_configs_organizationId_fkey"     FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_logs"  ADD CONSTRAINT "communication_logs_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraints
CREATE UNIQUE INDEX "sms_providers_organizationId_provider_key"    ON "sms_providers"("organizationId", "provider");
CREATE UNIQUE INDEX "push_subscriptions_userId_endpoint_key"        ON "push_subscriptions"("userId", "endpoint");
CREATE UNIQUE INDEX "whatsapp_configs_organizationId_key"           ON "whatsapp_configs"("organizationId");

-- Indexes
CREATE INDEX "sms_providers_organizationId_isDefault_idx"           ON "sms_providers"("organizationId", "isDefault");
CREATE INDEX "channel_preferences_organizationId_channel_status_idx" ON "channel_preferences"("organizationId", "channel", "status");
CREATE INDEX "channel_preferences_organizationId_userId_channel_idx"  ON "channel_preferences"("organizationId", "userId", "channel");
CREATE INDEX "channel_preferences_organizationId_email_channel_idx"   ON "channel_preferences"("organizationId", "email", "channel");
CREATE INDEX "channel_preferences_organizationId_phone_channel_idx"   ON "channel_preferences"("organizationId", "phone", "channel");
CREATE INDEX "push_subscriptions_organizationId_userId_idx"           ON "push_subscriptions"("organizationId", "userId");
CREATE INDEX "communication_logs_organizationId_channel_status_idx"   ON "communication_logs"("organizationId", "channel", "status");
CREATE INDEX "communication_logs_organizationId_userId_idx"           ON "communication_logs"("organizationId", "userId");
CREATE INDEX "communication_logs_organizationId_createdAt_idx"        ON "communication_logs"("organizationId", "createdAt");
