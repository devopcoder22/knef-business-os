# Stage 24H Closure Report — WhatsApp Commerce

**Date:** 2026-10-25  
**Commit:** 545326a  
**Branch:** v1.1-development  

---

## 1. Objective

Integrate Meta WhatsApp Business Cloud API v23.0 to enable order notifications and customer support conversations, replacing informal tooling with an official, production-grade channel.

---

## 2. Scope Delivered

### Database (`packages/database/prisma/`)

**`schema.prisma`** — New columns on `WhatsAppConfig`:
- `displayPhoneNumber`, `businessAccountName`, `appSecretEncrypted`
- `status` (NOT_CONFIGURED / ACTIVE / SUSPENDED)
- `webhookVerifiedAt`, `lastHealthCheckAt`, `qualityRating`, `messagingLimit`, `connectionId`

**New models:**
- `WhatsAppTemplate` — template catalog synced from Meta
- `WhatsAppConversation` — per-customer conversation threads with CSW window tracking
- `WhatsAppMessage` — individual messages with monotonic status and idempotency key
- `WhatsAppOrderEventMapping` — org-configurable order event → template binding

**`CustomerAccount`** opt-in fields:
- `whatsappOptIn` (Boolean, default false)
- `whatsappOptInAt` (DateTime)
- `whatsappPhone` (Text)

**Migration:** `20261025000001_stage24h_whatsapp_commerce/migration.sql`
- Fully idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- `CustomerAccount` uses PascalCase table name (no `@@map`) — migration uses `ALTER TABLE "CustomerAccount"` accordingly

---

### Constants (`packages/constants/src/`)

**`permissions.ts`** — New permissions under `COMMUNICATIONS`:
```
WHATSAPP, WHATSAPP_MANAGE, WHATSAPP_SEND, WHATSAPP_TEMPLATES, WHATSAPP_SUPPORT
```

**`queues.ts`** — Extended `WhatsAppSendJobData` (templateName, templateLanguage, templateComponents, contextMessageId, messageId fields); new job types `WHATSAPP_TEMPLATE_SYNC`, `WHATSAPP_HEALTH_CHECK`.

---

### Utilities (`packages/utils/src/`)

**`phone.ts`** — `normalizeToE164(phone, countryCode='NG')` supporting NG/GH/KE/ZA/US/GB. Handles local formats, strips non-digits, validates E.164 output length.

---

### API Module (`apps/api/src/modules/whatsapp/`)

| File | Purpose |
|------|---------|
| `whatsapp.module.ts` | NestJS module wiring; selects `MetaWhatsAppProvider` in prod, `MockWhatsAppProvider` in test |
| `whatsapp-config.service.ts` | Save/retrieve config; AES-256-GCM encrypt/decrypt of `accessTokenEncrypted` and `appSecretEncrypted`; webhook verification; health check |
| `whatsapp-template.service.ts` | CRUD for templates; sync from Meta Graph API |
| `whatsapp-conversation.service.ts` | Create/retrieve conversations; CSW window extension on inbound |
| `whatsapp-message.service.ts` | Send text/template; opt-out detection (STOP/UNSUBSCRIBE → `ChannelPreference`); delivery flag guard |
| `whatsapp-order.service.ts` | Order event → template dispatch; idempotency key `wa:order:{orgId}:{orderId}:{event}` |
| `whatsapp-webhook.controller.ts` | `GET /public/whatsapp/webhook` verification; `POST /public/whatsapp/webhook` HMAC validation + event fanout |
| `whatsapp.controller.ts` | Protected admin endpoints: config, templates, conversations, messages, order mappings |
| `providers/whatsapp-provider.interface.ts` | `IWhatsAppProvider` interface |
| `providers/meta-whatsapp.provider.ts` | Live Meta Graph API v23.0 calls |
| `providers/mock-whatsapp.provider.ts` | In-memory mock for tests |
| `dto/whatsapp.dto.ts` | Request/response DTOs |

**Registered in `app.module.ts`** alongside existing modules.

**`storefront-notification.listener.ts` / `storefront.module.ts`** — Extended to emit WhatsApp order events via the new `WhatsAppOrderService`.

---

### Worker (`apps/worker/src/`)

**`whatsapp-sender.service.ts`** — BullMQ processor:
- Reads `WHATSAPP_DELIVERY_ENABLED` via `process.env` (not ConfigService — key is outside typed schema)
- Decrypts `accessTokenEncrypted` with AES-256-GCM
- Sends template or free-form text to Meta Graph API
- Permanent error codes `[131050, 131026, 132001, 131031, 130429]` → mark FAILED, no retry
- Transient errors → rethrow so BullMQ retries with backoff
- Timeout: `AbortSignal.timeout(15000)`

**`notifications.processor.ts`** — Updated to accept `WhatsAppSenderService` as 4th constructor arg and dispatch `WHATSAPP_SEND` job type.

**`worker.module.ts`** — Registered `WhatsAppSenderService`.

---

### Admin UI (`apps/web/src/app/(dashboard)/communications/whatsapp/page.tsx`)

Four-tab admin page:
1. **Overview** — Config status, connect/disconnect, webhook health
2. **Templates** — Template list with status badges, sync button
3. **Orders** — Order event → template mappings
4. **Conversations** — Conversation list with CSW window status and message counts

---

## 3. Key Invariants

| Invariant | Detail |
|-----------|--------|
| Delivery disabled by default | `WHATSAPP_DELIVERY_ENABLED=false` in stage-validation; no live API calls during tests |
| Idempotency key | `wa:order:{organizationId}:{orderId}:{event}` — enforced by `UNIQUE` on `whatsapp_messages.idempotencyKey` |
| STATUS_RANK monotonic | QUEUED(0) < SUBMITTED(1) < SENT(2) < DELIVERED(3) < READ(4) < FAILED(5) — `updateMessageStatus` guards against regression |
| Webhook HMAC | `sha256=HMAC-SHA256(appSecret, rawBody)` via `timingSafeEqual`; verified per-entry, per-org |
| CSW window | `windowExpiresAt` extended by 24h on each inbound message; free-form text rejected after expiry |
| Opt-out | STOP/UNSUBSCRIBE → `ChannelPreference` via findFirst + create/update (no compound `@@unique` on that model — upsert invalid) |
| IDOR protection | All queries scoped by `organizationId`; server resolves recipient phone from DB, never from client payload |
| Token encryption | AES-256-GCM with 32-byte (64-hex) key; `decrypt()` from `@knef/utils` |
| DI compatibility | All injected providers use regular `import`, not `import type` (erases at runtime) |

---

## 4. Test Suite

**`apps/api/src/modules/whatsapp/whatsapp.spec.ts`** — 47 tests across 6 describe blocks:

| Block | Tests | Coverage |
|-------|-------|---------|
| MetaWhatsAppProvider | 4 | sends template, sends text, handles API error, builds correct body |
| WhatsAppConfigService | 8 | save config encrypts secrets, getConfig omits sensitive fields, webhook verify token match/mismatch, health check active/inactive |
| WhatsAppConversationService | 6 | creates conversation, finds by phone, extends CSW window on inbound, rejects expired CSW |
| WhatsAppMessageService | 14 | sends template, sends text, opt-out STOP keyword, opt-out UNSUBSCRIBE, delivery disabled mock, CSW enforcement, idempotency duplicate, monotonic status guard, IDOR scope |
| WhatsAppOrderService | 8 | dispatches on order event, skips if no mapping, skips if mapping inactive, idempotency prevents duplicate, resolves phone from CustomerAccount |
| WhatsAppWebhookController | 7 | webhook verify success, verify wrong token → 403, verify wrong mode → 403, POST HMAC valid, POST HMAC invalid → 401, POST processes status update, POST processes inbound message |

---

## 5. Test Counts (Final)

| App | Passed | Suites |
|-----|--------|--------|
| API | 1276 / 1276 | 70 |
| Worker | 130 / 130 | 15 |
| Storefront | 86 / 86 | 2 |

---

## 6. Bugs Fixed During Implementation

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `WHATSAPP_DELIVERY_ENABLED` TS2769 | Key not in typed `WorkerConfig` schema | Use `process.env['WHATSAPP_DELIVERY_ENABLED']` directly |
| `ChannelPreference` upsert TS2353 | No compound `@@unique` on (organizationId, phone, channel) | findFirst + conditional create/update |
| `customerName` TS2561 on SalesOrder | Field does not exist on SalesOrder model | Removed from select |
| `notifications.processor.spec.ts` TS2554 | `WhatsAppSenderService` added as 4th constructor arg | Added `makeWhatsAppSender()` mock |
| `RangeError: Invalid key length` | `'a'.repeat(32)` = 16 bytes; AES-256-GCM needs 32 bytes | Changed to `'a'.repeat(64)` |
| `getConfig` sensitive field test | Mock doesn't apply Prisma `select` | Asserted on SELECT call args, not returned object |
| Stage 24G migration NULL `finished_at` | Migration applied manually outside `prisma migrate deploy` | `UPDATE _prisma_migrations SET finished_at = NOW()` |
| `relation "customer_accounts" does not exist` | `CustomerAccount` has no `@@map()` in schema | Changed migration to `ALTER TABLE "CustomerAccount"` |
| 5 stuck Docker worker builds | Multiple background build processes never completed | Killed all PIDs, ran fresh synchronous build |

---

## 7. Stage-Validation Environment

| Container | Status |
|-----------|--------|
| knef-stage-validation-api-1 | healthy |
| knef-stage-validation-worker-1 | healthy |
| knef-stage-validation-storefront-1 | healthy |
| knef-stage-validation-web-1 | up (no healthcheck) |
| knef-stage-validation-mcp-server-1 | healthy |
| knef-stage-validation-redis-1 | healthy |
| knef-stage-validation-db-1 | healthy |

**Webhook endpoint verified:** `GET /api/v1/public/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc` → `403` (route registered, wrong token rejected).

---

## 8. Constraints Observed

- Production deploy: **NOT performed** (spec §88)
- Phase 24I: **NOT started** (spec prohibits without explicit authorization)
