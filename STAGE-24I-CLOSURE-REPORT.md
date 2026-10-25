# STAGE 24I CLOSURE REPORT
## SMS + Standards-Compliant Browser Web Push
**Date:** 2026-10-25  
**Branch:** v1.1-development  
**Commit:** 5e5f6fc  

---

## 1. Phase Summary

Phase 24I delivered two parallel workstreams:

1. **SMS Hardening** — delivery flag, `normalizeToE164` migration, idempotency deduplication, typed worker config
2. **Browser Web Push** — full RFC 8291/RFC 7519-compliant implementation replacing the Phase 24B placeholder: real VAPID keys, encrypted payloads via `web-push` npm package, service worker, subscription lifecycle, storefront UI, admin management page

---

## 2. Baseline vs Final Test Counts

| Suite | Baseline | Final | Delta |
|-------|----------|-------|-------|
| API (`@knef/api`) | 1276 | 1291 | +15 |
| Worker (`@knef/worker`) | 130 | 152 | +22 |
| Storefront (`@knef/storefront`) | 86 | 86 | 0 |
| **Total** | **1492** | **1529** | **+37** |

All suites green at commit.

---

## 3. Database Migration

**Migration:** `20261025000002_stage24i_sms_webpush`

Changes:
- `push_subscriptions`: added `failureCount INT DEFAULT 0`, `revokedAt TIMESTAMPTZ?`, `updatedAt TIMESTAMPTZ`
- `push_subscriptions`: new index `@@index([organizationId, isActive])`
- `communication_logs`: added `idempotencyKey TEXT`, unique partial index (WHERE NOT NULL)

Applied to: stage-validation DB (`knef_stage_validation`)

---

## 4. SMS Hardening (Worker)

### `sms-sender.service.ts`
- `SMS_DELIVERY_ENABLED` config flag — `false` by default in stage-validation
- Replaced inline `normalizePhone()` with `normalizeToE164()` from `@knef/utils`
- Null guard after normalization prevents dispatch of unparseable numbers
- Idempotency deduplication: `communicationLog.findFirst({ where: { idempotencyKey, status: 'sent' } })` runs before provider resolution
- `AbortSignal.timeout(15_000)` on all Termii HTTP calls
- 5xx status throws for BullMQ automatic retry; 4xx returns `{ success: false }`

### `worker.config.ts`
- Added: `SMS_DELIVERY_ENABLED`, `WEB_PUSH_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `VAPID_SUBJECT`

### `apps/api/.env.stage-validation`
- Added: `SMS_DELIVERY_ENABLED=false`, `WEB_PUSH_DELIVERY_ENABLED=false`, `VAPID_SUBJECT=mailto:support@knef.app`

---

## 5. Web Push Implementation

### VAPID Key Management (`web-push.service.ts`)
- Uses `webpush.generateVAPIDKeys()` (65-byte EC point, 87-char base64url) — replaces old DER-encoded SPKI generation
- `format: 'v2'` marker in stored JSON; auto-regenerates if `publicKey.length > 100` (old DER format detection)
- Private key stored AES-256-CTR encrypted under `ENCRYPTION_KEY`
- `SystemSetting.value` is a `String` field — uses `JSON.stringify()`/`JSON.parse()` for storage

### Subscription Lifecycle (`web-push.service.ts`)
- `subscribe()`: validates HTTPS-only endpoint, resets `failureCount=0, revokedAt=null` on re-subscribe
- `unsubscribe()`: sets `revokedAt: new Date()`, `isActive: false` via `updateMany`
- `revokeSubscription()`: IDOR guard — throws `ForbiddenException` if `sub.userId !== userId`
- `listSubscriptions()`: scoped to `userId + organizationId`
- `listOrgSubscriptions()`: returns `{ active: N, expired: M }` counts for admin
- `queuePush()`: passes `tag`, `idempotencyKey` through to job data

### Push Dispatch (`web-push-sender.service.ts`)
- `WEB_PUSH_DELIVERY_ENABLED` flag (mock path returns success immediately)
- `MAX_FAILURE_COUNT = 5` — subscriptions exceeding threshold excluded via DB query `{ lt: 5 }`
- `GONE_STATUS_CODES = {404, 410}` → deactivate + `revokedAt`
- `RETRY_STATUS_CODES = {429, 500, 502, 503, 504}` → throw for BullMQ retry
- Unknown/permanent errors → increment `failureCount`, log, continue
- `resolveVapidKeys()`: `JSON.parse(setting.value)` + format validation + `decrypt()`
- Per-subscription `lastUsedAt` + `failureCount=0` reset on successful send
- `updatePushLog()` records `sent`/`failed` status with timestamps

### Notifications Processor (`notifications.processor.ts`)
- Constructor extended to accept `WebPushSenderService` as 3rd argument
- `SEND_PUSH` jobs delegated to `webPushSender.sendPush()`
- `SEND_SMS` passes `idempotencyKey` through to SmsSenderService

### Service Worker (`apps/storefront/public/sw.js`)
- `push` event: `isSafeDestination()` validates same-origin URL, shows notification
- `notificationclick`: opens/focuses window, prevents default
- `pushsubscriptionchange`: re-subscribes, posts `PUSH_SUBSCRIPTION_CHANGED` to all clients
- Security: non-same-origin URLs rejected with console warn

### Storefront BFF Routes
- `GET /api/push/vapid-key` — fetches public key from backend API
- `POST /api/push/subscribe` — strips `userId`/`organizationId` from client payload, injects from session
- `DELETE /api/push/unsubscribe` — strips auth context from client request

### `PushNotificationManager.tsx`
- 5 render states: `unsupported`, `denied`, `subscribed`, `explanation`, `default`
- Pre-permission explanation screen (spec §11)
- `Notification.requestPermission()` called only after explicit user confirmation
- `urlBase64ToUint8Array()` converts VAPID key for `PushManager.subscribe()`
- `applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer` (TS fix)
- Checks existing subscription on mount (`pushsubscriptionchange` rehydration)

### PWA Assets
- `apps/storefront/public/manifest.json`: KNEF Store PWA manifest, icons 192/512
- `apps/storefront/next.config.mjs`: `sw.js` headers: `Content-Type`, `Cache-Control: no-cache`, `Service-Worker-Allowed: /`

### Admin Web Push Page (`apps/web/…/communications/push/page.tsx`)
- VAPID configuration status (configured / not configured)
- Active/expired subscription counts
- Test push form (send to specific userId)
- Browser requirements checklist

---

## 6. API Additions

### `communications.controller.ts`
- `GET /push/subscription-count` — admin endpoint, returns `{ active, expired }` for org
- `POST /push/test` — admin endpoint, queues push to userId with title/body/url

### `sms.service.ts`
- `queueSms()`: passes `idempotencyKey` to `communicationLog.create`

---

## 7. Security Properties

| Property | Implementation |
|----------|---------------|
| IDOR prevention | `revokeSubscription` verifies `sub.userId === userId` before update |
| HTTPS-only endpoints | `subscribe()` rejects non-HTTPS endpoints with `BadRequestException` |
| SSRF prevention | Service worker `isSafeDestination()` rejects non-same-origin notification URLs |
| Private key encryption | VAPID private key encrypted with AES-256-CTR before DB storage |
| Org isolation | All Prisma queries scope by `organizationId` |
| Rate limit resilience | 429 rethrows for BullMQ retry; permanent errors handled gracefully |

---

## 8. Bugs Fixed During Implementation

1. **VAPID JSON not parsed**: `resolveVapidKeys()` was casting `setting.value` directly instead of calling `JSON.parse()` — caused all push dispatch tests to fail with "VAPID keys not configured"
2. **Missing `__esModule: true`**: Jest `esModuleInterop` caused `webpush.sendNotification` to be `undefined` in test files; fixed by adding `__esModule: true` to all `jest.mock('web-push', ...)` factories
3. **Test: `sendSms` missing `message`**: Required field omitted in invalid-phone test
4. **Test: MAX_FAILURE_COUNT architecture**: Test assumed in-memory filtering, but service filters at query level — rewrote test to verify `{ lt: 5 }` filter in Prisma query

---

## 9. Not Deployed

Per spec §95, Phase 24I was NOT deployed to production (157.245.43.74).  
Stage-validation environment updated; production unchanged.

---

## 10. Phase 24J

Not begun. Per spec instructions.
