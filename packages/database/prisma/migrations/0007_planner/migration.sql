-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('PERSONAL', 'BUSINESS', 'PROJECT', 'CAMPAIGN', 'OPERATIONAL', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateTable: Plan
CREATE TABLE "Plan" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId"        TEXT,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "objective"      TEXT,
    "type"           "PlanType" NOT NULL DEFAULT 'PERSONAL',
    "status"         "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate"      TIMESTAMP(3),
    "targetDate"     TIMESTAMP(3),
    "goalId"         TEXT,
    "metadata"       JSONB,
    "previewData"    JSONB,
    "createdBy"      TEXT NOT NULL,
    "approvedBy"     TEXT,
    "approvedAt"     TIMESTAMP(3),
    "templateId"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlanStep
CREATE TABLE "PlanStep" (
    "id"          TEXT NOT NULL,
    "planId"      TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "objective"   TEXT,
    "ownerId"     TEXT,
    "startDate"   TIMESTAMP(3),
    "targetDate"  TIMESTAMP(3),
    "status"      TEXT NOT NULL DEFAULT 'PENDING',
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "kpiName"     TEXT,
    "kpiTarget"   TEXT,
    "kpiUnit"     TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlanTaskLink
CREATE TABLE "PlanTaskLink" (
    "id"           TEXT NOT NULL,
    "planId"       TEXT NOT NULL,
    "stepId"       TEXT,
    "taskId"       TEXT,
    "isProposed"   BOOLEAN NOT NULL DEFAULT true,
    "proposedData" JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlanTemplate
CREATE TABLE "PlanTemplate" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "type"           "PlanType" NOT NULL DEFAULT 'BUSINESS',
    "structure"      JSONB NOT NULL DEFAULT '{}',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdBy"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_organizationId_idx" ON "Plan"("organizationId");
CREATE INDEX "Plan_status_idx" ON "Plan"("status");
CREATE INDEX "Plan_ownerId_idx" ON "Plan"("ownerId");
CREATE INDEX "PlanStep_planId_idx" ON "PlanStep"("planId");
CREATE INDEX "PlanTaskLink_planId_idx" ON "PlanTaskLink"("planId");
CREATE INDEX "PlanTaskLink_taskId_idx" ON "PlanTaskLink"("taskId");
CREATE UNIQUE INDEX "PlanTemplate_organizationId_name_key" ON "PlanTemplate"("organizationId", "name");
CREATE INDEX "PlanTemplate_organizationId_idx" ON "PlanTemplate"("organizationId");

-- AddForeignKey
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanTaskLink" ADD CONSTRAINT "PlanTaskLink_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanTaskLink" ADD CONSTRAINT "PlanTaskLink_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "PlanStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Plan" ADD CONSTRAINT "Plan_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "PlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
