# Automation Engine — KNEF Business OS V1.1

## Overview

The KNEF Automation Engine is a generic, event-driven rule execution system. Administrators configure rules via the API — no source-code changes required for new automation logic. The engine is designed for business event automation (inventory alerts, order notifications, task creation) and deliberately excludes high-risk financial actions that must remain under human control.

---

## Architecture

```
BUSINESS EVENT (e.g., order.completed)
    ↓
EventEmitter2 (NestJS in-process)
    ↓
AutomationEventsListener (@OnEvent handlers)
    ↓  normalizes payload → AutomationEventEnvelope
AutomationRulesService.findMatchingRules()
    ↓  queries active rules for org + trigger + location
AutomationActionDispatcherService.dispatchForEvent()
    ↓  evaluates conditions → creates AutomationExecution record → enqueues BullMQ job
AUTOMATION queue (BullMQ)
    ↓
AutomationProcessor (apps/worker)
    ↓  verifies org, executes controlled action, records result
BUSINESS SERVICE / QUEUE (notifications, email, Telegram, tasks, reports, AI)
    ↓
AutomationExecution updated → status SUCCESS / FAILED
```

**API vs Worker split:**
- API side: rule matching, condition evaluation, idempotent execution record creation, job enqueueing
- Worker side: actual action execution, retries, result recording, audit

---

## Trigger Registry

Only the following triggers are accepted. Arbitrary strings are rejected at rule creation time.

| Trigger | Description |
|---|---|
| `inventory.low` | Product quantity dropped below alert threshold |
| `inventory.out_of_stock` | Product reached zero stock |
| `inventory.updated` | Inventory level adjusted or transferred |
| `order.created` | New sales order created |
| `order.completed` | Sales order marked completed |
| `order.cancelled` | Sales order cancelled |
| `payment.received` | Payment successfully recorded |
| `invoice.created` | New invoice generated |
| `invoice.paid` | Invoice marked paid |
| `purchase_order.created` | New purchase order created |
| `purchase_order.approved` | Purchase order approved |
| `customer.created` | New customer record added |
| `task.created` | New task created |
| `task.completed` | Task marked complete |
| `goal.reached` | Goal achieved |
| `staff.clocked_in` | Employee clocked in |
| `staff.clocked_out` | Employee clocked out |

---

## Action Registry

Only the following action types may appear in rule actions. High-risk financial actions are deliberately excluded.

| Action Type | Description | Required Params |
|---|---|---|
| `SEND_NOTIFICATION` | In-app notification | `title`, `message` |
| `SEND_EMAIL` | Transactional email via existing email worker | `to`, `subject`, `body` |
| `SEND_TELEGRAM` | Message to organization Telegram channel | `message` |
| `CREATE_TASK` | Create a new task record | `title` |
| `GENERATE_REPORT` | Queue a report generation job | `reportType` |
| `REQUEST_AI_ANALYSIS` | Trigger a configured AI scheduled agent | `prompt`, `agentId` |

**Deliberately excluded:** payments, refunds, price changes, permission changes, role changes, bulk financial operations, API key creation.

---

## Condition Operators

Conditions evaluate against the normalized event envelope. Use dot-notation to reference nested fields (e.g., `data.quantity`, `data.totalAmount`).

| Operator | Description |
|---|---|
| `equals` | Strict equality (no type coercion) |
| `notEquals` | Strict inequality |
| `greaterThan` | Numeric `>` |
| `greaterThanOrEqual` | Numeric `>=` |
| `lessThan` | Numeric `<` |
| `lessThanOrEqual` | Numeric `<=` |
| `contains` | String substring (case-insensitive) or array includes |
| `notContains` | String or array absence |
| `in` | Value is member of right-side array |
| `notIn` | Value is not in right-side array |
| `exists` | Field is present and non-null |
| `notExists` | Field is absent or null |

**Groups:** `AND` (all must pass) and `OR` (at least one must pass) can be nested up to 5 levels deep.

**Safety:** No `eval()`, no arbitrary code execution. All operators are enumerated. Invalid conditions fail safely (return false, do not trigger action).

---

## Event Envelope

All business events are normalized into a safe internal envelope before rule evaluation:

```typescript
{
  eventType: string;        // e.g., 'inventory.low'
  organizationId: string;   // organization isolation key
  locationId?: string|null;
  actorUserId?: string|null;
  entityType?: string;
  entityId?: string;
  occurredAt: Date;
  automationDepth: number;  // loop prevention counter
  causationId?: string|null; // parent execution ID
  data: Record<string, unknown>; // event-specific payload
}
```

**Never placed in envelope:** passwords, reset tokens, OAuth tokens, API keys, bank credentials, AI provider keys.

---

## Idempotency Design

Three layers of deduplication:

1. **Stable eventId**: `sha256(eventType:orgId:entityId:minute).slice(0,24)` — same event within the same minute produces the same ID
2. **DB unique constraint**: `AutomationExecution(ruleId, eventId, actionIndex)` — duplicate unique violation is caught and silently skipped
3. **BullMQ job ID**: `auto:{ruleId}:{eventId}:{actionIndex}` — BullMQ prevents duplicate queuing of the same job

---

## Loop Prevention

Runaway automation chains are prevented by:

1. **`automationDepth` counter**: incremented for each automation-triggered event chain
2. **`MAX_AUTOMATION_DEPTH = 3`**: dispatcher stops processing at depth ≥ 3
3. **`causationId`**: tracks the execution that caused subsequent automations
4. **Worker writes directly to DB**: automation-created tasks/notifications don't re-enter the EventEmitter2 bus, breaking recursive loops naturally

---

## Security Model

- Rules are always scoped to an organization — cross-org execution is impossible
- Location-scoped rules only apply to events from their location
- `locationIds = []` (deny-all) is never treated as org-wide (`locationIds = null`)
- Worker never bypasses security: it re-verifies org, rule status, and action validity at execution time
- Rule creation validates that the creating user is authorized for the specified location
- AI automation uses existing AI provider routing, permissions, and autonomy policy
- High-risk actions route to the existing approval architecture or are rejected

---

## Permissions

| Permission | Description |
|---|---|
| `automation.view` | View rules and execution history |
| `automation.create` | Create automation rules |
| `automation.edit` | Edit automation rules |
| `automation.delete` | Delete automation rules |
| `automation.activate` | Activate/deactivate rules |
| `automation.execute` | Simulate rule execution |
| `automation.history.view` | View execution history |

---

## API Endpoints

```
GET    /automation/triggers          — list available trigger types
GET    /automation/actions           — list available action types
GET    /automation/rules             — list rules (paginated)
POST   /automation/rules             — create rule
GET    /automation/rules/:id         — get rule detail
PATCH  /automation/rules/:id         — update rule
POST   /automation/rules/:id/activate   — activate rule
POST   /automation/rules/:id/deactivate — deactivate rule
DELETE /automation/rules/:id         — delete rule
POST   /automation/rules/:id/test    — simulate rule (no side effects)
GET    /automation/executions        — list execution history (paginated)
GET    /automation/executions/:id    — get execution detail
```

---

## Rule Structure Example

```json
{
  "name": "Low Stock Alert",
  "trigger": "inventory.low",
  "conditions": [
    { "field": "data.quantity", "operator": "lessThan", "value": 5 }
  ],
  "actions": [
    {
      "type": "SEND_NOTIFICATION",
      "params": {
        "userId": "manager-id",
        "title": "Low Stock: {{data.productName}}",
        "message": "Only {{data.quantity}} units remaining at location {{data.locationId}}"
      }
    },
    {
      "type": "SEND_TELEGRAM",
      "params": {
        "message": "⚠️ Low Stock Alert: {{data.productName}} — {{data.quantity}} units left"
      }
    }
  ],
  "isActive": true
}
```

Template syntax `{{field.path}}` resolves values from the event envelope using safe property traversal (no eval).

---

## Retry Behavior

| Error Category | Behavior |
|---|---|
| Transient (network, rate limit, HTTP 5xx) | Retries up to 3 times with exponential backoff (10s base) |
| Permanent (unknown action, missing entity, org mismatch) | `UnrecoverableError` — no retry, marked `FAILED` with `PERMANENT` category |

---

## Execution History

Each execution record tracks:
- `eventId`, `eventType`, `ruleId`, `organizationId`, `locationId`
- `status`: PENDING → RUNNING → SUCCESS / FAILED / RETRYING
- `actionType`, `actionIndex`
- `attempt`, `startedAt`, `completedAt`
- `failureCategory`: TRANSIENT / PERMANENT
- `errorMessage` (safe, no secrets)
- `resultMetadata`: action-specific result (e.g., `{ taskId: '...' }`)
- `automationDepth`, `causationId` for chain tracing

---

## Example Automation Recipes

### A: Low Stock → Notification + Telegram
```json
{ "trigger": "inventory.low", "actions": ["SEND_NOTIFICATION", "SEND_TELEGRAM"] }
```

### B: Payment Received → Manager Notification
```json
{ "trigger": "payment.received", "actions": ["SEND_NOTIFICATION"] }
```

### C: Task Completed → Notify Manager
```json
{ "trigger": "task.completed", "conditions": [{ "field": "data.assigneeId", "operator": "exists" }], "actions": ["SEND_NOTIFICATION"] }
```

### D: Goal Reached → Management Notification
```json
{ "trigger": "goal.reached", "actions": ["SEND_NOTIFICATION", "SEND_TELEGRAM"] }
```

### E: Low Stock → AI Reorder Analysis
```json
{ "trigger": "inventory.low", "actions": [{ "type": "REQUEST_AI_ANALYSIS", "params": { "prompt": "Analyze reorder need for {{data.productName}}", "agentId": "agent-id" } }] }
```
