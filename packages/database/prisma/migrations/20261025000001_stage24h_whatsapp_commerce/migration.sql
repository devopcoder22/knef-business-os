-- Phase 24H: WhatsApp Commerce
-- Extends WhatsAppConfig, adds WhatsApp models, adds CustomerAccount opt-in fields

-- WhatsAppConfig new columns
ALTER TABLE "whatsapp_configs"
  ADD COLUMN IF NOT EXISTS "displayPhoneNumber"   TEXT,
  ADD COLUMN IF NOT EXISTS "businessAccountName"  TEXT,
  ADD COLUMN IF NOT EXISTS "appSecretEncrypted"   TEXT,
  ADD COLUMN IF NOT EXISTS "status"               TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS "webhookVerifiedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastHealthCheckAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "qualityRating"        TEXT,
  ADD COLUMN IF NOT EXISTS "messagingLimit"       TEXT,
  ADD COLUMN IF NOT EXISTS "connectionId"         TEXT;

-- CustomerAccount opt-in fields (table uses PascalCase — no @@map in schema)
ALTER TABLE "CustomerAccount"
  ADD COLUMN IF NOT EXISTS "whatsappOptIn"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "whatsappOptInAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "whatsappPhone"    TEXT;

-- WhatsAppTemplate
CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "whatsAppConfigId"    TEXT NOT NULL,
  "providerTemplateId"  TEXT,
  "name"                TEXT NOT NULL,
  "language"            TEXT NOT NULL DEFAULT 'en_US',
  "category"            TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'DRAFT',
  "components"          JSONB,
  "rejectionReason"     TEXT,
  "lastSyncedAt"        TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_templates_org_name_lang_key" UNIQUE ("organizationId","name","language"),
  CONSTRAINT "whatsapp_templates_configId_fkey" FOREIGN KEY ("whatsAppConfigId")
    REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_templates_orgId_status_idx" ON "whatsapp_templates"("organizationId","status");
CREATE INDEX IF NOT EXISTS "whatsapp_templates_configId_idx" ON "whatsapp_templates"("whatsAppConfigId");

-- WhatsAppConversation
CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id"                      TEXT NOT NULL,
  "organizationId"          TEXT NOT NULL,
  "whatsAppConfigId"        TEXT NOT NULL,
  "providerConversationId"  TEXT,
  "customerPhone"           TEXT NOT NULL,
  "businessPhoneNumberId"   TEXT NOT NULL,
  "customerAccountId"       TEXT,
  "orderId"                 TEXT,
  "status"                  TEXT NOT NULL DEFAULT 'OPEN',
  "windowExpiresAt"         TIMESTAMPTZ,
  "lastInboundAt"           TIMESTAMPTZ,
  "lastOutboundAt"          TIMESTAMPTZ,
  "unreadCount"             INTEGER NOT NULL DEFAULT 0,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_conversations_configId_fkey" FOREIGN KEY ("whatsAppConfigId")
    REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_org_phone_idx" ON "whatsapp_conversations"("organizationId","customerPhone");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_org_status_idx" ON "whatsapp_conversations"("organizationId","status");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_configId_idx" ON "whatsapp_conversations"("whatsAppConfigId");

-- WhatsAppMessage
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "conversationId"      TEXT NOT NULL,
  "providerMessageId"   TEXT,
  "direction"           TEXT NOT NULL,
  "fromNumber"          TEXT NOT NULL,
  "toNumber"            TEXT NOT NULL,
  "messageType"         TEXT NOT NULL DEFAULT 'text',
  "body"                TEXT,
  "templateName"        TEXT,
  "templateLanguage"    TEXT,
  "templateComponents"  JSONB,
  "status"              TEXT NOT NULL DEFAULT 'QUEUED',
  "errorCode"           INTEGER,
  "errorMessage"        TEXT,
  "idempotencyKey"      TEXT,
  "communicationLogId"  TEXT,
  "sentAt"              TIMESTAMPTZ,
  "deliveredAt"         TIMESTAMPTZ,
  "readAt"              TIMESTAMPTZ,
  "failedAt"            TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_messages_org_provId_key" UNIQUE ("organizationId","providerMessageId"),
  CONSTRAINT "whatsapp_messages_idem_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "whatsapp_messages_convId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_messages_convId_idx" ON "whatsapp_messages"("conversationId");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_org_dir_idx" ON "whatsapp_messages"("organizationId","direction");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_org_status_idx" ON "whatsapp_messages"("organizationId","status");

-- WhatsAppOrderEventMapping
CREATE TABLE IF NOT EXISTS "whatsapp_order_event_mappings" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "whatsAppConfigId" TEXT NOT NULL,
  "orderEvent"       TEXT NOT NULL,
  "templateId"       TEXT NOT NULL,
  "isActive"         BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "whatsapp_order_event_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_order_event_mappings_org_event_key" UNIQUE ("organizationId","orderEvent"),
  CONSTRAINT "whatsapp_order_event_mappings_configId_fkey" FOREIGN KEY ("whatsAppConfigId")
    REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE,
  CONSTRAINT "whatsapp_order_event_mappings_templateId_fkey" FOREIGN KEY ("templateId")
    REFERENCES "whatsapp_templates"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_order_mappings_org_active_idx" ON "whatsapp_order_event_mappings"("organizationId","isActive");
