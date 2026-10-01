# External AI Agent Gateway

The KNEF External Agent Gateway allows external AI agents, autonomous applications, and AI frameworks to securely interact with KNEF Business OS through controlled, auditable business tools.

## Architecture

```
External AI Agent
  → X-Api-Key authentication
  → ExternalAgent identity resolution
  → Scope validation
  → Tool allowlist check
  → Argument validation + org isolation
  → AI Execution Policy Engine
  → Autonomy / Approval gate
  → KNEF Business Service
  → Database
  → Filtered, sanitized result
```

External agents **never** receive direct database access. All requests pass through the KNEF Tool Layer and existing authorization infrastructure.

## Authentication

External agents authenticate using an **API key** in the `X-Api-Key` header.

Each API key is linked to exactly one `ExternalAgent` record in the organization. The agent record controls:
- Which tools the agent can invoke (`allowedTools`)
- Which API scopes the agent has (`scopes`)
- The agent's autonomy level (`autonomyLevel`)
- Per-minute rate limit (`rateLimitPerMinute`)

### Creating an Agent

```http
POST /api/v1/external-agents
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "name": "Claude Integration",
  "description": "Claude AI with read-only inventory and sales access",
  "scopes": ["inventory:read", "sales:read", "reports:read"],
  "allowedTools": ["get_inventory_levels", "get_sales_summary", "get_low_stock_products"],
  "autonomyLevel": "APPROVAL_REQUIRED",
  "rateLimitPerMinute": 60
}
```

Response (201 Created):
```json
{
  "data": {
    "agent": { "id": "...", "name": "Claude Integration", ... },
    "rawApiKey": "knef_agent_abc12345_..."
  }
}
```

> **Important**: The `rawApiKey` is returned **once only** at creation time. Store it securely immediately — it cannot be retrieved again.

## Agent Identity

Each agent has:

| Field | Description |
|---|---|
| `id` | Unique agent ID |
| `name` | Human-readable name |
| `organizationId` | Owning organization |
| `status` | `ACTIVE` / `SUSPENDED` / `REVOKED` |
| `scopes` | API scopes granted |
| `allowedTools` | Permitted tool names (empty = all exposed) |
| `autonomyLevel` | Execution policy level |
| `rateLimitPerMinute` | Request rate cap |
| `lastUsedAt` | Last authenticated request |

## REST Agent Gateway

Base path: `GET|POST /api/v1/agent/*`  
Authentication: `X-Api-Key: <key>`

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/agent/health` | Liveness check |
| `GET` | `/api/v1/agent/me` | Authenticated agent identity |
| `GET` | `/api/v1/agent/tools` | Discover permitted tools |
| `GET` | `/api/v1/agent/tools/:name` | Get single tool definition |
| `POST` | `/api/v1/agent/tools/:name/execute` | Execute a KNEF tool |

### Tool Discovery

```http
GET /api/v1/agent/tools
X-Api-Key: knef_agent_abc12345_...
```

Returns only tools the agent is authorized to see (filtered by `allowedTools`).

### Tool Execution

```http
POST /api/v1/agent/tools/get_inventory_levels/execute
X-Api-Key: knef_agent_abc12345_...
Content-Type: application/json
Idempotency-Key: <optional-client-key>

{
  "parameters": {
    "locationId": "loc-abc123"
  }
}
```

Response:
```json
{
  "requestId": "req_abc123",
  "toolName": "get_inventory_levels",
  "outcome": "EXECUTED",
  "result": {
    "levels": [...]
  }
}
```

### Outcomes

| Outcome | Meaning |
|---|---|
| `EXECUTED` | Tool ran successfully, result included |
| `QUEUED_FOR_APPROVAL` | Requires human approval — `approvalId` returned |
| `ADVISORY` | At advisory autonomy level — suggestion only |
| `DRAFT` | Draft action created for manual review |
| `BLOCKED` | Blocked by autonomy policy or risk level |

## Exposed Tools

| Tool | Category | Risk | Required Scope | Approval |
|---|---|---|---|---|
| `get_inventory_levels` | inventory | LOW | `inventory:read` | NONE |
| `get_low_stock_products` | inventory | LOW | `inventory:read` | NONE |
| `get_sales_summary` | sales | LOW | `sales:read` | NONE |
| `get_orders` | sales | LOW | `sales:read` | NONE |
| `get_financial_summary` | finance | LOW | `finance:read` | NONE |
| `get_tasks` | tasks | LOW | `tasks:read` | NONE |
| `create_task` | tasks | LOW | `tasks:write` | NONE |
| `get_goals` | goals | LOW | `goals:read` | NONE |
| `get_calendar_events` | calendar | LOW | `calendar:read` | NONE |

Tools **not** externally exposed by default:
- `create_purchase_order` — HIGH risk, default NOT_EXPOSED
- `send_notification` — default NOT_EXPOSED
- All financial mutations, payments, permission changes

## Authorization Flow

```
API Key → ExternalAgent identity
ExternalAgent.status === ACTIVE?   → UNAUTHENTICATED if not
Tool in allowedTools (or empty)?   → TOOL_NOT_ALLOWED if restricted
Tool externalExposure != NOT_EXPOSED? → TOOL_NOT_EXPOSED if not
Agent has requiredScope?           → SCOPE_DENIED if not
Arguments pass schema validation?  → INVALID_ARGUMENT if not
organizationId stripped from args  → prevents cross-tenant injection
Autonomy policy evaluation         → EXECUTED | QUEUED | BLOCKED | etc.
Result filtered (secrets removed)  → sanitized response
```

## Idempotency

For write tools (`create_task`, etc.), provide an `Idempotency-Key` header or `idempotencyKey` in the request body. Duplicate requests with the same key return the cached result without re-executing.

## Rate Limiting

Default: 5 req/s, 60 req/min per agent. Configurable via `rateLimitPerMinute` on the agent record.

## Audit Logging

Every request is recorded with:
- Agent identity and organization
- Tool name and arguments summary
- Authorization outcome
- Policy decision
- Request ID for tracing

Sensitive data (API keys, passwords, tokens) is **never** logged.

## Admin Management

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/v1/external-agents` | `external_agents.view` |
| `POST` | `/api/v1/external-agents` | `external_agents.create` |
| `GET` | `/api/v1/external-agents/:id` | `external_agents.view` |
| `PATCH` | `/api/v1/external-agents/:id` | `external_agents.manage` |
| `DELETE` | `/api/v1/external-agents/:id` | `external_agents.delete` |
| `POST` | `/api/v1/external-agents/:id/rotate-key` | `external_agents.manage` |
| `GET` | `/api/v1/external-agents/tools` | `external_agents.view` |

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing, invalid, revoked, or expired API key |
| `AGENT_SUSPENDED` | 401 | Agent is suspended or revoked |
| `FORBIDDEN` | 403 | Permission denied |
| `SCOPE_DENIED` | 403 | Agent lacks required API scope |
| `TOOL_NOT_FOUND` | 400 | Tool does not exist |
| `TOOL_NOT_EXPOSED` | 403 | Tool is not available to external agents |
| `TOOL_NOT_ALLOWED` | 403 | Tool not in agent's allowedTools |
| `INVALID_ARGUMENT` | 400 | Missing required or invalid argument |
| `APPROVAL_REQUIRED` | 200 | Action queued — see approvalId |
| `AUTONOMY_DENIED` | 200 | Autonomy policy blocked execution |
| `RATE_LIMITED` | 429 | Request rate exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Security

- External agents **cannot** send SQL, Prisma queries, or arbitrary code
- All tool arguments are validated against a strict JSON schema
- Unknown/extra parameters are silently stripped
- `organizationId` cannot be overridden by the agent — always derived from authentication
- Results are filtered before returning (secrets, internal fields removed)
- Cross-organization access is architecturally impossible
- All security events are audit logged
