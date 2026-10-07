-- Global search indexes (Stage 13)
-- Enables fast partial-match and identifier searches across the entity graph.
-- pg_trgm extension is enabled by migration 0001_init.

-- Trigram GIN indexes for partial-match name searches
CREATE INDEX IF NOT EXISTS "product_name_trgm_idx" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customer_firstName_trgm_idx" ON "Customer" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customer_lastName_trgm_idx" ON "Customer" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customer_phone_trgm_idx" ON "Customer" USING gin ("phone" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "supplier_name_trgm_idx" ON "Supplier" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "task_title_trgm_idx" ON "Task" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "expense_vendor_trgm_idx" ON "Expense" USING gin ("vendor" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "bank_tx_description_trgm_idx" ON "BankTransaction" USING gin ("description" gin_trgm_ops);

-- B-tree indexes for identifier exact / prefix matches
CREATE INDEX IF NOT EXISTS "serialized_unit_imei2_idx" ON "SerializedUnit" ("imei2");
CREATE INDEX IF NOT EXISTS "serialized_unit_serial_number_idx" ON "SerializedUnit" ("serialNumber");
CREATE INDEX IF NOT EXISTS "invoice_reference_idx" ON "Invoice" ("reference");
CREATE INDEX IF NOT EXISTS "payment_reference_idx" ON "Payment" ("reference");
CREATE INDEX IF NOT EXISTS "bank_tx_reference_idx" ON "BankTransaction" ("reference");
