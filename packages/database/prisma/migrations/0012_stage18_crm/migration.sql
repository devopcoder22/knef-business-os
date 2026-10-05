-- Stage 18: CRM notes, tags, task-customer link, receipt-customer relation

-- CustomerNote: append-only notes per customer
CREATE TABLE "CustomerNote" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId"     TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "createdBy"      TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerNote_organizationId_idx" ON "CustomerNote"("organizationId");
CREATE INDEX "CustomerNote_customerId_idx" ON "CustomerNote"("customerId");
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomerTag: org-level tag definitions
CREATE TABLE "CustomerTag" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "color"          TEXT NOT NULL DEFAULT '#6B7280',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerTag_organizationId_name_key" ON "CustomerTag"("organizationId", "name");
CREATE INDEX "CustomerTag_organizationId_idx" ON "CustomerTag"("organizationId");

-- CustomerTagAssignment: many-to-many customer <-> tag
CREATE TABLE "CustomerTagAssignment" (
    "id"         TEXT NOT NULL,
    "tagId"      TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerTagAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerTagAssignment_tagId_customerId_key" ON "CustomerTagAssignment"("tagId", "customerId");
CREATE INDEX "CustomerTagAssignment_tagId_idx" ON "CustomerTagAssignment"("tagId");
CREATE INDEX "CustomerTagAssignment_customerId_idx" ON "CustomerTagAssignment"("customerId");
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTagAssignment" ADD CONSTRAINT "CustomerTagAssignment_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Task: add optional customerId link
ALTER TABLE "Task" ADD COLUMN "customerId" TEXT;
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Receipt: add customer relation index (FK already exists via customerId column)
CREATE INDEX IF NOT EXISTS "Receipt_customerId_idx" ON "Receipt"("customerId");
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
