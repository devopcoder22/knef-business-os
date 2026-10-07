-- Stage 22 Performance Indexes
-- Justification: High-frequency query patterns identified in audit:
--   Payment.invoiceId    — invoice payment lookup (recordPayment, invoice detail)
--   SalesOrder.userId    — per-user sales history / commission reporting
--   Invoice.orderId      — order→invoice navigation (common in dashboard)
--   BankTransaction.reconciled        — reconciliation filter queries
--   BankTransaction.(bankAccountId,date) — statement/date-range queries
--   PurchaseOrder.locationId — multi-location PO dashboard filters
--
-- All indexes are additive — zero data risk. Safe to apply on live database.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_invoiceId_idx"
  ON "Payment"("invoiceId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SalesOrder_userId_idx"
  ON "SalesOrder"("userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_orderId_idx"
  ON "Invoice"("orderId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "BankTransaction_reconciled_idx"
  ON "BankTransaction"("reconciled");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "BankTransaction_bankAccountId_date_idx"
  ON "BankTransaction"("bankAccountId", "date");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PurchaseOrder_locationId_idx"
  ON "PurchaseOrder"("locationId");
