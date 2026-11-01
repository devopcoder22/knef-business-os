-- Make SalesOrder.userId nullable so user deletion doesn't break historical orders
ALTER TABLE "SalesOrder" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "SalesOrder" DROP CONSTRAINT IF EXISTS "SalesOrder_userId_fkey";
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make POSSession.userId nullable so user deletion doesn't break session records
ALTER TABLE "POSSession" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "POSSession" DROP CONSTRAINT IF EXISTS "POSSession_userId_fkey";
ALTER TABLE "POSSession" ADD CONSTRAINT "POSSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Make TaskComment.userId nullable so user deletion preserves task history
ALTER TABLE "TaskComment" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "TaskComment" DROP CONSTRAINT IF EXISTS "TaskComment_userId_fkey";
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Employee should cascade-delete when user is deleted
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_userId_fkey";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
