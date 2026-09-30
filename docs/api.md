# KNEF Business OS — API Architecture

> **Style:** REST, versioned at `/api/v1/`  
> **Docs:** OpenAPI 3.0 at `/api/docs` (Swagger UI)  
> **Last updated:** 2026-09-29

---

## 1. Conventions

```
Base URL:     https://yourdomain.com/api/v1
Auth header:  Authorization: Bearer <access_token>
Content-Type: application/json
Response:     { data: ..., meta?: ..., error?: ... }
Errors:       { error: { code, message, requestId } }
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No content (delete) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Not authorized (permission denied) |
| 404 | Not found |
| 409 | Conflict (e.g., duplicate IMEI) |
| 422 | Business rule violation (e.g., insufficient stock) |
| 429 | Rate limited |
| 500 | Internal server error |

### Pagination

```
GET /api/v1/products?page=1&limit=20&sort=createdAt&dir=desc

Response:
{
  "data": [...],
  "meta": {
    "total": 482,
    "page": 1,
    "limit": 20,
    "totalPages": 25
  }
}
```

---

## 2. Authentication Endpoints

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
POST /api/v1/auth/2fa/enable
POST /api/v1/auth/2fa/verify
POST /api/v1/auth/2fa/disable
GET  /api/v1/auth/me
```

---

## 3. Core Module Endpoints

```
# Products
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id
GET    /api/v1/products/:id/variants
POST   /api/v1/products/:id/variants
GET    /api/v1/products/:id/inventory
GET    /api/v1/products/search?q=iPhone
POST   /api/v1/products/:id/images

# Categories & Brands
GET    /api/v1/categories (tree)
POST   /api/v1/categories
GET    /api/v1/brands
POST   /api/v1/brands

# IMEI / Serial Units
GET    /api/v1/serialized-units?status=IN_STOCK
GET    /api/v1/serialized-units/:id
POST   /api/v1/serialized-units
PATCH  /api/v1/serialized-units/:id
GET    /api/v1/serialized-units/lookup?imei=354321...

# Inventory
GET    /api/v1/inventory?locationId=xxx
GET    /api/v1/inventory/:productId/movements
POST   /api/v1/inventory/transfers
PATCH  /api/v1/inventory/transfers/:id
POST   /api/v1/inventory/adjustments
POST   /api/v1/inventory/counts

# Purchasing
GET    /api/v1/suppliers
POST   /api/v1/suppliers
GET    /api/v1/purchase-orders
POST   /api/v1/purchase-orders
PATCH  /api/v1/purchase-orders/:id/approve
PATCH  /api/v1/purchase-orders/:id/cancel
POST   /api/v1/goods-receipts

# Sales
GET    /api/v1/sales-orders
POST   /api/v1/sales-orders
GET    /api/v1/sales-orders/:id
PATCH  /api/v1/sales-orders/:id/complete
PATCH  /api/v1/sales-orders/:id/cancel
POST   /api/v1/sales-orders/:id/refund

# POS
POST   /api/v1/pos/sessions          (open session)
PATCH  /api/v1/pos/sessions/:id/close
POST   /api/v1/pos/quick-sale        (atomic POS transaction)

# Invoices & Receipts
GET    /api/v1/invoices
GET    /api/v1/invoices/:id
GET    /api/v1/invoices/:id/pdf
GET    /api/v1/receipts/:id
GET    /api/v1/receipts/:id/pdf

# Payments
GET    /api/v1/payments
POST   /api/v1/payments
GET    /api/v1/payments/:id

# Customers
GET    /api/v1/customers
POST   /api/v1/customers
GET    /api/v1/customers/:id
PATCH  /api/v1/customers/:id
GET    /api/v1/customers/:id/orders
GET    /api/v1/customers/:id/balance
GET    /api/v1/customer-segments

# Finance
GET    /api/v1/finance/summary
GET    /api/v1/finance/profit-loss?from=&to=
GET    /api/v1/finance/cash-flow?from=&to=
GET    /api/v1/expenses
POST   /api/v1/expenses
PATCH  /api/v1/expenses/:id/approve
GET    /api/v1/bank-accounts
GET    /api/v1/bank-accounts/:id/transactions

# Staff
GET    /api/v1/employees
POST   /api/v1/employees
GET    /api/v1/employees/:id
GET    /api/v1/attendance?date=2026-09-29
POST   /api/v1/attendance/check-in
POST   /api/v1/attendance/check-out

# Tasks
GET    /api/v1/tasks
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id/complete
POST   /api/v1/tasks/:id/comments

# Goals
GET    /api/v1/goals
POST   /api/v1/goals
GET    /api/v1/goals/:id/progress

# Reports
GET    /api/v1/reports/sales?from=&to=&format=json|csv|pdf
GET    /api/v1/reports/inventory
GET    /api/v1/reports/profit
GET    /api/v1/reports/customers
GET    /api/v1/reports/staff
POST   /api/v1/reports/generate     (async — returns jobId)
GET    /api/v1/reports/jobs/:jobId  (poll for completion)

# Analytics
GET    /api/v1/analytics/dashboard
GET    /api/v1/analytics/sales-velocity
GET    /api/v1/analytics/inventory-intelligence
GET    /api/v1/analytics/customer-intelligence
```

---

## 4. AI Endpoints

```
POST   /api/v1/ai/chat              (send message, get response)
POST   /api/v1/ai/chat/stream       (SSE streaming response)
GET    /api/v1/ai/conversations
GET    /api/v1/ai/conversations/:id
DELETE /api/v1/ai/conversations/:id

GET    /api/v1/ai/insights          (latest proactive insights)
GET    /api/v1/ai/approvals         (pending AI action approvals)
POST   /api/v1/ai/approvals/:id/approve
POST   /api/v1/ai/approvals/:id/reject

GET    /api/v1/ai/memory
POST   /api/v1/ai/memory
DELETE /api/v1/ai/memory/:id

POST   /api/v1/ai/documents         (upload to knowledge base)
GET    /api/v1/ai/documents
DELETE /api/v1/ai/documents/:id

GET    /api/v1/ai/scheduled-agents
POST   /api/v1/ai/scheduled-agents
PATCH  /api/v1/ai/scheduled-agents/:id
DELETE /api/v1/ai/scheduled-agents/:id

GET    /api/v1/ai/usage             (token usage + cost summary)
```

---

## 5. Integration / Admin Endpoints

```
# Webhooks (inbound from payment providers)
POST   /api/v1/webhooks/paystack
POST   /api/v1/webhooks/flutterwave

# E-commerce (public — used by storefront or external systems)
GET    /api/v1/ecommerce/products
GET    /api/v1/ecommerce/products/:slug
POST   /api/v1/ecommerce/orders

# API key management
GET    /api/v1/admin/api-keys
POST   /api/v1/admin/api-keys
DELETE /api/v1/admin/api-keys/:id

# Users & Roles (admin)
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id/permissions
GET    /api/v1/admin/roles
POST   /api/v1/admin/roles
PATCH  /api/v1/admin/roles/:id/permissions

# Feature flags
GET    /api/v1/admin/feature-flags
PATCH  /api/v1/admin/feature-flags/:key

# Settings
GET    /api/v1/settings
PATCH  /api/v1/settings

# Health
GET    /api/v1/health
GET    /api/v1/readiness
GET    /api/v1/liveness
```

---

## 6. External Agent API

External AI agents (Claude, ChatGPT, etc.) connect through scoped API keys:

```
Header: X-API-Key: knef_abc12345_<secret>

GET    /api/v1/agent/sales-summary?period=today
GET    /api/v1/agent/inventory-status?lowStock=true
POST   /api/v1/agent/tasks
GET    /api/v1/agent/goals
GET    /api/v1/agent/low-stock-products
POST   /api/v1/agent/purchase-recommendation
```

Every agent request is:
1. Authenticated (API key → resolved scopes)
2. Permission-checked (scopes against requested resource)
3. Logged (AIUsageLog)
4. Rate-limited (stricter limits than internal API)

---

## 7. API Scopes (for API keys)

API key scopes are **actively enforced** (V1.1). Every protected route declares required scopes via `@RequireApiScope()`. A valid key without the required scope receives `403 Forbidden`.

### Authorization guard chain

```
Request (x-api-key header)
  → ApiKeyGuard       — validates key existence, isActive, expiresAt; audits revoked/expired use
  → ApiKeyScopeGuard  — checks requiredScopes ⊆ apiKey.scopes; audits scope denials
  → Controller handler
```

### Scope registry (`packages/constants/src/api-scopes.ts`)

```
products:read        products:write
inventory:read       inventory:write
sales:read           sales:write
customers:read       customers:write
suppliers:read       suppliers:write
purchasing:read      purchasing:create    purchasing:approve
finance:read         finance:write        finance:approve
staff:read           staff:write
reports:read
ai:read              ai:execute
email:send
telegram:send
calendar:read        calendar:write
```

### Public e-commerce endpoint → required scope mapping

| Endpoint | Method | Required Scope |
|----------|--------|----------------|
| `/ecommerce/public/products` | GET | `products:read` |
| `/ecommerce/public/products/:id` | GET | `products:read` |
| `/ecommerce/public/categories` | GET | `products:read` |
| `/ecommerce/public/search` | GET | `products:read` |
| `/ecommerce/public/orders` | POST | `sales:write` |
| `/ecommerce/public/orders/:reference` | GET | `sales:read` |
| `/ecommerce/public/inventory` | GET | `inventory:read` |

### Issuing API keys

- Keys are issued via `POST /api/v1/ecommerce/api-keys` (internal, JWT auth, `settings.manage_integrations` permission)
- Submitted `scopes[]` are validated against the registry — unknown scope names are rejected (400)
- Keys are issued with the minimum scopes required; prefer narrow scopes over broad ones
- External AI agents must receive only the scopes they need: `ai:read` + `inventory:read` is not the same as `ai:execute`
