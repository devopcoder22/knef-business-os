-- Telegram Bot: extend TelegramConfig with webhookSecret
ALTER TABLE "TelegramConfig"
  ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;

-- Telegram Bot: extend TelegramUserLink with chatId, verification timestamp, and per-user notification prefs
ALTER TABLE "TelegramUserLink"
  ADD COLUMN IF NOT EXISTS "telegramChatId"  TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notifyOrders"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyInventory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyFinance"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notifyTasks"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyLowStock"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notifyTargets"   BOOLEAN NOT NULL DEFAULT false;
