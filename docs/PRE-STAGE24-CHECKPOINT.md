# KNEF Business OS — Pre-Stage 24 Protected Checkpoint

**Checkpoint Date:** 2026-10-19  
**Branch:** `v1.1-development`  
**HEAD at checkpoint:** `3918256` (full: `39182563004051c72b473c94ae2c6f77b95d565c`)  
**Tag:** `pre-stage24-checkpoint-20261019`  
**Remote HEAD:** `39182563004051c72b473c94ae2c6f77b95d565c` (in sync)  
**Previous Baseline (Stage 23 final):** `b91f563d75a3653ed0ae69e2479940590cc7e255`  
**Commits since baseline:** 77  
**Files changed since baseline:** 213  
**Net lines added:** +9,990  

---

## Database Backup Reference

- **Environment:** VPS production (157.245.43.74)
- **Database name:** `knef_prod`
- **DB user:** `knef`
- **Backup mechanism:** KNEF BackupModule (`pg_dump` via Docker exec, stored in `knef-business-os_backups` Docker volume)
- **Backup dir (container):** `/app/backups`
- **Backup encrypted:** Yes — `BACKUP_ENCRYPTION_PASSPHRASE` in `.env`
- **Note:** No manual backup was triggered for this checkpoint — the production backup volume exists at Docker volume `knef-business-os_backups`. Trigger a manual backup via Admin → Health → Backup Now before starting Stage 24 destructive work.

---

## Git Bundle Reference

- **Bundle path:** `../knef-pre-stage24-checkpoint.bundle` (one level above repo root)
- **Created:** 2026-10-19
- **Verified:** Yes (see Phase 4 section)

---

## Latest Migration

`20261019000001_user_fk_optional_cascade` — applied 2026-10-19 16:46:27 UTC  

All 20 migrations applied on production.

---

## Migration History (Complete)

| # | Migration | Applied |
|---|-----------|---------|
| 01 | `0001_init` | 2026-10-07 |
| 02 | `0002_add_gtin` | 2026-10-07 |
| 03 | `0003_calendar_events` | 2026-10-07 |
| 04 | `0004_email_compliance` | 2026-10-07 |
| 05 | `0005_telegram_bot` | 2026-10-07 |
| 06 | `0006_ai_autonomy` | 2026-10-07 |
| 07 | `0007_planner` | 2026-10-07 |
| 08 | `0008_external_agents` | 2026-10-07 |
| 09 | `0009_admin_access_control` | 2026-10-07 |
| 10 | `0010_automation_engine` | 2026-10-07 |
| 11 | `0011_global_search_indexes` | 2026-10-07 |
| 12 | `0012_stage18_crm` | 2026-10-07 |
| 13 | `0013_payment_gateway_ref_unique` | 2026-10-07 |
| 14 | `0014_performance_indexes` | 2026-10-07 |
| 15 | `0015_storefront` | 2026-10-18 |
| 16 | `0016_clearing_cost` | 2026-10-18 |
| 17 | `0017_org_favicon` | 2026-10-18 |
| 18 | `0018_add_must_change_password` | 2026-10-19 |
| 19 | `20261019000000_add_system_backup` | 2026-10-19 |
| 20 | `20261019000001_user_fk_optional_cascade` | 2026-10-19 |

**Migration integrity:** CLEAN — no historical migrations (0001–0015) were modified after Stage 23 baseline.

---

## Post-Stage-23 Commits (77 total, oldest → newest)

| Short Hash | Message |
|------------|---------|
| `5e654c3` | fix(roles): allow Super Admin to edit system role permissions |
| `4ac3c9b` | Revert "fix(roles): allow Super Admin to edit system role permissions" |
| `5be6233` | fix(roles): allow Super Admin to edit system role permissions |
| `8caeeda` | fix(ecommerce): unwrap data envelope on API key creation response |
| `716433a` | feat(web): add Settings → Organization page with Org/Location ID copy buttons |
| `f5dda3d` | fix(web): unwrap API envelope in 12 pages + fix /departments sidebar link |
| `98b88b5` | fix(web): unwrap API envelope in AI sub-pages |
| `4032589` | feat(web+storefront): branding, UX fixes, invoice/receipt improvements |
| `f02cb6b` | feat(web+api+storefront): Stage 23 follow-up — storefront BFF, admin pages, API hardening |
| `93c31c8` | fix(web): correct org logo description |
| `f39bdad` | feat(web+api): dynamic org logo on admin login page |
| `8ceeddd` | feat(purchasing+sales): add clearingCost to POs, invoice creation UI, PDF/print actions |
| `7fdadc1` | feat(pdf): redesign invoice PDF with puppeteer-core + system Chromium |
| `0e4186d` | fix(web): fix logo display, receipts crash, and branding envelope |
| `f642321` | fix(web): fix ai/tools crash, create admin/ai page, fix email provider error display |
| `42648c8` | fix(telegram): fix test message failure with descriptive errors |
| `9312c67` | fix(communications): handle duplicate email provider name + telegram test detail |
| `cd0bbd9` | fix(web): read error.message from API error envelope correctly |
| `37a966d` | fix(web): move Inter font to CSS import to unblock Docker builds |
| `706b5e5` | feat(email-providers): add Edit button and fix Test result display |
| `83204d8` | fix(web): use relative /api/v1 URL so production Docker build works without .env |
| `c0ebd1b` | feat(caddy): expose storefront on :8080 for IP-based access |
| `09de06d` | feat(branding): add favicon to both apps with admin-panel upload control |
| `a2d46bd` | fix(favicon): inject link tags directly in layouts, fix settings JSX |
| `da5300a` | chore(caddy): set domain to knefgadgets.com / store.knefgadgets.com |
| `f0a9e66` | chore(caddy): storefront on knefgadgets.com, admin on knefos.knefgadgets.com |
| `8a3d5ff` | fix(products): correct raw query table/column quoting in updateSearchVector |
| `5788887` | feat(uploads): add UploadsModule for image uploads + Caddy /uploads/* routing |
| `29d2386` | feat(email): add Brevo HTTP API provider type |
| `dbe47f3` | fix(email): test endpoint respects email from request body |
| `c23030b` | feat(users): password reset, delete user, fix worker Brevo email |
| `96861a2` | fix(multi): agents crash, PO clearingCost, email change flow, Brevo UI, staff null guard |
| `d311aec` | feat: add Cloudflare Turnstile bot protection + receipt/receipts fix |
| `f3f3b87` | feat: customer edit, WYSIWYG descriptions, follow-up page, stock adjustment detail |
| `3b9c723` | fix: resolve POS sale, order creation, invoice, and receipt issues |
| `821515e` | fix: resolve 6 reported bugs across admin, inventory, and search |
| `98b4cca` | feat(storefront): add post-order account creation, OTP verification, and order notifications |
| `f405a5c` | fix(storefront): strip organizationId from OTP BFF routes |
| `c8d5881` | fix(sms): add logging, propagate errors, relax Brevo provider lookup |
| `7431181` | feat(checkout+sms): Termii SMS, inline OTP, delivery address with Maps |
| `ea20399` | fix(sms): switch Termii channel to generic, sender to N-Alert |
| `371c866` | fix(auth+checkout+storefront): sign-out on refresh, phone OTP, footer settings |
| `86e5b77` | fix(auth): use persist.hasHydrated()/onFinishHydration() for refresh guard |
| `bb3df1c` | feat(payments): Paystack test-mode card payments on storefront |
| `e709fba` | fix(checkout+admin): Nigeria state dropdown, country field, fix preview URL |
| `9956a83` | feat(checkout): full world country dropdown, Nigeria state selector |
| `914d1ec` | feat(admin): add Data Reset page to wipe selected data categories |
| `bd2a26e` | fix+feat: WYSIWYG upgrade, SMS providers, bug fixes, audit IP logging |
| `cb0e991` | feat(integrations): add SMS channel card to integrations overview page |
| `ef468cb` | feat(tasks/finance): task assignee notifications, expense categories page, bug fixes |
| `3ff4441` | fix(tasks): correct Prisma model name TelegramUserLink |
| `fe60148` | feat(storefront): add Privacy Policy and Terms links to footer |
| `1afdf54` | fix(storefront): pull contact info from storefront settings |
| `329dc1b` | fix(storefront): contact page use correct settings endpoint and env vars |
| `a565cbe` | fix(calendar): per-provider loading state, unwrap envelope for OAuth URL |
| `0b63b0d` | fix(calendar): sync events from Google on load, fix envelope unwrap |
| `c001458` | fix(customers): unwrap response envelope for all customer detail queries |
| `ef67876` | feat(auth): one-click admin temp password reset with forced change on login |
| `20127ed` | fix: task assignees, storefront login, and cart stock enforcement |
| `94fc682` | feat(storefront): add account/sign-in link to header, restore Turnstile |
| `c4db2e7` | fix(storefront): enforce stock limit on product detail add to cart |
| `500be9f` | fix(ecommerce): unwrap response envelope for online orders and API keys |
| `2cb5ac2` | fix(pos): add GET /locations/accessible so sales staff can open POS sessions |
| `78cab06` | fix(staff): unwrap response envelope in employee detail page |
| `4ffe9bd` | feat(tasks/goals/calendar): my-tasks filter, goal editing, calendar account label |
| `f212dd8` | fix(tasks): use creatorId (Prisma field) instead of createdBy for mine filter |
| `47ba86d` | fix(calendar/receipts/tasks): sync events from cache, receipt null invoice, tasks defaults |
| `9a9e295` | feat: security audit logging, backup system, storefront forgot password, health page fix |
| `2fc6bd0` | chore: update pnpm lockfile for node-cron |
| `34d666e` | fix: super admin gets org-wide dashboard data, storefront account hydration |
| `45d110d` | fix(storefront): guard persist.hasHydrated for SSR prerendering |
| `7b1c835` | fix(tasks): add Cache-Control: no-store to prevent 304 stale cache |
| `60efb25` | fix(admin): fix user deletion FK constraints + add tasks/planner/calendar to reset |
| `1e0cd22` | fix: blank storefront page, backup list, detailed audit logs, invite email |
| `32b20a8` | fix(auth): clear mustChangePassword when resetting via email link |
| `4705e5e` | fix(tasks): correct response unwrapping on tasks page |
| `3918256` | fix(tasks): restore correct unwrap for single-task detail fetch |

---

## Major Working Features (Current State)

| Feature | Status |
|---------|--------|
| Organization / Admin Setup | COMPLETE |
| RBAC (roles, permissions, location-scope) | COMPLETE |
| Products + Categories + Brands | COMPLETE |
| Suppliers | COMPLETE |
| Purchasing (POs + clearingCost) | COMPLETE |
| Stock Intake / GRN | COMPLETE |
| Inventory (multi-location) | COMPLETE |
| Barcode (lookup, serialized units) | COMPLETE |
| POS (sales sessions, receipts) | COMPLETE |
| Sales Orders + Invoices (PDF) | COMPLETE |
| Storefront (public e-commerce) | COMPLETE |
| Customer Accounts (OTP signup) | COMPLETE |
| Checkout (Paystack, delivery address) | COMPLETE |
| Order Fulfilment | FUNCTIONAL |
| Finance (expenses, banking, reconciliation) | COMPLETE |
| Reports | FUNCTIONAL |
| Employees / Staff | COMPLETE |
| Tasks (kanban, assignee notifications) | COMPLETE |
| Goals + KPIs | FUNCTIONAL |
| Business Documents (PDF invoices, GRNs) | COMPLETE |
| Notifications (email, SMS, Telegram) | COMPLETE |
| Email (Brevo HTTP + SMTP) | COMPLETE |
| Telegram bot | FUNCTIONAL |
| AI Assistant | FUNCTIONAL |
| Calendar (Google OAuth sync) | FUNCTIONAL |
| Automation Engine | FUNCTIONAL |
| Search (global, vector) | FUNCTIONAL |
| Backup (pg_dump, scheduled, admin UI) | COMPLETE |
| Audit Log | COMPLETE |
| Docker (all 8 services) | COMPLETE |
| Caddy (knefgadgets.com + knefos.knefgadgets.com) | COMPLETE |
| Domain routing | COMPLETE |
| Image Uploads | COMPLETE |
| Turnstile bot protection | COMPLETE |
| Expense Categories | COMPLETE |
| SMS (Termii N-Alert) | COMPLETE |
| Brevo Email API | COMPLETE |
| Data Reset (admin) | COMPLETE |
| Dynamic Org Favicon + Logo | COMPLETE |
| WYSIWYG (TipTap) | COMPLETE |
| mustChangePassword flow | COMPLETE |
| User invite email | COMPLETE |

---

## Known Defects at Checkpoint

1. **API TypeScript compilation — 21 errors (local only, not production)**
   - Root cause: Prisma client not regenerated locally after migrations 0018 and 20261019000000
   - `mustChangePassword` and `SystemBackup` model unrecognised by local tsc
   - **Production is unaffected** — `prisma migrate deploy` runs on container start, Prisma client generated in Docker build
   - Fix required before Stage 24: run `pnpm --filter @knef/database db:generate` locally

2. **Test spec files have stale argument counts** (auth-guards.spec.ts, dashboard-location.spec.ts, ecommerce.service.spec.ts, users.service.spec.ts)
   - Service signatures changed; specs not updated
   - No runtime impact

3. **`version` attribute in docker-compose.yml** — obsolete but harmless warning

---

## DO NOT BREAK IN STAGE 24

The following systems were manually fixed, verified on production, or represent critical UAT-driven work. Stage 24 MUST NOT regress them:

### Authentication & Security
- `mustChangePassword` flow: set on admin temp password, cleared on email-link reset, checked at login
- Cloudflare Turnstile: separate site keys for admin vs storefront (do not merge)
- Zustand `persist.hasHydrated()` pattern in storefront: do not revert to lazy `useState` initializer
- `mustChangePassword: false` in `resetPassword()` (auth.service.ts:444)

### Storefront
- BFF security: `/api/*` routes proxied through storefront Next.js server actions — no direct API exposure
- `CustomerAccount` isolation: separate from `User` table, has own auth flow
- Post-order OTP account creation flow
- Paystack test-mode payment integration
- Termii SMS via generic channel / N-Alert sender (not DND, not BulkTermii)
- Auth store hydration guard (Header + AccountPage) — prevents sign-out on hard refresh
- Stock limit enforcement on cart and product detail page
- Storefront settings: contact info, footer links, hero, announcement

### Admin / API
- `GET /users/assignable` — no MANAGE_USERS permission (any authenticated user can see task assignees)
- `GET /locations/accessible` — allows Sales Staff to open POS sessions
- Super Admin permission override on system roles (5be6233 / after revert)
- Brevo HTTP API email provider — required because SMTP port 587 is blocked on VPS
- Response envelope unwrapping pattern: paginated `{ data, meta }` passes through interceptor unchanged; single-object responses are wrapped. See tasks page for canonical correct pattern.
- `Cache-Control: no-store` on `GET /tasks` to prevent 304 stale kanban

### Infrastructure
- Caddy routes: `knefgadgets.com` → storefront:3001, `knefos.knefgadgets.com` → web:3000 + api:4000, `:8080` → storefront (IP access)
- `/uploads/*` route in Caddy → api:4000
- Alpine Chromium in API Dockerfile for puppeteer PDF generation (do not switch to npm chromium)
- `prisma migrate deploy` in API Dockerfile CMD (not entrypoint) — runs on every container start
- Inter font loaded via CSS `@import` in globals.css (not via `next/font/google`) — required for Docker offline builds
- Relative `/api/v1` URLs in web app (not absolute) — required for production Docker build

### Database / Prisma
- **Never modify migrations 0001–0018** — they are applied on production
- Migration `20261019000001_user_fk_optional_cascade`: SalesOrder.userId and POSSession.userId are now nullable with `ON DELETE SET NULL`; TaskComment.userId nullable with `ON DELETE SET NULL`; Employee with `ON DELETE CASCADE`
- `SystemBackup` table tracks backup history — do not drop

### RBAC
- Seed file permissions: Sales Staff has `tasks.view`, `tasks.create` — verify any permission changes don't break their task access
- Location-scope enforcement: Sales/Purchasing/Inventory/Reports/AI/Telegram all enforce `user.locationId`

---

## Current Test / Build State

### TypeScript

| App | Status | Notes |
|-----|--------|-------|
| `apps/api` | **FAIL — 21 errors** | Prisma client not regenerated locally; runtime unaffected |
| `apps/web` | **PASS** | Clean |
| `apps/storefront` | Not checked locally |
| `apps/worker` | Not checked locally |
| `apps/mcp-server` | Not checked locally |

### Tests

- Jest suite exists in `apps/api`
- Known stale spec files: auth-guards.spec.ts, dashboard-location.spec.ts, ecommerce.service.spec.ts, users.service.spec.ts
- Test count from previous checkpoint: ~1,012 tests (Stage 21 state); exact count at this checkpoint not re-run

### Production Build

- All 8 Docker containers healthy on VPS as of 2026-10-19 19:54 UTC
- `api`, `db`, `redis`, `mcp-server`, `worker` — healthy
- `storefront`, `web`, `caddy` — running

---

## Runtime State (VPS 157.245.43.74 — 2026-10-19 ~19:54 UTC)

| Service | Status | Image |
|---------|--------|-------|
| `api` | healthy | knef-business-os-api |
| `web` | running | knef-business-os-web |
| `storefront` | healthy | knef-business-os-storefront |
| `db` | healthy | pgvector/pgvector:pg16 |
| `redis` | healthy | redis:7-alpine |
| `caddy` | running | caddy:2-alpine |
| `mcp-server` | healthy | knef-business-os-mcp-server |
| `worker` | healthy | knef-business-os-worker |

**Server HEAD = Repository HEAD** (`3918256`) — no drift.

### Active URLs
- Storefront: `https://knefgadgets.com` and `http://157.245.43.74:8080`
- Admin: `https://knefos.knefgadgets.com`
- API: `https://knefos.knefgadgets.com/api/v1`

### Docker Volumes
| Volume | Purpose |
|--------|---------|
| `knef-business-os_postgres_data` | PostgreSQL data |
| `knef-business-os_redis_data` | Redis persistence |
| `knef-business-os_uploads` | Uploaded product images |
| `knef-business-os_backups` | pg_dump backup files |
| `knef-business-os_caddy_data` | Caddy TLS certificates |
| `knef-business-os_caddy_config` | Caddy runtime config |

---

## Recommended Next Step

1. **Before Stage 24 begins:**
   - Trigger a manual database backup: Admin → Health → Backup Now
   - Regenerate Prisma client locally: `pnpm --filter @knef/database db:generate`
   - Fix stale test specs to restore full test suite green status

2. **Stage 24 scope** should be agreed and documented before any code changes.

3. This checkpoint tag (`pre-stage24-checkpoint-20261019`) is the recovery point. Do not delete it.
