/**
 * KNEF MCP Server
 *
 * Exposes KNEF business tools to MCP-compatible AI clients (Claude, etc.)
 * via the Model Context Protocol with Streamable HTTP transport.
 *
 * Authentication: X-Api-Key header — must be linked to an ExternalAgent record
 * in the KNEF organization.
 *
 * Architecture:
 *   MCP Client → KNEF MCP Server → KNEF REST Gateway → KNEF Services → Database
 *
 * The MCP server is a thin adapter: it translates MCP tool calls into KNEF
 * agent gateway REST calls. All authorization is enforced by the KNEF API.
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { KnefApiClient, type KnefTool } from './knef-client.js';

const PORT = parseInt(process.env['MCP_SERVER_PORT'] ?? '4100', 10);
const KNEF_API_URL = process.env['KNEF_API_URL'] ?? 'http://localhost:4000';

function buildMcpServer(client: KnefApiClient, tools: KnefTool[]): McpServer {
  const server = new McpServer({
    name: 'KNEF Business OS',
    version: '1.1.0',
  });

  for (const tool of tools) {
    const schema = buildZodSchema(tool);

    server.tool(
      tool.name,
      tool.description,
      schema,
      async (args) => {
        try {
          const result = await client.executeTool(tool.name, args as Record<string, unknown>);

          if (result.outcome === 'BLOCKED') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Action blocked: ${result.reason ?? 'Autonomy policy denied execution'}`,
                },
              ],
              isError: true,
            };
          }

          if (result.outcome === 'QUEUED_FOR_APPROVAL') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'pending_approval',
                    message: 'Action requires human approval before execution',
                    approvalId: result.approvalId,
                    actionId: result.actionId,
                    expiresAt: result.expiresAt,
                    requestId: result.requestId,
                  }),
                },
              ],
            };
          }

          if (result.outcome === 'ADVISORY') {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    status: 'advisory',
                    message: result.suggestion ?? 'Action suggested but not executed',
                    requestId: result.requestId,
                  }),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ...(typeof result.result === 'object' && result.result !== null
                    ? result.result
                    : { value: result.result }),
                  _requestId: result.requestId,
                }),
              },
            ],
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  // MCP Prompts — curated analysis prompts
  server.prompt('knef_daily_business_review', 'Daily business review across sales, inventory, and finances', () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Please perform a daily business review. First, get the sales summary for the last 7 days, then check inventory levels for low-stock products, then get the financial summary for this month. Summarize the key findings and flag any concerns.',
        },
      },
    ],
  }));

  server.prompt('knef_inventory_review', 'Review current inventory status and identify restocking needs', () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Please review the current inventory status. Get all low-stock products and inventory levels. Identify which products need restocking urgently.',
        },
      },
    ],
  }));

  server.prompt('knef_task_review', 'Review open tasks and priorities', () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: 'Please review all open tasks. List tasks by priority (URGENT and HIGH first). Identify any overdue tasks.',
        },
      },
    ],
  }));

  return server;
}

function buildZodSchema(tool: KnefTool): Record<string, z.ZodTypeAny> {
  const schema: Record<string, z.ZodTypeAny> = {};
  const required = new Set(tool.inputSchema.required ?? []);

  for (const [key, field] of Object.entries(tool.inputSchema.properties)) {
    let zodType: z.ZodTypeAny;

    if (field.enum) {
      const enumValues = field.enum as [string, ...string[]];
      zodType = z.enum(enumValues).describe(field.description ?? key);
    } else if (field.type === 'number') {
      zodType = z.number().describe(field.description ?? key);
    } else {
      zodType = z.string().describe(field.description ?? key);
    }

    if (!required.has(key)) {
      zodType = zodType.optional();
    }

    schema[key] = zodType;
  }

  return schema;
}

async function main() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health check — no auth required
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'knef-mcp-server', version: '1.1.0' });
  });

  // MCP endpoint — per-request API key authentication
  app.post('/mcp', async (req, res) => {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'X-Api-Key header required' },
      });
      return;
    }

    const client = new KnefApiClient({
      baseUrl: KNEF_API_URL,
      apiKey,
    });

    // Verify credentials and fetch available tools on each request (stateless mode)
    let tools: KnefTool[];
    try {
      const health = await client.getHealth();
      if (health.status !== 'ok') {
        res.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'KNEF API authentication failed' },
        });
        return;
      }
      tools = await client.listTools();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: `Authentication failed: ${message}` },
      });
      return;
    }

    const server = buildMcpServer(client, tools);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session management
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // SSE endpoint for MCP clients that use GET-based streaming (optional)
  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST /mcp with X-Api-Key header for MCP connections',
      },
    });
  });

  app.listen(PORT, () => {
    console.log(`KNEF MCP Server listening on port ${PORT}`);
    console.log(`KNEF API: ${KNEF_API_URL}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error('Fatal error starting MCP server:', err);
  process.exit(1);
});
