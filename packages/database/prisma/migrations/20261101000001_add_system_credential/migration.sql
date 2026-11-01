-- System-level encrypted credential store (AES-256-GCM, DB-first, env fallback)

CREATE TABLE "SystemCredential" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  CONSTRAINT "SystemCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemCredential_key_key" ON "SystemCredential"("key");
CREATE INDEX "SystemCredential_key_idx" ON "SystemCredential"("key");
