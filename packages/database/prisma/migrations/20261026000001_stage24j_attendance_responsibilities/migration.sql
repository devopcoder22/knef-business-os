-- Extend AttendanceStatus enum
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'EXCUSED';
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'CORRECTED';

-- Add fields to Attendance
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "locationId" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "clockInSource" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "clockOutSource" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "correctionReason" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "correctedById" TEXT;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "correctedAt" TIMESTAMPTZ;
ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill organizationId from Employee
UPDATE "Attendance" a SET "organizationId" = e."organizationId" FROM "Employee" e WHERE a."employeeId" = e."id";
ALTER TABLE "Attendance" ALTER COLUMN "organizationId" SET NOT NULL;

-- FK constraints
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New indexes
CREATE INDEX IF NOT EXISTS "Attendance_organizationId_idx" ON "Attendance"("organizationId");
CREATE INDEX IF NOT EXISTS "Attendance_organizationId_date_idx" ON "Attendance"("organizationId", "date");

-- EmployeeResponsibility table
CREATE TABLE IF NOT EXISTS "EmployeeResponsibility" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "locationId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startDate" TIMESTAMPTZ,
  "endDate" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeResponsibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeResponsibility_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeResponsibility_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmployeeResponsibility_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmployeeResponsibility_organizationId_idx" ON "EmployeeResponsibility"("organizationId");
CREATE INDEX IF NOT EXISTS "EmployeeResponsibility_employeeId_idx" ON "EmployeeResponsibility"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeResponsibility_organizationId_isActive_idx" ON "EmployeeResponsibility"("organizationId", "isActive");
