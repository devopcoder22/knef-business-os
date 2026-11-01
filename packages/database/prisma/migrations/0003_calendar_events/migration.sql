-- AlterTable: extend CalendarIntegration with scope, syncToken, calendarName
ALTER TABLE "CalendarIntegration" ADD COLUMN IF NOT EXISTS "calendarName" TEXT;
ALTER TABLE "CalendarIntegration" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "CalendarIntegration" ADD COLUMN IF NOT EXISTS "syncToken" TEXT;

-- CreateIndex: add userId index to CalendarIntegration
CREATE INDEX IF NOT EXISTS "CalendarIntegration_userId_idx" ON "CalendarIntegration"("userId");

-- CreateTable: CalendarEvent
CREATE TABLE IF NOT EXISTS "CalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "attendees" JSONB,
    "recurrence" JSONB,
    "reminders" JSONB,
    "htmlLink" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on (integrationId, externalEventId)
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarEvent_integrationId_externalEventId_key" ON "CalendarEvent"("integrationId", "externalEventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalendarEvent_organizationId_idx" ON "CalendarEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_userId_idx" ON "CalendarEvent"("userId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_integrationId_idx" ON "CalendarEvent"("integrationId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "CalendarIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;
