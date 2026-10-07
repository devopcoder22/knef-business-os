# KNEF Business OS — Integration Architecture

> **Last updated:** 2026-09-29

---

## 1. Provider Pattern

Every external integration implements a typed interface. Business modules call the interface — not the concrete provider. Providers are swapped via configuration.

```typescript
// Payment example
interface PaymentProvider {
  initializePayment(params: InitPaymentParams): Promise<PaymentInitResult>
  verifyPayment(reference: string): Promise<PaymentVerifyResult>
  verifyWebhook(payload: Buffer, signature: string): boolean
}

class PaystackProvider implements PaymentProvider { ... }
class FlutterwaveProvider implements PaymentProvider { ... }
```

---

## 2. Payment Providers

| Provider | Status | Use |
|----------|--------|-----|
| Paystack | Phase 4 | NGN payments, card, bank transfer |
| Flutterwave | Phase 4 | NGN payments, alternative gateway |
| Cash / POS Terminal | Phase 3 | In-store (recorded manually) |
| Bank Transfer | Phase 3 | Recorded manually + reconciled |

**Webhook flow:**
```
Paystack/Flutterwave → POST /api/v1/webhooks/{provider}
  → verify HMAC signature
  → idempotency check (transactionId)
  → update Payment record
  → emit payment.completed event
```

---

## 3. Banking Providers (Open Banking)

| Provider | Status | Capability |
|----------|--------|-----------|
| Mono | Phase 7+ | Transaction fetch, account balance |
| Okra | Phase 7+ | Alternative to Mono |
| Manual | Phase 4 | Manual bank statement entry |

Interface:
```typescript
interface BankingProvider {
  getAccounts(): Promise<BankAccount[]>
  getTransactions(accountId: string, from: Date, to: Date): Promise<BankTransaction[]>
  getBalance(accountId: string): Promise<number>
}
```

Note: Both Mono and Okra require user authentication flows and have had service interruptions. The system functions without them (manual reconciliation mode).

---

## 4. Email Providers

| Provider | Type | Notes |
|----------|------|-------|
| SMTP | Universal | Gmail, Outlook, Zoho, any SMTP server |
| Amazon SES | API | High volume, very cost-effective |
| SendGrid | API | Marketing campaigns + transactional |
| Mailgun | API | Developer-focused |
| Brevo | API | EU-based, good free tier |

Interface:
```typescript
interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendResult>
  sendTemplate(templateId: string, params: TemplateParams): Promise<SendResult>
  sendBulk(recipients: Recipient[], params: BulkParams): Promise<BulkResult>
  verifyConnection(): Promise<boolean>
}
```

---

## 5. Marketplace Adapters

| Marketplace | Status | Notes |
|-------------|--------|-------|
| Jumia | Phase 7 | Official seller API available |
| Konga | Phase 7 | Seller API available |
| Jiji | Manual only | No official merchant API — label tracking only |

Interface:
```typescript
interface MarketplaceAdapter {
  syncProducts(products: Product[]): Promise<SyncResult>
  syncInventory(levels: InventoryLevel[]): Promise<void>
  fetchOrders(since: Date): Promise<MarketplaceOrder[]>
  updatePrice(productId: string, price: number): Promise<void>
  updateStock(productId: string, qty: number): Promise<void>
}
```

Sync runs on a BullMQ schedule (configurable interval, default: every 30 minutes).

---

## 6. Calendar Providers

| Provider | Status | Notes |
|----------|--------|-------|
| Google Calendar | Phase 10 | Requires OAuth2 app verification (1-4 week process) |
| Microsoft Outlook | Phase 10 | Requires Azure AD app registration |
| Internal calendar | Phase 5 | Built-in task + reminder system (no external dependency) |

```typescript
interface CalendarProvider {
  getEvents(from: Date, to: Date): Promise<CalendarEvent[]>
  createEvent(event: CreateEventParams): Promise<CalendarEvent>
  updateEvent(id: string, params: UpdateEventParams): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
  findAvailableTime(params: FindTimeParams): Promise<TimeSlot[]>
}
```

---

## 7. Telegram

Telegraf.js bot running in the `apps/telegram-bot` container.

Commands:
```
/start      — registration / link account
/sales      — today's sales summary
/inventory  — low stock alert list
/targets    — goal progress
/profit     — today's profit
/tasks      — my open tasks
/report     — request daily summary
```

User authentication: user links their Telegram account via a one-time code in the platform settings. Unlinked Telegram users receive no financial data.

Outbound notifications are sent via Telegram Bot API from the `worker` service (not the bot process) using the organization's configured bot token.

---

## 8. AI Providers

See [ai.md](ai.md) for full AI provider documentation.

---

## 9. External API Key Access (V1.1)

External systems — storefronts, marketplace adapters, external AI agents, partner integrations — authenticate via API keys issued by the organization.

### Authentication flow

```
POST https://api.yourdomain.com/api/v1/ecommerce/public/products
  X-API-Key: knef_abc12345_<secret>

→ ApiKeyGuard:      hash key → find record → check isActive → check expiresAt
→ ApiKeyScopeGuard: read @RequireApiScope('products:read') → check key.scopes → allow or 403
→ Controller
```

### Key issuance

```
POST /api/v1/ecommerce/api-keys   (JWT auth, settings.manage_integrations permission)
Body: { "name": "Storefront Key", "scopes": ["products:read", "sales:write"], "expiresAt": "2027-01-01" }
Response: { "key": "knef_abc12345_...", ... }   ← shown once only
```

Submitted scopes are validated against the registry. Invalid scope names are rejected (400).

### Principle of least privilege

Issue keys with only the scopes required:

| Use case | Recommended scopes |
|----------|--------------------|
| Storefront read-only | `products:read`, `inventory:read` |
| Storefront with orders | `products:read`, `inventory:read`, `sales:write`, `sales:read` |
| Read-only AI agent | `ai:read`, `inventory:read`, `reports:read` |
| AI agent with execution | above + `ai:execute` |
| Reporting partner | `reports:read`, `finance:read` |

An AI agent with `ai:read` and `inventory:read` cannot create purchase orders (`purchasing:create`) or execute AI tools (`ai:execute`) unless those scopes are explicitly added.

### Audit trail

Every scope denial is written to `AuditLog` with `action: API_KEY_SCOPE_DENIED`, including key ID, endpoint, required scopes, granted scopes, and missing scopes. The raw API key is never logged.

---

## 10. Integration Status Page

The admin Integrations page shows:

```
Category: Payments
  Paystack         [Connected ✓]  [Configure] [Test] [Disconnect]
  Flutterwave      [Not connected] [Connect]

Category: Banking
  Mono             [Not connected] [Connect]

Category: Email
  SMTP (Gmail)     [Connected ✓]  [Configure] [Test]
  SendGrid         [Not connected] [Connect]

Category: Telegram
  KNEF Bot         [Active ✓]    [Configure] [Test]

Category: Marketplaces
  Jumia            [Not connected] [Connect]
  Konga            [Not connected] [Connect]
  Jiji             [Manual only]  [Instructions]

Category: AI
  Anthropic        [Connected ✓]  [Configure]
  OpenAI           [Connected ✓]  [Configure]
  Google Gemini    [Not connected] [Connect]

Category: Calendar
  Google Calendar  [Not connected] [Connect]
  Outlook          [Not connected] [Connect]
```
