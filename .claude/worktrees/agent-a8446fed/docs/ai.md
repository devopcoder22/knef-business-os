# KNEF Business OS — AI Architecture

> **Last updated:** 2026-09-29

---

## 1. Overview

The AI system is a layered architecture:

```
User / Telegram / Scheduled Agent
          │
    AI Context Engine          ← assembles context intelligently
          │
    AI Router                  ← selects provider by task type
          │
    AI Provider Abstraction    ← OpenAI | Anthropic | Gemini | Mistral
          │
    AI Tool Registry           ← every action the AI can execute
          │
    AI Approval System         ← human-in-the-loop for risky actions
          │
    Business Data / RAG / Memory
```

---

## 2. Provider Abstraction

```typescript
interface AIProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>
  streamChat(messages: Message[], options?: ChatOptions): AsyncIterable<string>
  generateText(prompt: string, options?: GenerateOptions): Promise<string>
  createEmbedding(text: string): Promise<number[]>
  generateStructuredOutput<T>(prompt: string, schema: ZodSchema<T>): Promise<T>
  toolCall(messages: Message[], tools: ToolDefinition[], options?: ChatOptions): Promise<ToolCallResponse>
  testConnection(): Promise<boolean>
}

// Implementations:
class OpenAIProvider implements AIProvider { ... }      // GPT-4o, GPT-4o-mini
class AnthropicProvider implements AIProvider { ... }   // Claude Sonnet, Claude Haiku
class GeminiProvider implements AIProvider { ... }      // Gemini 1.5 Pro, Flash
class MistralProvider implements AIProvider { ... }     // Mistral Large, 8x7B
```

Provider implementations are in `apps/api/src/modules/ai/providers/`.

---

## 3. AI Model Routing

The AI Router selects the right provider for each task type:

```
Task type → lookup AIProviderRoute → resolve AIProvider
         → if provider unavailable → use fallback provider
         → log to AIUsageLog
         → check AIBudget before executing
```

Default routing (configurable by admin):

| Task type | Default provider | Reason |
|-----------|-----------------|--------|
| `business_chat` | Anthropic Claude | Best reasoning for business Q&A |
| `document_analysis` | Anthropic Claude | Long context support |
| `embedding` | OpenAI | Best embedding quality |
| `classification` | OpenAI GPT-4o-mini | Fast, cheap for simple tasks |
| `text_generation` | OpenAI GPT-4o | General content generation |
| `structured_output` | OpenAI GPT-4o | Reliable JSON output |

Admin can reconfigure routes from the AI Provider Management page.

---

## 4. Autonomy Levels

| Level | Name | What AI can do | Requires |
|-------|------|---------------|---------|
| 0 | Advisory | Answer questions only. No actions. | — |
| 1 | Draft | Prepare action plans/drafts. Cannot execute. | — |
| 2 | User Approval | Propose action → user approves in-app → execute. | User click |
| 3 | Limited Autonomy | Execute pre-approved LOW-risk tools automatically. | Admin config |
| 4 | Scheduled Agent | Execute per approved schedule (cron). | Admin config + explicit schedule |

HIGH and CRITICAL risk tools require human approval regardless of the user's autonomy level.

---

## 5. AI Tool Registry

Every action the AI can perform is registered as a tool:

```typescript
const createTaskTool: AIToolDefinition = {
  name: 'create_task',
  description: 'Creates a new task and assigns it to a staff member',
  inputSchema: z.object({
    title: z.string(),
    assigneeId: z.string(),
    dueDate: z.string().datetime().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    description: z.string().optional(),
  }),
  requiredPermissions: ['tasks.create'],
  riskLevel: 'LOW',
  requiresApproval: false,
  autonomyLevelRequired: 3,
}

const createPurchaseOrderTool: AIToolDefinition = {
  name: 'create_purchase_order',
  description: 'Creates a purchase order for review and approval',
  inputSchema: z.object({ ... }),
  requiredPermissions: ['purchasing.create'],
  riskLevel: 'HIGH',
  requiresApproval: true,
  autonomyLevelRequired: 2,
}
```

Full tool list (Phase 9+):

**READ tools (LOW risk, no approval)**
- `get_sales_summary` — sales by period
- `get_inventory_status` — current stock levels
- `get_profit_report` — P&L summary
- `search_customers` — CRM lookup
- `get_low_stock_products` — reorder candidates
- `get_task_list` — assigned tasks
- `get_goal_progress` — goal vs actual

**WRITE tools (MEDIUM/HIGH risk)**
- `create_task` — assign a task (MEDIUM)
- `create_calendar_event` — schedule event (MEDIUM)
- `draft_email` — prepare email for review (LOW)
- `create_invoice` — generate invoice (MEDIUM)
- `generate_report` — produce report PDF (LOW)
- `create_purchase_recommendation` — suggest PO (MEDIUM, requires approval)
- `create_customer` — add CRM record (MEDIUM)
- `schedule_reminder` — create reminder (LOW)
- `capture_idea` — save business idea (LOW)

**HIGH-RISK tools (always require human approval)**
- `send_email_campaign` — bulk email
- `create_purchase_order` — commit to purchase
- `change_product_price` — price modification
- `issue_refund` — money movement
- `update_user_permission` — access control change

---

## 6. RAG Pipeline

```
Document upload (PDF, DOCX, XLSX, TXT)
    │
    ▼
Text extraction (pdf-parse / mammoth / xlsx)
    │
    ▼
Chunking (paragraph-aware, ~512 tokens, 50-token overlap)
    │
    ▼
Embedding (AIProvider.createEmbedding per chunk)
    │
    ▼
Store in AIDocumentChunk { content, embedding: vector(1536) }
    │
    ▼ (at query time)
Query embedding → pgvector cosine similarity → TOP 6 chunks
    │
    ▼
Permission filter (user's roles must be in document.allowedRoles)
    │
    ▼
Inject retrieved chunks into AI system prompt context
    │
    ▼
AI generates response grounded in retrieved content
```

Vector index: `IVFFlat` with `lists = 100` for the embedding column. Upgrade to `HNSW` if retrieval speed degrades at scale.

---

## 7. AI Memory System

Two separate memory scopes:

**Business Memory** (shared, permission-controlled)
- Pricing policies, company SOPs, business goals, inventory policies, supplier preferences
- Visible to users with appropriate roles
- Editable by management; audited

**Personal Memory** (private per user)
- Personal preferences, reminders, plans, private notes, recurring routines
- Never visible to other users (including managers), except the Super Admin for legal/audit reasons
- User can view, edit, delete, or disable their personal memory

Memory is structured as key-value with categories:

```
{ scope: BUSINESS, category: POLICY, key: "min_profit_margin", value: "16.5%" }
{ scope: PERSONAL, userId: "usr_abc", category: REMINDER, key: "supplier_call_fri", value: "Call MTech at 4pm Friday" }
```

---

## 8. Context Engine

When assembling context for an AI response, targeted retrieval is used — not a full database dump:

```
1. Recent conversation (last 10 messages)
2. Personal memory (if PERSONAL scope conversation)
3. Business memory (BUSINESS scope, permission-filtered)
4. RAG results (top 6 chunks matching the query)
5. Dynamic data via read tools (executed inline before AI call)
6. Current goals and KPIs (if user has permission)
7. Today's key metrics (if requested in context)
```

The system prompt includes explicit instructions:
- Only state facts from the retrieved data
- Never invent figures, inventory counts, or transactions
- When data is unavailable or the user lacks permission, say so clearly
- Distinguish FACT / ANALYSIS / ASSUMPTION / RECOMMENDATION in responses

---

## 9. Scheduled Agents

Scheduled agents run via BullMQ repeatable jobs:

```
AIScheduledAgent {
  name: "Daily Business Analyst"
  schedule: "0 8 * * *"           // every day at 08:00
  instructions: "Analyze yesterday's sales, inventory movements and cash position. Identify any anomalies. Send a concise summary."
  autonomyLevel: 4
  outputChannels: ["DASHBOARD", "TELEGRAM"]
  ownerId: "usr_md"
}
```

Agent execution flow:
```
Cron fires → BullMQ job → ai-agent.processor.ts
  → load agent config + user permissions
  → assemble context (yesterday's data)
  → call AI with read tools available
  → AI produces summary (no write actions at this autonomy for this agent)
  → deliver to configured output channels
  → log to AIUsageLog
```

---

## 10. AI Cost Control

Per-organization (and optionally per-user) budgets:

```
AIBudget {
  periodType: MONTHLY
  maxTokens: 2_000_000
  maxRequestsPerDay: 500
  maxCostUsd: 100.00
  alertAt: 0.80   // alert when 80% consumed
}
```

The AI Router checks budget before every call. When the budget is exceeded, AI requests fail gracefully with a user-facing message. Budget does not prevent overage at the provider's billing level — it is an application-layer guard with alert notifications.

---

## 11. AI Safety Rules (enforced in system prompt + code)

- Never invent financial figures, inventory counts, or transaction records
- Never execute payment, price change, or permission change without human approval
- Never delete records
- Always cite the data source for factual claims
- When the user lacks permission, say: "You don't have permission to access [data type]."
- Autonomy level is enforced in code (tool registry), not just in the prompt
