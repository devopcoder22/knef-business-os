# KNEF Business OS — Security Architecture

> **Standard:** OWASP Top 10  
> **Last updated:** 2026-09-29

---

## 1. Authentication

| Concern | Implementation |
|---------|---------------|
| Password hashing | bcrypt, cost factor 12 |
| Access tokens | JWT, HS256, 15-minute expiry |
| Refresh tokens | Opaque random token (32-byte hex), 30-day expiry, stored as hash in DB |
| Token delivery | Access token in response body; refresh token in httpOnly, SameSite=Strict cookie |
| Token rotation | Refresh issues a new token and invalidates the old one |
| Token revocation | Refresh tokens revoked in DB; access tokens optionally blocklisted in Redis until natural expiry |
| Account lockout | 5 failed logins → 15-minute lockout (tracked in Redis) |
| 2FA | TOTP (RFC 6238) — optional per user; secret stored encrypted; recovery codes hashed |

---

## 2. Authorization

- RBAC enforced on **every controller** via NestJS guards — not frontend-only
- Permission check order: `FeatureFlagGuard → JwtAuthGuard → PermissionGuard`
- AI permission inheritance: AI inherits the requesting user's resolved permission set
- Financial data has additional granular permissions (e.g., `finance.bank.view` is separate from `finance.view`)
- Location-scoped permissions: data access is filtered by the user's assigned locations

---

## 3. Transport Security

- HTTPS enforced at Caddy (reverse proxy) — HTTP redirected to HTTPS
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- TLS certificates: Caddy automatic (Let's Encrypt)
- Internal Docker network communication is HTTP (services are not exposed externally)

---

## 4. Request Security

| Attack | Defense |
|--------|---------|
| XSS | React auto-escapes output; Content-Security-Policy header |
| SQL injection | Prisma parameterized queries; no raw SQL unless absolutely necessary |
| CSRF | Authorization header (Bearer) for all state-changing API calls; httpOnly cookie is not sent by cross-origin fetch |
| Clickjacking | `X-Frame-Options: DENY` |
| Content sniffing | `X-Content-Type-Options: nosniff` |
| Rate limiting | NestJS Throttler on all endpoints; stricter on auth (10 req/min) |
| Input validation | class-validator on all DTOs; ValidationPipe globally — strip unknown fields |
| File uploads | MIME type validation; size limits; stored outside web root |

---

## 5. Secrets Management

| Secret type | Storage | Access |
|------------|---------|--------|
| Database password | Environment variable | Only API + Worker containers |
| JWT secret | Environment variable | Only API container |
| AI API keys | Database, AES-256-GCM encrypted | Decrypted in memory only when needed |
| SMTP credentials | Database, AES-256-GCM encrypted | Decrypted in memory only when needed |
| OAuth tokens (calendar) | Database, AES-256-GCM encrypted | Decrypted in memory only when needed |
| Telegram bot token | Database, AES-256-GCM encrypted | |
| Payment webhook secrets | Environment variable | |
| ENCRYPTION_KEY | Environment variable | Derives AES key for all encrypted DB fields |

The `ENCRYPTION_KEY` is a 32-byte hex string. Never stored in source code or database. Rotate by re-encrypting all encrypted fields with the new key.

**Never commit secrets.** `.gitignore` covers all `.env*` files except `.env.example`.

---

## 6. API Key Security

External API keys (for KNEF platform external access):

- Full key shown **only once** at creation
- Stored as SHA-256 hash in database
- Key format: `knef_<prefix8>_<random48>` — prefix allows identification without revealing the secret
- Scoped: each key has an explicit list of permitted scopes
- Expiry: configurable or never
- Revocation: immediate (hash deleted)

---

## 7. Webhook Security

Inbound webhooks (Paystack, Flutterwave) are verified before processing:

```
POST /api/v1/webhooks/paystack
  1. Read X-Paystack-Signature header
  2. HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY)
  3. Compare — reject if mismatch (401)
  4. Idempotency check: has this transactionId been processed?
  5. Process
```

Outbound webhook deliveries include an `X-KNEF-Signature: sha256=<hmac>` header so receivers can verify.

---

## 8. Audit Logging

- Every important action is written to `AuditLog` (append-only)
- Ordinary users cannot update or delete audit log entries
- Super Admin can read but not modify
- Logged fields: userId, action, entityType, entityId, oldValue, newValue, IP, userAgent, timestamp
- Sensitive values (passwords, tokens, API keys) are never written to audit log

---

## 9. Data Protection

- Passwords never stored in plaintext or logs
- AI API keys, SMTP credentials, OAuth tokens: AES-256-GCM encrypted at rest
- Financial data access requires specific permissions beyond base `finance.view`
- Staff salary data requires `staff.salary.view` permission — not included in standard manager role
- AI memory: personal memory is private to the user; not accessible even to other staff

---

## 10. Dependency Security

```bash
# Run in CI pipeline
pnpm audit --audit-level=high

# Automated updates
pnpm update --recursive --latest  # review before applying
```

- Lock file (`pnpm-lock.yaml`) committed to repository
- Dependabot or Renovate recommended for automated PR-based updates

---

## 11. Production Checklist

Before going live:

- [ ] All `.env` values set from `.env.example`
- [ ] `NODE_ENV=production` set
- [ ] `JWT_SECRET` is a random 64-byte hex string
- [ ] `ENCRYPTION_KEY` is a random 32-byte hex string
- [ ] PostgreSQL not exposed on public port
- [ ] Redis not exposed on public port
- [ ] Caddy HTTPS working and redirecting HTTP
- [ ] Backup script tested and scheduled
- [ ] `pnpm audit` passes with no high/critical vulnerabilities
- [ ] Admin account created with strong password + 2FA enabled
- [ ] Feature flags reviewed — disable unused features
- [ ] Rate limiting tuned for expected traffic
- [ ] Log rotation configured

---

## 12. AI Authorization (V1.1)

### AI Cannot Bypass User Permissions

The AI system is subject to the same permission model as every other part of the application. A user cannot obtain data or trigger actions through the AI that they could not access directly via the REST API.

This guarantee holds regardless of:
- What the user says in a chat prompt
- How the AI chooses to phrase a tool call
- What parameters the AI generates for a tool invocation
- Whether the request flows through chat, direct tool execution, or a scheduled agent

### Enforcement Point

`AIPermissionCheckerService` (`apps/api/src/modules/ai-actions/ai-permission-checker.service.ts`) is the single enforcement point for all AI tool permissions. It is called:

1. From `AIToolsService.executeTool()` — for all direct tool executions
2. From `AIApprovalsService.approve()` — re-verified against the original requestor when an approver processes a pending approval

The checker performs:
1. Registry lookup — tools not in `AI_TOOL_PERMISSION_REGISTRY` are denied (deny-by-default)
2. Permission check — `context.resolvedPermissions.includes(definition.requiredPermission)` must be true
3. Audit log — every denial is recorded in `AuditLog` with `action: 'AI_TOOL_DENIED'`

### Execution Context

`AIExecutionContext` carries the authenticated user's `userId`, `organizationId`, and `resolvedPermissions` (their full effective permission set, including role permissions minus any denied overrides). The context is resolved once per request via `AIPermissionCheckerService.resolveExecutionContext()` and passed through to every tool call.

Organization isolation is enforced at two layers:
- Context always carries the JWT-authenticated user's `organizationId`
- All database queries filter by `organizationId` from the context — not from AI-provided parameters

### Audit Trail for Denied Actions

Every AI tool denial produces an `AuditLog` row:

```
action:   'AI_TOOL_DENIED'
entity:   'AITool'
entityId: <toolName>
metadata: {
  toolName:            string
  reason:              string   // 'Tool not registered' | 'Missing required permission: <perm>'
  resolvedPermissions: string[] // what the user actually had at denial time
}
```

Audit write failure never blocks the denial — the `ForbiddenException` is always thrown regardless of audit service availability.

### Test Coverage

The permission enforcement is covered by 18 unit tests in `ai-permission-checker.service.spec.ts` across 10 test groups:

1. Finance user can query financial data
2. Salesperson cannot obtain financial data via AI (+ audit log assertion)
3. User without inventory permission cannot retrieve inventory data
4. User with `notifications.view` can use `send_notification`
5. User without `purchasing.create` cannot create purchase orders
6. Organization isolation — context always uses authenticated user's `organizationId`
7. Unregistered tools are denied (+ audit log assertion)
8. Denied execution never reaches business service code
9. AI-generated arguments cannot override authorization
10. Authorized users retain full access to permitted tools
