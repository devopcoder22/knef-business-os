# KNEF Business OS — System Architecture

> **Status:** Approved  
> **Version:** 1.0  
> **Last updated:** 2026-09-29  
> **Primary currency:** NGN

---

## Table of Contents

1. [Overview](#1-overview)
2. [Guiding Principles](#2-guiding-principles)
3. [Technology Stack](#3-technology-stack)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Architectural Pattern](#5-architectural-pattern)
6. [Monorepo Structure](#6-monorepo-structure)
7. [Application Modules](#7-application-modules)
8. [Internal Event Bus](#8-internal-event-bus)
9. [Background Workers](#9-background-workers)
10. [E-commerce Strategy](#10-e-commerce-strategy)
11. [Multi-Tenancy Design](#11-multi-tenancy-design)
12. [Multi-Location Support](#12-multi-location-support)
13. [Feature Flags](#13-feature-flags)
14. [Approval Workflows](#14-approval-workflows)
15. [Document Generation](#15-document-generation)
16. [Search](#16-search)
17. [Barcode Support](#17-barcode-support)
18. [Future Expansion](#18-future-expansion)

---

## 1. Overview

KNEF Business OS is a production-grade, self-hosted business operating system for **KNEF Gadgets / KNEF Technology & IT Solutions**, Lagos, Nigeria. It covers:

- Consumer electronics ERP (products, inventory, purchasing, sales, POS)
- Financial management (accounting, expenses, bank integration)
- Staff and HR operations (staff, attendance, tasks, goals, performance)
- Customer relationship management (CRM, segmentation, marketing)
- AI assistant and AI agent ecosystem (KNEF AI)
- Communications (email, Telegram, notifications)
- E-commerce and marketplace integration
- System administration and audit

The platform is designed from the start as a **modular, extensible, secure, and self-hostable** system that can evolve into a multi-tenant commercial ERP.

---

## 2. Guiding Principles

| Principle | Implementation |
|-----------|---------------|
| Modular and extensible | NestJS module system; clean bounded contexts |
| Self-hostable | Docker Compose on Ubuntu Server; no proprietary cloud lock-in |
| API-first | Every feature exposed through versioned REST API |
| Security and least privilege | RBAC on every endpoint; backend-enforced permissions |
| Transactional integrity | PostgreSQL transactions for all multi-step business operations |
| Human-controlled AI | Approval queue for AI actions; configurable autonomy levels |
| Provider-agnostic AI | AIProvider abstraction; swappable without business logic changes |
| Configurable business rules | Thresholds, rates, and rules in settings — never hard-coded |
| Auditable | Immutable audit log for every important action |
| No hard-coded secrets | All credentials from environment variables only |

---

## 3. Technology Stack

### Core

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 14+ |
| UI library | React | 18+ |
| Language | TypeScript | 5+ |
| Styling | Tailwind CSS | 3+ |
| Component system | shadcn/ui | latest |
| Client state | Zustand | 4+ |
| Server state / caching | TanStack Query | 5+ |
| Backend framework | NestJS | 10+ |
| Runtime | Node.js | 20 LTS |
| Database | PostgreSQL | 16 |
| Vector extension | pgvector | 0.7+ |
| ORM | Prisma | 5+ |
| Cache / sessions | Redis | 7+ |
| Background jobs | BullMQ | 5+ |
| Monorepo tooling | pnpm workspaces + Turborepo | latest |
| Reverse proxy | Caddy | 2+ |
| Containers | Docker + Docker Compose | latest |

### Supporting Libraries

| Purpose | Library |
|---------|---------|
| Authentication | Passport.js (local + JWT strategies) |
| Password hashing | bcrypt (cost factor 12) |
| Validation | class-validator + class-transformer (DTOs) |
| Environment validation | Zod |
| Security headers | Helmet.js |
| Rate limiting | NestJS Throttler |
| PDF generation | Puppeteer |
| Barcode scanning | zxing-js (camera) |
| Barcode generation | bwip-js |
| Email | Nodemailer (SMTP abstraction) |
| Telegram bot | Telegraf.js |
| API documentation | NestJS Swagger (OpenAPI 3.0) |
| Testing | Jest + Supertest + Testing Library |

### Deliberate Exclusions

- **GraphQL**: REST is sufficient; BFF-style aggregation endpoints handle complex dashboard queries.
- **Separate vector database** (Pinecone, Weaviate): pgvector handles the expected document volume. Migrate if scale demands it.
- **Microservices**: A modular monolith with clean boundaries is the correct choice for a self-hosted single-business deployment. Extract services only when a specific boundary proves it needs independent scaling.

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CADDY (HTTPS / TLS)                       │
│              reverse proxy — automatic certificates          │
└───────────────────┬──────────────────┬──────────────────────┘
                    │                  │
          ┌─────────▼───────┐ ┌────────▼────────┐
          │   apps/web      │ │   apps/api       │
          │   Next.js 14    │ │   NestJS         │
          │   :3000         │ │   :4000          │
          └─────────────────┘ └────────┬─────────┘
                                        │
              ┌─────────────────────────┼──────────────────────┐
              │                         │                       │
     ┌────────▼──────┐       ┌──────────▼────────┐   ┌────────▼──────┐
     │  PostgreSQL   │       │      Redis         │   │  apps/worker  │
     │  16+pgvector  │       │  cache/sessions/   │   │  BullMQ       │
     │  :5432        │       │  queues/:6379      │   │  :4001        │
     └───────────────┘       └────────────────────┘   └───────────────┘
                                                               │
                                                      ┌────────▼──────┐
                                                      │ apps/telegram  │
                                                      │ Telegraf bot   │
                                                      └───────────────┘

Docker networks:
  public   → caddy + web + api
  internal → api + worker + telegram + db + redis
```

---

## 5. Architectural Pattern

### Modular Monolith

The NestJS API is a single deployable process composed of clearly bounded modules. Modules communicate through **service injection** — they never reach into another module's repository or database layer directly.

```
ProductsModule
  exports: ProductsService

InventoryModule
  imports: ProductsModule        ← uses ProductsService, not ProductsRepository
  exports: InventoryService
```

This gives:
- Clean domain boundaries now
- ACID transactions across module operations (single database)
- Single deployment and monitoring surface
- Easy path to extraction: if a module needs independent scaling, its service boundary is already clean

### Module Structure (per NestJS module)

```
modules/
  products/
    products.module.ts
    products.controller.ts      ← REST endpoints, guards, swagger decorators
    products.service.ts         ← business logic
    products.repository.ts      ← Prisma database access
    dto/
      create-product.dto.ts
      update-product.dto.ts
      product-response.dto.ts
    products.service.spec.ts    ← unit tests
    products.controller.spec.ts ← integration tests
```

---

## 6. Monorepo Structure

```
knef-business-os/
│
├── apps/
│   ├── web/                         # Next.js 14 — internal ERP frontend
│   ├── api/                         # NestJS — business logic + REST API
│   ├── worker/                      # BullMQ background job processor
│   ├── telegram-bot/                # Telegraf.js Telegram bot
│   └── storefront/                  # [RESERVED — Phase 12] Public e-commerce site
│
├── packages/
│   ├── database/                    # Prisma schema (single source of truth)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/index.ts             # Exports PrismaClient
│   ├── types/                       # Shared TypeScript types/interfaces
│   ├── utils/                       # Shared pure utility functions
│   ├── config/                      # Shared env validation (Zod schemas)
│   └── constants/                   # Permission keys, event names, enums
│
├── infrastructure/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   ├── web.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── telegram.Dockerfile
│   └── caddy/
│       └── Caddyfile
│
├── scripts/
│   ├── backup.sh                    # Database backup
│   ├── restore.sh                   # Database restore
│   ├── deploy.sh                    # Production deploy helper
│   └── setup-dev.sh                 # First-time local dev setup
│
├── docs/                            # This folder
│   ├── architecture.md              # ← This file
│   ├── database.md
│   ├── api.md
│   ├── deployment.md
│   ├── security.md
│   ├── ai.md
│   ├── integrations.md
│   └── modules.md
│
├── docker-compose.yml               # Production
├── docker-compose.dev.yml           # Development (hot reload, no SSL)
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 7. Application Modules

### apps/api — NestJS module tree

```
AppModule
├── ConfigModule (global, Zod-validated)
├── DatabaseModule (global PrismaService)
├── RedisModule (global Redis client)
│
├── HealthModule              GET /health, /readiness, /liveness
│
├── AuthModule                POST /auth/login|register|refresh|logout|2fa/*
├── UsersModule               GET/PATCH /users/me, admin CRUD
├── OrganizationsModule       org settings
├── LocationsModule           location management
├── DepartmentsModule         department management
├── RolesModule               role CRUD, permission assignment
├── PermissionsModule         permission registry, user overrides
├── FeatureFlagsModule        feature flag admin
├── AuditModule               audit log (read-only for most users)
├── SettingsModule            centralized business settings
│
├── ProductsModule            product + variant CRUD
├── CategoriesModule          category tree
├── BrandsModule              brand management
├── SerializedUnitsModule     IMEI/serial tracking
│
├── InventoryModule           stock levels, movements, alerts
├── StockTransfersModule      inter-location transfers
├── StockAdjustmentsModule    adjustments + counts
│
├── SuppliersModule           supplier + contact management
├── PurchasingModule          PO → GR → invoice → payment flow
│
├── CustomersModule           CRM + segmentation
├── SalesModule               sales orders
├── PosModule                 POS sessions
├── InvoicesModule            invoice generation + PDF
├── ReceiptsModule            receipt generation
├── PaymentsModule            payment recording + gateway webhooks
│
├── ExpensesModule            expense tracking + approval
├── FinanceModule             P&L, cash flow, financial reports
├── BankAccountsModule        bank account + transaction management
│
├── StaffModule               employee profiles
├── AttendanceModule          check-in/check-out
├── TasksModule               task management
├── GoalsModule               goals + KPI tracking
├── AnalyticsModule           aggregated metrics
├── ReportsModule             report generation (PDF/CSV/XLSX)
├── ForecastingModule         demand + revenue forecasting
│
├── NotificationsModule       in-app notifications
├── WebhooksModule            outbound webhook delivery
├── AutomationModule          event-driven rule engine
│
├── AiModule
│   ├── ProvidersModule       OpenAI/Anthropic/Gemini implementations
│   ├── RouterModule          AI model routing by task type
│   ├── ConversationsModule   conversation history
│   ├── MemoryModule          business + personal AI memory
│   ├── KnowledgeModule       document upload + RAG pipeline
│   ├── ToolsModule           AI tool registry
│   ├── ApprovalsModule       human-in-the-loop approval queue
│   ├── AgentsModule          scheduled AI agents
│   └── UsageModule           token tracking + budget enforcement
│
├── EmailModule
│   ├── ProvidersModule       SMTP/SendGrid/SES/Mailgun
│   ├── CampaignsModule       email campaigns
│   ├── TemplatesModule       reusable templates
│   └── AnalyticsModule       campaign stats
│
├── TelegramModule            bot config + notifications
├── CalendarModule            Google/Outlook integration
├── IntegrationsModule        payments/banking/marketplace adapters
├── DocumentsModule           PDF generation, template engine
├── SearchModule              global full-text search
└── AdminModule               super admin control center
```

### apps/web — Next.js route groups

```
app/
├── (auth)/
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   └── reset-password/
│
└── (dashboard)/              ← authenticated shell (sidebar + header)
    ├── dashboard/
    ├── pos/
    ├── products/
    ├── inventory/
    ├── purchasing/
    ├── sales/
    ├── customers/
    ├── suppliers/
    ├── finance/
    ├── expenses/
    ├── staff/
    ├── tasks/
    ├── goals/
    ├── reports/
    ├── analytics/
    ├── ai/
    ├── email/
    ├── communications/
    ├── integrations/
    ├── settings/
    └── admin/
```

---

## 8. Internal Event Bus

NestJS EventEmitter2 is used for in-process domain events. This decouples modules without introducing a message broker.

### Key events

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `order.completed` | SalesModule | InventoryModule, FinanceModule, NotificationsModule, AutomationModule |
| `order.cancelled` | SalesModule | InventoryModule, NotificationsModule |
| `payment.received` | PaymentsModule | SalesModule, NotificationsModule, AuditModule |
| `inventory.low` | InventoryModule | NotificationsModule, AiModule, AutomationModule |
| `inventory.updated` | InventoryModule | AnalyticsModule |
| `purchase.approved` | PurchasingModule | NotificationsModule |
| `goods.received` | PurchasingModule | InventoryModule |
| `task.completed` | TasksModule | AnalyticsModule, NotificationsModule |
| `goal.reached` | GoalsModule | NotificationsModule, AiModule |
| `ai.action.requested` | AiModule | ApprovalsModule |
| `ai.action.approved` | ApprovalsModule | AiModule (execute) |

For slow or retry-able work (sending emails, generating PDFs, syncing marketplaces), the AutomationModule places work onto BullMQ queues rather than executing inline.

---

## 9. Background Workers

`apps/worker` runs BullMQ processors against the same Redis instance.

| Queue | Processor | Triggered by |
|-------|----------|-------------|
| `email` | email.processor | Transactional emails, campaign sends |
| `notifications` | notification.processor | Push/in-app notification delivery |
| `ai-agent` | ai-agent.processor | Scheduled AI agent runs (cron) |
| `reports` | report.processor | Heavy report generation (PDF/XLSX) |
| `marketplace-sync` | marketplace-sync.processor | Jumia/Konga inventory + order sync |
| `documents` | document.processor | RAG: chunk + embed knowledge base docs |
| `backup` | backup.processor | Scheduled database backup coordination |

---

## 10. E-commerce Strategy

**Decision: Option C — API-first with storefront slot reserved.**

In Phase 7, the API exposes a public product/inventory/order surface:

```
GET  /api/v1/ecommerce/products          → product catalog (public prices, stock)
GET  /api/v1/ecommerce/products/:slug    → single product detail
POST /api/v1/ecommerce/orders            → create order from website
GET  /api/v1/ecommerce/orders/:id        → order status
POST /api/v1/webhooks/paystack           → payment confirmation webhook
POST /api/v1/webhooks/flutterwave        → payment confirmation webhook
```

The KNEF platform is the **single source of truth** for products, prices, and inventory. Any storefront (custom Next.js, Shopify headless, WooCommerce) consumes this API.

`apps/storefront` is reserved in the monorepo but not implemented until Phase 12.

---

## 11. Multi-Tenancy Design

**Approach: Single PostgreSQL schema, `organizationId` on every business table.**

Every business entity row carries an `organizationId`. Every database query is scoped to the requesting user's organization. NestJS guards automatically inject `req.user.organizationId` into all repository calls.

This approach:
- Is simple to implement and reason about
- Supports full ACID transactions across module operations
- Is adequate for the foreseeable scale
- Can be complemented with PostgreSQL Row-Level Security (RLS) later for additional isolation

**Hierarchy:**

```
Organization
  └── Location (HQ, Oregun, Ikeja, Lekki, Abuja, Warehouse)
       └── Department (Sales, Inventory, Finance, Marketing, HR, IT)
            └── Employee → User
```

KNEF starts as one organization. Additional organizations can be added without schema changes.

---

## 12. Multi-Location Support

Every inventory record, sales order, employee record, and POS session carries a `locationId`.

Permission scoping by location:

```
UserRole {
  userId: "usr_abc"
  roleId: "role_salesperson"
  locationId: "loc_oregun"        ← scoped to Oregun only
}
```

A user with `locationId: null` on their role has access across all locations (management roles).

Cross-location stock transfers go through the `StockTransfer` workflow with approval.

---

## 13. Feature Flags

Feature flags control whether a feature is enabled for the organization. They are separate from permissions.

```
FeatureFlag { key: "FEATURE_AI_ASSISTANT", isEnabled: true }
FeatureFlag { key: "FEATURE_BANK_INTEGRATION", isEnabled: false }
FeatureFlag { key: "FEATURE_MARKETPLACE_SYNC", isEnabled: true }
FeatureFlag { key: "FEATURE_MULTI_LOCATION", isEnabled: false }
FeatureFlag { key: "FEATURE_EMAIL_MARKETING", isEnabled: true }
FeatureFlag { key: "FEATURE_TELEGRAM", isEnabled: false }
FeatureFlag { key: "FEATURE_CALENDAR", isEnabled: false }
```

A feature is available only when **both** the flag is enabled **and** the user has the required permission.

Guards order: `FeatureFlagGuard` → `AuthGuard` → `PermissionGuard`.

---

## 14. Approval Workflows

Configurable approval thresholds stored in `SystemSetting`:

| Setting key | Default | Triggers |
|------------|---------|---------|
| `approval.purchase.manager_threshold` | ₦5,000,000 | Manager approval required |
| `approval.purchase.director_threshold` | ₦20,000,000 | MD approval required |
| `approval.discount.threshold_pct` | 10 | Manager approval for discount > 10% |
| `approval.refund.threshold` | ₦500,000 | Manager approval |
| `approval.expense.threshold` | ₦1,000,000 | Management approval |
| `approval.ai_action.high_risk` | always | Any HIGH/CRITICAL AI tool |

Approval flow:

```
Action requested
  → create ApprovalRequest { entityType, entityId, requestedBy, approversRequired }
  → notify approver (in-app + Telegram)
  → approver: APPROVE | REJECT | REQUEST_CHANGES
  → if approved: execute + audit log
  → if rejected: notify requester + audit log
```

---

## 15. Document Generation

PDF generation uses Puppeteer (headless Chrome) rendering HTML templates:

```
DocumentTemplate (HTML + Handlebars) → inject data → Puppeteer → PDF buffer → response / email
```

Templates are stored per document type:
- Invoice (A4)
- Receipt (A4 + Thermal 58mm / 80mm layout)
- Purchase Order
- Quotation
- Delivery Note
- Goods Received Note
- Statement of Account
- Reports

Templates are customizable by the administrator from the settings UI.

---

## 16. Search

Global search via PostgreSQL full-text search (`tsvector`/`tsquery`):

Searchable entities: Products, Customers, Orders, Invoices, Suppliers, Staff, Tasks, IMEI/Serials, Transactions.

Each searchable table has a `searchVector tsvector` column updated by a PostgreSQL trigger on insert/update.

Search endpoint: `GET /api/v1/search?q=iPhone&types=products,customers`

If search performance becomes a bottleneck, **Meilisearch** can be added as a search layer without changing the business logic (search service is abstracted).

---

## 17. Barcode Support

| Operation | Method |
|----------|--------|
| Camera scanning | zxing-js in browser (no plugin required) |
| USB scanner | keyboard-wedge input (treated as fast keyboard input) |
| Barcode generation | bwip-js (EAN-13, UPC-A, Code-128, QR) |
| Barcode printing | browser `window.print()` with barcode SVG |
| Label printing | A4 sheet of labels (browser print) |

Supported formats: EAN-13, EAN-8, UPC-A, Code-128, QR Code, internal SKU barcodes.

---

## 18. Future Expansion

The architecture supports adding these without restructuring:

| Module | When |
|--------|------|
| `apps/storefront` | Phase 12 — public e-commerce site |
| Payroll | Add as a NestJS module under `modules/payroll/` |
| Full accounting | Extend `FinanceModule` with double-entry ledger |
| Loyalty program | Add `modules/loyalty/` |
| B2B / Wholesale portal | Add `apps/b2b/` Next.js app |
| Supplier portal | Add `apps/supplier-portal/` |
| Mobile app | Consume existing REST API |
| WhatsApp commerce | Add adapter to `IntegrationsModule` |
| AI Agent Marketplace | Extend `AgentsModule` with agent templates |
| Multi-company | Already in data model (`Organization` table) |
| Franchise management | Add `modules/franchise/` |
