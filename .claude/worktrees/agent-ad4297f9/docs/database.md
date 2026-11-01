# KNEF Business OS — Database Architecture

> **Database:** PostgreSQL 16 + pgvector  
> **ORM:** Prisma 5  
> **Last updated:** 2026-09-29

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Multi-Tenancy](#2-multi-tenancy)
3. [Standard Fields](#3-standard-fields)
4. [Domain Model Overview](#4-domain-model-overview)
5. [Platform Layer](#5-platform-layer)
6. [Product Domain](#6-product-domain)
7. [Inventory Domain](#7-inventory-domain)
8. [Purchasing Domain](#8-purchasing-domain)
9. [Sales Domain](#9-sales-domain)
10. [Finance Domain](#10-finance-domain)
11. [Staff Domain](#11-staff-domain)
12. [Tasks and Goals](#12-tasks-and-goals)
13. [AI Domain](#13-ai-domain)
14. [Communications](#14-communications)
15. [System Tables](#15-system-tables)
16. [Indexing Strategy](#16-indexing-strategy)
17. [Database Rules](#17-database-rules)
18. [Financial Integrity Rules](#18-financial-integrity-rules)
19. [Costing Methods](#19-costing-methods)
20. [Migrations](#20-migrations)

---

## 1. Design Principles

- **UUIDs everywhere** — no sequential integer IDs exposed externally (cuid2 for readability)
- **`organizationId` on every business table** — hard multi-tenancy boundary
- **Standard audit fields** — `createdAt`, `updatedAt`, `createdBy`, `updatedBy` on all entities
- **Soft delete** (`deletedAt`) on entities users may need to recover
- **No soft delete** on ledger tables — use reversal/cancellation mechanisms instead
- **Foreign keys with cascades** — referential integrity enforced at database level
- **Indexes** — all `organizationId` + `createdAt`, all FK columns, all search fields
- **Unique constraints** at database level — not just application level
- **Transactions** — all multi-step business operations wrapped in database transactions

---

## 2. Multi-Tenancy

Single PostgreSQL schema. Every business row belongs to exactly one organization:

```sql
-- Example constraint on every business table:
CONSTRAINT products_org_fk FOREIGN KEY (organizationId) REFERENCES organizations(id)
```

The Prisma middleware automatically injects `organizationId` into every query. No query can cross organization boundaries.

---

## 3. Standard Fields

All entities include:

```prisma
id          String    @id @default(cuid())
createdAt   DateTime  @default(now())
updatedAt   DateTime  @updatedAt
createdById String?   // userId of creator
updatedById String?   // userId of last updater
```

Business entities also include:

```prisma
organizationId  String
deletedAt       DateTime?   // soft delete (where applicable)
```

---

## 4. Domain Model Overview

```
PLATFORM
  Organization → Location → Department
  User → UserRole → Role → RolePermission
              └── UserPermissionOverride

PRODUCTS
  Category (tree) → Product → ProductVariant
  Brand → Product
  Product → SerializedUnit (IMEI/serial)
  Product → ProductImage

INVENTORY
  Product + Location → InventoryLevel
  InventoryLevel ← InventoryMovement (ledger)
  StockTransfer → StockTransferItem
  StockAdjustment → StockAdjustmentItem
  StockCount → StockCountItem

PURCHASING
  Supplier → SupplierContact, SupplierPrice
  PurchaseOrder → PurchaseOrderItem
  PurchaseOrder → GoodsReceipt → GoodsReceiptItem
  Supplier → SupplierInvoice → SupplierPayment
  PurchaseOrder → PurchaseReturn

SALES
  Customer → SalesOrder → SalesOrderItem
  SalesOrder → Invoice → InvoiceItem
  SalesOrder → Receipt
  SalesOrder → Payment
  POSSession → SalesOrder

FINANCE
  BankAccount → BankTransaction
  Expense → ExpenseCategory
  TaxRate
  FinancialPeriod

STAFF
  Employee → Department, Location
  Employee → Attendance
  Employee → Commission
  StaffDuty

TASKS & GOALS
  Task → TaskComment, TaskChecklist, TaskAttachment
  Goal → GoalKPI, GoalProgress
  BusinessIdea

AI
  AIProvider → AIProviderRoute
  AIConversation → AIMessage
  AIMemory
  AIDocument → AIDocumentChunk (embedding)
  AITool → AIAction → AIApproval
  AIScheduledAgent
  AIUsageLog, AIBudget

COMMUNICATIONS
  EmailProvider
  EmailCampaign → EmailCampaignRecipient
  CommunicationTemplate
  TelegramConfig, TelegramUserLink
  Notification

SYSTEM
  AuditLog (immutable)
  APIKey
  FeatureFlag
  SystemSetting
  WebhookEndpoint → WebhookDelivery
  AutomationRule
  CalendarIntegration
  Integration
```

---

## 5. Platform Layer

### Organization
```prisma
model Organization {
  id          String    @id @default(cuid())
  name        String
  legalName   String?
  slug        String    @unique
  address     String?
  phone       String?
  email       String?
  logoUrl     String?
  currency    String    @default("NGN")
  timezone    String    @default("Africa/Lagos")
  fiscalYearStart Int   @default(1)  // month: 1 = January
  inventoryMethod String @default("WAC") // WAC | FIFO — locked after first transaction
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### Location
```prisma
model Location {
  id             String   @id @default(cuid())
  organizationId String
  name           String   // e.g., "KNEF HQ", "KNEF Oregun"
  type           String   // STORE | WAREHOUSE | OFFICE
  address        String?
  phone          String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
}
```

### User and Authentication
```prisma
model User {
  id                String    @id @default(cuid())
  organizationId    String
  email             String
  passwordHash      String
  firstName         String
  lastName          String
  phone             String?
  avatarUrl         String?
  status            String    @default("ACTIVE") // ACTIVE | INACTIVE | LOCKED
  emailVerifiedAt   DateTime?
  twoFactorEnabled  Boolean   @default(false)
  twoFactorSecret   String?   // encrypted
  failedLoginCount  Int       @default(0)
  lockedUntil       DateTime?
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  @@unique([organizationId, email])
  @@index([organizationId])
  @@index([email])
}

model RefreshToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  @@index([userId])
}
```

### RBAC
```prisma
model Role {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  isSystem       Boolean  @default(false) // system roles cannot be deleted
  isTemplate     Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, name])
  @@index([organizationId])
}

model RolePermission {
  id         String  @id @default(cuid())
  roleId     String
  permission String  // e.g., "products.create"
  locationId String? // null = all locations

  @@unique([roleId, permission, locationId])
}

model UserRole {
  id         String  @id @default(cuid())
  userId     String
  roleId     String
  locationId String? // null = all locations

  @@unique([userId, roleId, locationId])
}

model UserPermissionOverride {
  id             String  @id @default(cuid())
  organizationId String
  userId         String
  permission     String
  granted        Boolean // true = grant, false = revoke
  locationId     String?
  reason         String?
  grantedBy      String
  createdAt      DateTime @default(now())

  @@unique([userId, permission, locationId])
}
```

---

## 6. Product Domain

```prisma
model Category {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  slug           String
  parentId       String?  // self-relation for tree
  sortOrder      Int      @default(0)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, slug])
  @@index([organizationId, parentId])
}

model Brand {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  logoUrl        String?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, name])
}

model Product {
  id                String   @id @default(cuid())
  organizationId    String
  sku               String
  barcode           String?
  gtin              String?
  name              String
  description       String?
  brandId           String?
  categoryId        String?
  condition         String   @default("NEW") // NEW | USED | REFURBISHED
  costPrice         Decimal  @db.Decimal(15,2)
  sellingPrice      Decimal  @db.Decimal(15,2)
  wholesalePrice    Decimal? @db.Decimal(15,2)
  promoPrice        Decimal? @db.Decimal(15,2)
  minSellingPrice   Decimal? @db.Decimal(15,2)
  warrantyMonths    Int?
  weight            Decimal? @db.Decimal(8,3) // kg
  dimensions        Json?    // {l, w, h} in cm
  taxCategoryId     String?
  reorderLevel      Int      @default(0)
  maxStockLevel     Int?
  preferredSupplierId String?
  isSerialized      Boolean  @default(false) // tracks IMEI/serial
  hasVariants       Boolean  @default(false)
  status            String   @default("ACTIVE") // ACTIVE | INACTIVE | DISCONTINUED
  searchVector      Unsupported("tsvector")?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  deletedAt         DateTime?
  createdById       String?
  updatedById       String?

  @@unique([organizationId, sku])
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, categoryId])
  @@index([organizationId, brandId])
}

model ProductVariant {
  id             String   @id @default(cuid())
  productId      String
  sku            String
  barcode        String?
  attributes     Json     // {storage: "256GB", color: "Black", ram: "8GB"}
  costPrice      Decimal  @db.Decimal(15,2)
  sellingPrice   Decimal  @db.Decimal(15,2)
  promoPrice     Decimal? @db.Decimal(15,2)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([productId, sku])
}

model ProductImage {
  id        String  @id @default(cuid())
  productId String
  variantId String?
  url       String
  isPrimary Boolean @default(false)
  sortOrder Int     @default(0)
  createdAt DateTime @default(now())
}

model SerializedUnit {
  id              String   @id @default(cuid())
  organizationId  String
  productId       String
  variantId       String?
  imei1           String?
  imei2           String?
  serialNumber    String?
  supplierId      String?
  purchaseBatchId String?  // GoodsReceiptId
  purchaseDate    DateTime?
  locationId      String?
  status          String   @default("IN_STOCK")
  // IN_STOCK | RESERVED | SOLD | RETURNED | DAMAGED | WARRANTY | LOST | TRANSFERRED
  soldDate        DateTime?
  customerId      String?
  invoiceId       String?
  warrantyExpiry  DateTime?
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([organizationId, imei1])  // prevents duplicate IMEI1
  @@unique([organizationId, imei2])  // prevents duplicate IMEI2
  @@index([organizationId, status])
  @@index([organizationId, productId])
  @@index([organizationId, serialNumber])
}
```

---

## 7. Inventory Domain

```prisma
model InventoryLevel {
  id             String  @id @default(cuid())
  organizationId String
  productId      String
  variantId      String?
  locationId     String
  qty            Int     @default(0)
  reservedQty    Int     @default(0)   // held for pending orders
  damagedQty     Int     @default(0)
  avgCost        Decimal @default(0) @db.Decimal(15,2) // used for WAC
  updatedAt      DateTime @updatedAt

  @@unique([productId, variantId, locationId])
  @@index([organizationId, locationId])
  @@index([organizationId, productId])
}

// Immutable ledger — never soft-deleted
model InventoryMovement {
  id             String   @id @default(cuid())
  organizationId String
  productId      String
  variantId      String?
  serializedUnitId String?
  locationId     String
  type           String
  // PURCHASE | SALE | RETURN_IN | RETURN_OUT | TRANSFER_IN | TRANSFER_OUT
  // ADJUSTMENT | DAMAGE | LOSS | COUNT_CORRECTION | RESERVATION | RESERVATION_RELEASE
  qty            Int      // positive = in, negative = out
  unitCost       Decimal  @db.Decimal(15,2)
  totalCost      Decimal  @db.Decimal(15,2)
  referenceType  String?  // PURCHASE_ORDER | SALES_ORDER | TRANSFER | ADJUSTMENT
  referenceId    String?
  notes          String?
  createdById    String
  createdAt      DateTime @default(now())

  @@index([organizationId, productId, createdAt])
  @@index([organizationId, locationId, createdAt])
  @@index([referenceType, referenceId])
}

model StockTransfer {
  id             String   @id @default(cuid())
  organizationId String
  fromLocationId String
  toLocationId   String
  status         String   @default("DRAFT")
  // DRAFT | PENDING_APPROVAL | APPROVED | IN_TRANSIT | RECEIVED | CANCELLED
  requestedById  String
  approvedById   String?
  approvedAt     DateTime?
  shippedAt      DateTime?
  receivedAt     DateTime?
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, status])
}

model StockTransferItem {
  id               String  @id @default(cuid())
  transferId       String
  productId        String
  variantId        String?
  serializedUnitId String?
  qtyRequested     Int
  qtyShipped       Int     @default(0)
  qtyReceived      Int     @default(0)
}
```

---

## 8. Purchasing Domain

```prisma
model Supplier {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  email          String?
  phone          String?
  address        String?
  paymentTerms   Int      @default(30) // days
  leadTimeDays   Int      @default(7)
  currency       String   @default("NGN")
  rating         Int?     // 1-5
  notes          String?
  status         String   @default("ACTIVE")
  searchVector   Unsupported("tsvector")?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  @@index([organizationId, status])
}

model PurchaseOrder {
  id             String   @id @default(cuid())
  organizationId String
  poNumber       String
  supplierId     String
  locationId     String
  status         String   @default("DRAFT")
  // DRAFT | PENDING_APPROVAL | APPROVED | SENT | PARTIAL | RECEIVED | CANCELLED
  subtotal       Decimal  @db.Decimal(15,2)
  taxAmount      Decimal  @default(0) @db.Decimal(15,2)
  total          Decimal  @db.Decimal(15,2)
  expectedDate   DateTime?
  notes          String?
  requestedById  String
  approvedById   String?
  approvedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, poNumber])
  @@index([organizationId, status])
  @@index([organizationId, supplierId])
}

model PurchaseOrderItem {
  id        String  @id @default(cuid())
  poId      String
  productId String
  variantId String?
  qty       Int
  unitCost  Decimal @db.Decimal(15,2)
  total     Decimal @db.Decimal(15,2)
  receivedQty Int   @default(0)
}

model GoodsReceipt {
  id             String   @id @default(cuid())
  organizationId String
  grNumber       String
  poId           String
  locationId     String
  receivedById   String
  notes          String?
  createdAt      DateTime @default(now())

  @@unique([organizationId, grNumber])
  @@index([organizationId, poId])
}

model GoodsReceiptItem {
  id               String  @id @default(cuid())
  receiptId        String
  poItemId         String
  serializedUnitId String? // for serialized products
  qty              Int
  condition        String  @default("GOOD") // GOOD | DAMAGED | RETURNED
  notes            String?
}
```

---

## 9. Sales Domain

```prisma
model Customer {
  id               String   @id @default(cuid())
  organizationId   String
  type             String   @default("RETAIL") // RETAIL | WHOLESALE | CORPORATE
  firstName        String?
  lastName         String?
  businessName     String?
  phone            String
  email            String?
  address          String?
  totalSpend       Decimal  @default(0) @db.Decimal(15,2)
  outstandingBalance Decimal @default(0) @db.Decimal(15,2)
  lastPurchaseAt   DateTime?
  notes            String?
  searchVector     Unsupported("tsvector")?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  @@index([organizationId])
  @@index([organizationId, phone])
}

model SalesOrder {
  id             String   @id @default(cuid())
  organizationId String
  orderNumber    String
  customerId     String?
  locationId     String
  employeeId     String
  channel        String   @default("WALK_IN")
  // WALK_IN | WEBSITE | JUMIA | JIJI | KONGA | WHATSAPP | SOCIAL | WHOLESALE | CORPORATE | POS
  status         String   @default("PENDING")
  // PENDING | CONFIRMED | PROCESSING | COMPLETED | CANCELLED | REFUNDED
  paymentStatus  String   @default("UNPAID")
  // UNPAID | PARTIAL | PAID | REFUNDED
  subtotal       Decimal  @db.Decimal(15,2)
  discountAmount Decimal  @default(0) @db.Decimal(15,2)
  taxAmount      Decimal  @default(0) @db.Decimal(15,2)
  total          Decimal  @db.Decimal(15,2)
  profit         Decimal? @db.Decimal(15,2) // calculated after COGS
  notes          String?
  cancelledAt    DateTime?
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  @@unique([organizationId, orderNumber])
  @@index([organizationId, status])
  @@index([organizationId, customerId])
  @@index([organizationId, employeeId])
  @@index([organizationId, createdAt])
}

model SalesOrderItem {
  id               String  @id @default(cuid())
  orderId          String
  productId        String
  variantId        String?
  serializedUnitId String?
  description      String
  qty              Int
  unitPrice        Decimal @db.Decimal(15,2)
  costPrice        Decimal @db.Decimal(15,2)
  discountAmount   Decimal @default(0) @db.Decimal(15,2)
  taxAmount        Decimal @default(0) @db.Decimal(15,2)
  lineTotal        Decimal @db.Decimal(15,2)
  profit           Decimal @db.Decimal(15,2)
}

// Immutable ledger entry — no soft delete, no update after creation
model Payment {
  id             String   @id @default(cuid())
  organizationId String
  orderId        String?
  invoiceId      String?
  customerId     String?
  amount         Decimal  @db.Decimal(15,2)
  currency       String   @default("NGN")
  method         String   // CASH | BANK_TRANSFER | CARD | POS_TERMINAL | GATEWAY | CREDIT
  gateway        String?  // PAYSTACK | FLUTTERWAVE
  transactionId  String?  // gateway transaction reference
  status         String   @default("PENDING") // PENDING | COMPLETED | FAILED | REFUNDED | REVERSED
  channel        String?  // sales channel
  processedAt    DateTime?
  metadata       Json?    // gateway response payload
  reversedById   String?  // points to reversal Payment record
  createdAt      DateTime @default(now())

  @@index([organizationId, orderId])
  @@index([organizationId, status])
  @@index([transactionId])       // for idempotency checks
}
```

---

## 10. Finance Domain

```prisma
model BankAccount {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  accountNumber  String?
  bankName       String?
  currency       String  @default("NGN")
  currentBalance Decimal @default(0) @db.Decimal(15,2)
  providerType   String? // MONO | OKRA | MANUAL
  providerConfig Json?   // encrypted at application layer
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
}

// Immutable ledger — no soft delete
model BankTransaction {
  id              String  @id @default(cuid())
  organizationId  String
  bankAccountId   String
  amount          Decimal @db.Decimal(15,2)
  type            String  // CREDIT | DEBIT
  description     String?
  reference       String?
  category        String?
  reconciledType  String? // SALES_ORDER | EXPENSE | SUPPLIER_PAYMENT
  reconciledId    String?
  transactionDate DateTime
  createdAt       DateTime @default(now())

  @@index([organizationId, bankAccountId, transactionDate])
}

model Expense {
  id             String   @id @default(cuid())
  organizationId String
  categoryId     String
  locationId     String?
  amount         Decimal  @db.Decimal(15,2)
  currency       String   @default("NGN")
  description    String
  vendor         String?
  receiptUrl     String?
  expenseDate    DateTime
  status         String   @default("PENDING")
  // PENDING | APPROVED | REJECTED | PAID
  approvedById   String?
  approvedAt     DateTime?
  paidById       String?
  paidAt         DateTime?
  isRecurring    Boolean  @default(false)
  recurringConfig Json?   // {frequency: MONTHLY, dayOfMonth: 1}
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, status])
  @@index([organizationId, expenseDate])
}

model TaxRate {
  id             String  @id @default(cuid())
  organizationId String
  name           String  // e.g., "VAT 7.5%"
  rate           Decimal @db.Decimal(5,4) // e.g., 0.0750
  isInclusive    Boolean @default(false)
  appliesTo      String? // product category or null (all)
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
}
```

---

## 11. Staff Domain

```prisma
model Department {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  headId         String? // employee ID of department head
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, name])
}

model Employee {
  id               String   @id @default(cuid())
  organizationId   String
  userId           String   @unique // linked platform user account
  employeeCode     String
  departmentId     String?
  locationId       String?
  managerId        String?  // self-relation to Employee
  jobTitle         String?
  employmentType   String   @default("FULL_TIME") // FULL_TIME | PART_TIME | CONTRACT
  startDate        DateTime
  endDate          DateTime?
  salary           Decimal? @db.Decimal(15,2) // protected by permission
  emergencyContact Json?    // {name, phone, relationship}
  documentUrls     Json?    // array of document URLs
  status           String   @default("ACTIVE") // ACTIVE | INACTIVE | TERMINATED
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([organizationId, employeeCode])
  @@index([organizationId, departmentId])
  @@index([organizationId, locationId])
}

model Attendance {
  id             String   @id @default(cuid())
  organizationId String
  employeeId     String
  date           DateTime @db.Date
  checkIn        DateTime?
  checkOut       DateTime?
  status         String   @default("PRESENT")
  // PRESENT | ABSENT | LATE | HALF_DAY | LEAVE | PUBLIC_HOLIDAY
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([employeeId, date])
  @@index([organizationId, date])
}
```

---

## 12. Tasks and Goals

```prisma
model Task {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  description    String?
  assigneeId     String?  // userId
  creatorId      String
  departmentId   String?
  locationId     String?
  priority       String   @default("NORMAL") // LOW | NORMAL | HIGH | URGENT
  status         String   @default("PENDING")
  // PENDING | IN_PROGRESS | BLOCKED | COMPLETED | CANCELLED
  dueDate        DateTime?
  completedAt    DateTime?
  completionPct  Int      @default(0)
  isRecurring    Boolean  @default(false)
  recurringConfig Json?
  parentTaskId   String?  // sub-tasks
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  @@index([organizationId, assigneeId, status])
  @@index([organizationId, dueDate])
}

model Goal {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  description    String?
  type           String   // REVENUE | PROFIT | UNITS | CUSTOMERS | CUSTOM
  period         String   // DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL
  targetValue    Decimal  @db.Decimal(15,2)
  currentValue   Decimal  @default(0) @db.Decimal(15,2)
  unit           String   @default("NGN") // NGN | UNITS | PCT | COUNT
  startDate      DateTime
  endDate        DateTime
  ownerId        String?
  locationId     String?
  status         String   @default("ACTIVE")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, period, status])
}
```

---

## 13. AI Domain

```prisma
model AIProvider {
  id                String  @id @default(cuid())
  organizationId    String
  name              String
  type              String  // OPENAI | ANTHROPIC | GEMINI | MISTRAL | CUSTOM
  apiKeyEncrypted   String  // AES-256-GCM encrypted
  endpoint          String? // custom endpoint override
  model             String  // e.g., "gpt-4o", "claude-sonnet-4-6"
  embeddingModel    String? // e.g., "text-embedding-3-small"
  temperature       Float   @default(0.7)
  maxTokens         Int     @default(4096)
  isDefault         Boolean @default(false)
  isFallback        Boolean @default(false)
  isActive          Boolean @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([organizationId])
}

model AIConversation {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  type           String   @default("BUSINESS") // BUSINESS | PERSONAL
  title          String?
  archivedAt     DateTime?
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, userId])
}

model AIMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // USER | ASSISTANT | SYSTEM | TOOL
  content        String
  toolCalls      Json?    // array of tool call objects
  providerId     String?
  model          String?
  promptTokens   Int?
  completionTokens Int?
  createdAt      DateTime @default(now())

  @@index([conversationId, createdAt])
}

model AIMemory {
  id             String   @id @default(cuid())
  organizationId String
  userId         String?  // null = business memory; set = personal memory
  scope          String   // BUSINESS | PERSONAL
  category       String   // PREFERENCE | GOAL | POLICY | DECISION | NOTE | ROUTINE
  key            String
  value          String
  source         String?  // conversation ID or manual
  expiresAt      DateTime?
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, scope])
  @@index([organizationId, userId])
}

model AIDocument {
  id              String   @id @default(cuid())
  organizationId  String
  title           String
  filename        String
  mimeType        String
  storageUrl      String
  status          String   @default("PROCESSING") // PROCESSING | READY | ERROR
  permissionLevel String   @default("RESTRICTED") // PUBLIC | RESTRICTED | CONFIDENTIAL
  allowedRoles    Json?    // array of role IDs
  chunkCount      Int      @default(0)
  errorMessage    String?
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([organizationId, status])
}

model AIDocumentChunk {
  id          String                      @id @default(cuid())
  documentId  String
  chunkIndex  Int
  content     String
  embedding   Unsupported("vector(1536)")?
  createdAt   DateTime                    @default(now())

  @@index([documentId])
  // @@index([embedding], type: IVFFlat) -- defined in migration SQL
}

model AITool {
  id                  String  @id @default(cuid())
  organizationId      String
  name                String  // snake_case, e.g., "create_task"
  description         String
  inputSchema         Json    // JSON Schema
  requiredPermissions Json    // string array
  riskLevel           String  @default("LOW") // LOW | MEDIUM | HIGH | CRITICAL
  requiresApproval    Boolean @default(false)
  autonomyLevelRequired Int   @default(2)
  isActive            Boolean @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([organizationId, name])
}

model AIAction {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  toolId         String
  status         String   @default("PENDING")
  // PENDING | APPROVED | REJECTED | EXECUTING | COMPLETED | FAILED
  input          Json
  output         Json?
  errorMessage   String?
  requestedAt    DateTime @default(now())
  executedAt     DateTime?

  @@index([organizationId, status])
  @@index([organizationId, userId])
}

// Immutable — no soft delete
model AIUsageLog {
  id               String   @id @default(cuid())
  organizationId   String
  userId           String
  providerId       String?
  model            String?
  taskType         String?
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  estimatedCostUsd Decimal? @db.Decimal(10,6)
  latencyMs        Int?
  success          Boolean  @default(true)
  errorCode        String?
  createdAt        DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([organizationId, userId, createdAt])
}
```

---

## 14. Communications

```prisma
model CommunicationTemplate {
  id             String  @id @default(cuid())
  organizationId String
  name           String
  type           String  // EMAIL | TELEGRAM | SMS | PUSH
  subject        String?
  body           String
  variables      Json?   // [{key, description}]
  isSystem       Boolean @default(false) // system templates cannot be deleted
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, type])
}

model Notification {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  type           String   // LOW_STOCK | PAYMENT_RECEIVED | TASK_DUE | etc.
  title          String
  body           String
  channel        String   @default("IN_APP") // IN_APP | EMAIL | TELEGRAM | SMS
  status         String   @default("UNREAD") // UNREAD | READ | DISMISSED
  data           Json?    // arbitrary context data
  readAt         DateTime?
  createdAt      DateTime @default(now())

  @@index([organizationId, userId, status])
}

model TelegramConfig {
  id             String  @id @default(cuid())
  organizationId String  @unique
  botTokenEncrypted String
  chatId         String?
  groupId        String?
  channelId      String?
  isActive       Boolean @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model TelegramUserLink {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  telegramUserId String
  verifiedAt     DateTime @default(now())

  @@unique([organizationId, userId])
  @@unique([organizationId, telegramUserId])
}
```

---

## 15. System Tables

```prisma
// Append-only — no UPDATE or DELETE permitted
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String
  userId         String?
  action         String   // e.g., "product.price.changed"
  entityType     String   // e.g., "Product"
  entityId       String
  oldValue       Json?
  newValue       Json?
  ip             String?
  userAgent      String?
  createdAt      DateTime @default(now())

  @@index([organizationId, entityType, entityId])
  @@index([organizationId, userId, createdAt])
  @@index([organizationId, createdAt])
}

model APIKey {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  keyHash        String   @unique // SHA-256 hash
  keyPrefix      String   // first 8 chars for display
  scopes         Json     // string array of permitted scopes
  expiresAt      DateTime?
  lastUsedAt     DateTime?
  createdById    String
  revokedAt      DateTime?
  createdAt      DateTime @default(now())

  @@index([organizationId])
}

model FeatureFlag {
  id             String  @id @default(cuid())
  organizationId String
  key            String
  isEnabled      Boolean @default(false)
  description    String?
  updatedById    String?
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, key])
}

model SystemSetting {
  id             String  @id @default(cuid())
  organizationId String
  key            String
  value          Json
  description    String?
  updatedById    String?
  updatedAt      DateTime @updatedAt

  @@unique([organizationId, key])
}

model AutomationRule {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  trigger        Json     // {event, conditions}
  actions        Json     // array of action objects
  isActive       Boolean  @default(true)
  lastTriggeredAt DateTime?
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, isActive])
}
```

---

## 16. Indexing Strategy

Priority indexes (beyond PKs and FKs):

```sql
-- Full-text search
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_customers_search ON customers USING GIN(search_vector);
CREATE INDEX idx_suppliers_search ON suppliers USING GIN(search_vector);

-- pgvector similarity search (RAG)
CREATE INDEX idx_chunk_embedding ON ai_document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Common dashboard queries
CREATE INDEX idx_sales_orders_org_date ON sales_orders(organization_id, created_at DESC);
CREATE INDEX idx_inventory_mvmt_org_date ON inventory_movements(organization_id, created_at DESC);
CREATE INDEX idx_audit_org_date ON audit_logs(organization_id, created_at DESC);
```

---

## 17. Database Rules

1. **Never DELETE financial records** — payments, invoices, inventory movements, audit logs
2. **Use reversal entries** — a refund is a new payment record, not an update to the original
3. **Inventory is always updated through `InventoryMovement`** — never update `InventoryLevel.qty` directly; let a trigger or service recalculate from movements
4. **IMEI uniqueness** is enforced at the database level (unique constraint scoped to `organizationId`)
5. **Sequential numbering** (invoice numbers, receipt numbers, PO numbers) uses PostgreSQL sequences per organization, not `MAX(id) + 1`
6. **Decimal precision** — all money values use `DECIMAL(15,2)`. Do not use float for money.
7. **Transactions** — every multi-step operation (complete sale, receive goods, transfer stock) runs inside a single database transaction

---

## 18. Financial Integrity Rules

A completed sale triggers one atomic database transaction:

```
BEGIN;
  1. SELECT inventory FOR UPDATE (lock rows)
  2. Verify qty available >= qty ordered
  3. INSERT SalesOrder (status: PROCESSING)
  4. INSERT SalesOrderItems
  5. UPDATE InventoryLevel (deduct qty)
  6. INSERT InventoryMovements (SALE type, negative qty)
  7. UPDATE SerializedUnit status → SOLD (if serialized)
  8. INSERT Invoice
  9. INSERT Receipt
  10. INSERT Payment
  11. UPDATE Customer (totalSpend, lastPurchaseAt)
  12. INSERT AuditLog
  13. UPDATE SalesOrder (status: COMPLETED)
COMMIT;
```

If any step fails, the entire transaction rolls back. The business database is never left in a partial state.

---

## 19. Costing Methods

The `Organization.inventoryMethod` field is set once at setup:

| Method | Description | COGS calculation |
|--------|-------------|-----------------|
| `WAC` (default) | Weighted Average Cost | New avg cost = (existing stock × old avg + new qty × purchase price) ÷ (existing + new qty) |
| `FIFO` | First In, First Out | COGS uses cost of the oldest received batch first |

**This field is locked after the first inventory transaction.** Changing costing methods mid-operation invalidates historical COGS and gross profit figures.

---

## 20. Migrations

```bash
# Create a new migration
cd packages/database
pnpm prisma migrate dev --name <description>

# Apply migrations to production
pnpm prisma migrate deploy

# Generate Prisma client after schema changes
pnpm prisma generate

# Seed initial data (roles, permissions, feature flags, settings)
pnpm prisma db seed
```

Never modify migration files after they have been applied to any environment.
