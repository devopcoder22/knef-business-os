-- Stage 18: CRM notes, tags, task-customer link, receipt-customer relation

-- CustomerNote: append-only notes per customer
CREATE TABLE IF NOT EXISTS "CustomerNote" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId"     TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "createdBy"      TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerNote_organizationId_idx" ON "CustomerNote"("organizationId");
CREATE INDEX IF NOT EXISTS "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");
DO $$ BEGIN
  ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

-- CustomerTag: org-level tag definitions
CREATE TABLE IF NOT EXISTS "CustomerTag" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "color"          TEXT NOT NULL DEFAULT '#6B7280',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTag_organizationId_name_key" ON "CustomerTag"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "CustomerTag_organizationId_idx" ON "CustomerTag"("organizationId");

-- CustomerTagAssignment: many-to-many customer <-> tag
CREATE TABLE IF NOT EXISTS "CustomerTagAssignment" (
    "id"         TEXT NOT NULL,
    "tagId"      TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerTagAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerTagAssignment_tagId_customerId_key" ON "CustomerTagAssignment"("tagId", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerTagAssignment_tagId_idx" ON "CustomerTagAssignment"("tagId");
CREATE INDEX IF NOT EXISTS "CustomerTagAssignment_customerId_idx" ON "CustomerTagAssignment"("customerId");
DO $$ BEGIN
  ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_tagId_fkey"
      FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;
DO $$ BEGIN
  ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

-- Task: add optional customerId link
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_customerId_idx" ON "Task"("customerId");
DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;

-- Receipt: add customer relation index (FK already exists via customerId column)
CREATE INDEX IF NOT EXISTS "Receipt_customerId_idx" ON "Receipt"("customerId");
DO $$ BEGIN
  ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END; $$;
