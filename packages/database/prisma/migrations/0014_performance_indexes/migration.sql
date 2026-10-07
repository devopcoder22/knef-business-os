-- Stage 22 Performance Indexes
-- Strategy: standard CREATE INDEX IF NOT EXISTS (transactional).
--
-- CONCURRENTLY was removed because Prisma 5.22.0 wraps each migration in a
-- PostgreSQL transaction, and CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block. The "not run in a transaction" pragma is not present in
-- the Prisma 5.22.0 schema-engine binary.
--
-- These are additive indexes on an initial deployment. Table sizes are small
-- at first deploy. Standard CREATE INDEX (with IF NOT EXISTS for idempotency)
-- is correct and safe. If applied to a large live database in a future upgrade,
-- run the indexes manually outside a transaction with CONCURRENTLY before
-- running prisma migrate deploy.
--
-- Index justifications:
--   Payment.invoiceId           — invoice payment lookup (recordPayment, invoice detail)
--   SalesOrder.userId           — per-user sales history / commission reporting
--   Invoice.orderId             — order→invoice navigation (common in dashboard)
--   BankTransaction.reconciled  — reconciliation filter queries
--   BankTransaction.(bankAccountId,date) — statement/date-range queries
--   PurchaseOrder.locationId    — multi-location PO dashboard filters

CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx"
  ON "Payment"("invoiceId");

CREATE INDEX IF NOT EXISTS "SalesOrder_userId_idx"
  ON "SalesOrder"("userId");

CREATE INDEX IF NOT EXISTS "Invoice_orderId_idx"
  ON "Invoice"("orderId");

CREATE INDEX IF NOT EXISTS "BankTransaction_reconciled_idx"
  ON "BankTransaction"("reconciled");

CREATE INDEX IF NOT EXISTS "BankTransaction_bankAccountId_date_idx"
  ON "BankTransaction"("bankAccountId", "date");

CREATE INDEX IF NOT EXISTS "PurchaseOrder_locationId_idx"
  ON "PurchaseOrder"("locationId");
