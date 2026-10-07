# KNEF MCP Server

The KNEF MCP Server exposes KNEF business tools to MCP-compatible AI clients (Claude Desktop, Claude.ai, and other MCP clients) using the **Model Context Protocol**.

## Architecture

```
MCP Client (Claude, etc.)
  → HTTP POST /mcp with X-Api-Key
  → KNEF MCP Server (port 4100)
  → KNEF REST Agent Gateway (port 4000)
  → KNEF Business Services
  → Database
```

The MCP server is a **stateless adapter** — it translates MCP tool calls into KNEF agent gateway REST calls. All authorization, permission checking, and autonomy enforcement is performed by the KNEF API.

## SDK

- **SDK**: `@modelcontextprotocol/sdk` v1.11.0
- **Transport**: Streamable HTTP (stateless mode)
- **Protocol**: MCP specification (current stable)

## Authentication

The MCP server requires an `X-Api-Key` header with a valid KNEF external agent API key.

```
X-Api-Key: knef_agent_abc12345_...
```

The key must be linked to an active `ExternalAgent` record in the KNEF organization.

## Connecting (Claude Desktop)

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "knef": {
      "url": "http://localhost:4100/mcp",
      "headers": {
        "X-Api-Key": "knef_agent_your_key_here"
      }
    }
  }
}
```

For production (behind HTTPS proxy):
```json
{
  "mcpServers": {
    "knef": {
      "url": "https://your-domain.com/mcp",
      "headers": {
        "X-Api-Key": "knef_agent_your_key_here"
      }
    }
  }
}
```

## Available Tools

Tools dynamically loaded from the KNEF agent gateway based on your agent's permissions.

### Read-only tools (default)

| Tool | Description |
|---|---|
| `get_inventory_levels` | Read inventory stock levels |
| `get_low_stock_products` | Products below low-stock threshold |
| `get_sales_summary` | Sales revenue and order count for a date range |
| `get_orders` | List recent sales orders |
| `get_financial_summary` | Revenue, expenses, and profit for a period |
| `get_tasks` | List organization tasks |
| `get_goals` | List business goals with progress |
| `get_calendar_events` | Upcoming calendar events |

### Write tools (require explicit allowedTools + scope)

| Tool | Description | Required Scope |
|---|---|---|
| `create_task` | Create a new task | `tasks:write` |

### Tools requiring approval (not exposed by default)

- `create_purchase_order` — HIGH risk, admin must enable
- `send_notification` — admin must enable

## Available Prompts

| Prompt | Description |
|---|---|
| `knef_daily_business_review` | Daily review of sales, inventory, and finances |
| `knef_inventory_review` | Inventory status and restocking needs |
| `knef_task_review` | Open tasks by priority |

## Tool Outcomes

When a tool is invoked, the result includes an `outcome` field:

- `EXECUTED` — Tool ran and result is included
- `QUEUED_FOR_APPROVAL` — Action pending human approval (includes `approvalId`)
- `ADVISORY` — Autonomy level is advisory only — no execution
- `BLOCKED` — Policy blocked execution

## Local Development

### Prerequisites

1. KNEF API running (`pnpm dev` in the monorepo)
2. A KNEF organization with an external agent configured
3. The agent's API key

### Start MCP server

```bash
# From monorepo root
cd apps/mcp-server
MCP_SERVER_PORT=4100 KNEF_API_URL=http://localhost:4000 npm run dev
```

Or with environment file:
```bash
MCP_SERVER_PORT=4100
KNEF_API_URL=http://localhost:4000
```

### Health check

```bash
curl http://localhost:4100/health
```

Response:
```json
{ "status": "ok", "service": "knef-mcp-server", "version": "1.1.0" }
```

### Test with MCP client

```bash
# Using npx with the MCP inspector
npx @modelcontextprotocol/inspector http://localhost:4100/mcp
# Set X-Api-Key header in the inspector UI
```

## Docker Deployment

The MCP server is included in the Docker Compose setup:

```yaml
mcp-server:
  build:
    context: .
    dockerfile: infrastructure/docker/mcp-server.Dockerfile
  environment:
    - MCP_SERVER_PORT=4100
    - KNEF_API_URL=http://api:4000
```

For production, place behind the Caddy reverse proxy with HTTPS:

```caddyfile
your-domain.com {
  handle /mcp* {
    reverse_proxy mcp-server:4100
  }
  handle /api/* {
    reverse_proxy api:4000
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MCP_SERVER_PORT` | `4100` | Port for the MCP HTTP server |
| `KNEF_API_URL` | `http://localhost:4000` | Base URL of the KNEF API |

## Security Model

1. **Authentication**: Every MCP request requires a valid `X-Api-Key` header
2. **Authorization**: All tool calls go through the KNEF agent gateway authorization chain
3. **No direct DB access**: MCP server only calls the KNEF REST API — never the database
4. **Stateless**: Each request independently authenticates — no server-side sessions
5. **Tool visibility**: Only tools the agent is permitted to use are advertised
6. **Org isolation**: Organization is always derived from authentication, never from client input
7. **Result filtering**: Sensitive fields are stripped before returning to MCP clients

## Limitations (V1.1)

- Stateless HTTP transport only (no SSE session resumption)
- MCP Resources not yet implemented (tool-only surface)
- Write tools require explicit admin configuration
- Financial mutations, payments, and permission changes are blocked by default

## Known Considerations

- Tool list is fetched on every MCP connection (stateless design) — this adds ~1 network round-trip
- Write tools go through the autonomy policy engine and may require human approval
- The MCP server logs tool calls but detailed audit logs are recorded by the KNEF API
