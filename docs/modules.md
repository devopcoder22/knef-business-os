# KNEF Business OS — Module Reference

> **Last updated:** 2026-09-29

---

## Phase 0 — Foundation (Current)

| Module | Description | Key files |
|--------|-------------|----------|
| Auth | Login, register, JWT, refresh, 2FA, lockout | `modules/auth/` |
| Users | User CRUD, profile, password change | `modules/users/` |
| Organizations | Org settings, fiscal year, inventory method | `modules/organizations/` |
| Locations | Location CRUD, activation | `modules/locations/` |
| Departments | Department management | `modules/departments/` |
| Roles | Role CRUD, clone, permission assignment | `modules/roles/` |
| Permissions | Permission registry, user overrides | `modules/permissions/` |
| Feature Flags | Enable/disable features per org | `modules/feature-flags/` |
| Audit | Immutable audit log read/write | `modules/audit/` |
| Settings | Centralized business settings | `modules/settings/` |
| Health | /health /readiness /liveness | `modules/health/` |

---

## Phase 1 — Products & Inventory

| Module | Description |
|--------|-------------|
| Products | Product CRUD, variants, images, search vector |
| Categories | Category tree (nested sets or adjacency list) |
| Brands | Brand management |
| SerializedUnits | IMEI/serial tracking, status lifecycle |
| Inventory | Stock levels, movements ledger, alerts |
| StockTransfers | Inter-location transfer workflow |
| StockAdjustments | Adjustments and physical stock counts |

---

## Phase 2 — Purchasing

| Module | Description |
|--------|-------------|
| Suppliers | Supplier + contact management, ratings |
| Purchasing | PO → approval → GR → invoice → payment |

---

## Phase 3 — Sales & POS

| Module | Description |
|--------|-------------|
| Customers | CRM, customer profile, segmentation |
| Sales | Sales order lifecycle |
| POS | POS session, quick sale, cash float |
| Invoices | Invoice generation, PDF, numbering |
| Receipts | Receipt generation, thermal + A4 layout |
| Payments | Payment recording, multi-method, split payment |
| Documents | PDF template engine (Puppeteer) |

---

## Phase 4 — Finance

| Module | Description |
|--------|-------------|
| Expenses | Expense tracking, categories, approval |
| Finance | P&L, cash flow, balance aggregation |
| BankAccounts | Account management, transaction import |
| Integrations/Payments | Paystack + Flutterwave webhook handling |

---

## Phase 5 — Staff & HR

| Module | Description |
|--------|-------------|
| Staff | Employee profiles, employment lifecycle |
| Attendance | Daily attendance, check-in/out |
| Tasks | Task management, recurring, comments |
| Goals | Goal + KPI tracking |
| Analytics | Aggregated metrics, performance dashboards |

---

## Phase 6 — Reports & Analytics

| Module | Description |
|--------|-------------|
| Reports | All report types, CSV/XLSX/PDF export |
| Analytics | Sales velocity, inventory intelligence, customer intelligence |
| Forecasting | Demand and revenue forecasting |

---

## Phase 7 — E-commerce & Marketplaces

| Module | Description |
|--------|-------------|
| Integrations/Marketplaces | Jumia + Konga adapters, sync worker |
| E-commerce API | Public product/inventory/order endpoints |
| Integrations/Banking | Mono/Okra open banking (optional) |

---

## Phase 8 — Communications

| Module | Description |
|--------|-------------|
| Email | Provider abstraction, transactional emails |
| Email/Campaigns | Email marketing, lists, segments, scheduling |
| Email/Analytics | Open/click/bounce tracking |
| Telegram | Bot configuration, notification dispatch |
| Communications | Unified communication center, templates |
| Notifications | In-app notification system |
| Webhooks | Outbound webhook delivery |
| Automation | Event-driven rule engine |

---

## Phase 9 — AI Core

| Module | Description |
|--------|-------------|
| AI/Providers | OpenAI, Anthropic, Gemini, Mistral implementations |
| AI/Router | Task-type-based model routing |
| AI/Conversations | Conversation history, BUSINESS/PERSONAL scope |
| AI/Memory | Business and personal memory store |
| AI/Knowledge | Document upload, RAG pipeline, embedding |
| AI/Tools | Tool registry, permission + risk checks |
| AI/Usage | Token tracking, cost estimation, budget enforcement |

---

## Phase 10 — AI Actions & Automation

| Module | Description |
|--------|-------------|
| AI/Approvals | Human-in-the-loop approval queue |
| AI/Agents | Scheduled AI agents (cron-based) |
| Calendar | Google Calendar + Outlook integration |
| AI/Planner | Business & personal planner — full lifecycle (DRAFT→REVIEW→APPROVED→ACTIVE), AI-generated plans, calendar-aware daily/weekly planning, task materialisation, KPI linking, approval workflow |

---

## Phase 11 — Hardening

Security audit, performance profiling, load testing, backup/restore verification, production deployment runbook.

---

## Shared / Horizontal Modules

These modules have no upstream business dependencies and are used by all other modules:

| Module | Description |
|--------|-------------|
| Audit | Write-only for all modules; read-only for admin |
| Notifications | Consumed by all modules to send alerts |
| Webhooks | Triggered by automation engine |
| Search | Global search index, consumed by web frontend |
| Documents | PDF generation used by invoices, reports, receipts |


---

## V1.1 — External AI Agent Gateway + MCP

| Module | Description |
|--------|-------------|
| External Agents | Admin management of external agent identities, scopes, and API keys |
| Agent Gateway | REST endpoint (`/api/v1/agent/*`) for external AI agents to discover and execute KNEF tools |
| KNEF Tool Layer | Centralized tool execution service with argument validation, org isolation, response filtering, and idempotency |
| MCP Server | Separate app (`apps/mcp-server`) — MCP-compatible adapter that connects AI clients to the KNEF Tool Layer |

---

## V1.1 — Main Admin Control Center

| Module | Description |
|--------|-------------|
| Admin (backend) | `GET /admin/overview` stats, `GET /admin/security-events`, `GET /admin/api-keys`, `DELETE /admin/api-keys/:id` |
| Admin UI | `/admin` layout with 14-page sub-nav: Overview, Users, Roles, Departments, Locations, Feature Flags, External Agents, API Keys, Approvals, Audit Logs, Security, System Health, Integrations, AI Config |
