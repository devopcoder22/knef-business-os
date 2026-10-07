export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApprovalRequirement = 'NONE' | 'SOFT' | 'REQUIRED';
export type ExternalExposure = 'NOT_EXPOSED' | 'EXTERNAL_READ_ONLY' | 'EXTERNAL_EXECUTION' | 'ADMIN_ONLY';

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
}

export interface ToolPermissionDefinition {
  toolName: string;
  requiredPermission: string;
  riskLevel: ToolRiskLevel;
  approvalRequired: ApprovalRequirement;
  description: string;
  category: string;
  externalExposure: ExternalExposure;
  /** API scope(s) required for external agent access */
  requiredScope?: string;
  inputSchema: ToolInputSchema;
}

/**
 * Authoritative permission registry for all AI-executable tools.
 * Every tool that can be invoked by AI MUST be listed here.
 * Tools not listed here are DENIED by default.
 *
 * externalExposure controls whether external agents and MCP clients can access this tool.
 * Default is NOT_EXPOSED — an administrator must explicitly enable external access.
 */
export const AI_TOOL_PERMISSION_REGISTRY: Record<string, ToolPermissionDefinition> = {
  // ── Inventory ─────────────────────────────────────────────────────
  get_inventory_levels: {
    toolName: 'get_inventory_levels',
    requiredPermission: 'inventory.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read inventory stock levels for products and locations',
    category: 'inventory',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'inventory:read',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Filter by product ID' },
        locationId: { type: 'string', description: 'Filter by location ID' },
      },
    },
  },
  get_low_stock_products: {
    toolName: 'get_low_stock_products',
    requiredPermission: 'inventory.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read products below low-stock threshold',
    category: 'inventory',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'inventory:read',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Sales / Orders ────────────────────────────────────────────────
  get_sales_summary: {
    toolName: 'get_sales_summary',
    requiredPermission: 'reports.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read sales summary for a date range',
    category: 'sales',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'sales:read',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO date string (start of range)' },
        endDate: { type: 'string', description: 'ISO date string (end of range)' },
      },
    },
  },
  get_orders: {
    toolName: 'get_orders',
    requiredPermission: 'sales.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'List recent sales orders',
    category: 'sales',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'sales:read',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['DRAFT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'],
        },
        limit: { type: 'number', description: 'Max results (1-50)' },
      },
    },
  },

  // ── Finance ───────────────────────────────────────────────────────
  get_financial_summary: {
    toolName: 'get_financial_summary',
    requiredPermission: 'finance.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read financial summary for a period',
    category: 'finance',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'finance:read',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'ISO date string for month start' },
      },
    },
  },

  // ── Tasks ─────────────────────────────────────────────────────────
  get_tasks: {
    toolName: 'get_tasks',
    requiredPermission: 'tasks.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'List tasks for the organization',
    category: 'tasks',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'tasks:read',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by task status',
          enum: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
        },
        priority: {
          type: 'string',
          description: 'Filter by priority',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        },
        limit: { type: 'number', description: 'Max results (1-50)' },
      },
    },
  },
  create_task: {
    toolName: 'create_task',
    requiredPermission: 'tasks.create',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Create a new task',
    category: 'tasks',
    externalExposure: 'EXTERNAL_EXECUTION',
    requiredScope: 'tasks:write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: {
          type: 'string',
          description: 'Task priority',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
        },
        dueDate: { type: 'string', description: 'ISO date string for due date' },
      },
      required: ['title'],
    },
  },

  // ── Goals ─────────────────────────────────────────────────────────
  get_goals: {
    toolName: 'get_goals',
    requiredPermission: 'goals.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'List business goals and their progress',
    category: 'goals',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'goals:read',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by goal status',
          enum: ['ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED'],
        },
        limit: { type: 'number', description: 'Max results (1-20)' },
      },
    },
  },

  // ── Calendar ─────────────────────────────────────────────────────
  get_calendar_events: {
    toolName: 'get_calendar_events',
    requiredPermission: 'calendar.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'List upcoming calendar events',
    category: 'calendar',
    externalExposure: 'EXTERNAL_READ_ONLY',
    requiredScope: 'calendar:read',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO date string (range start, defaults to now)' },
        endDate: { type: 'string', description: 'ISO date string (range end, defaults to 7 days out)' },
        limit: { type: 'number', description: 'Max results (1-50)' },
      },
    },
  },

  // ── Purchasing ────────────────────────────────────────────────────
  create_purchase_order: {
    toolName: 'create_purchase_order',
    requiredPermission: 'purchasing.create',
    riskLevel: 'HIGH',
    approvalRequired: 'REQUIRED',
    description: 'Create a draft purchase order',
    category: 'purchasing',
    externalExposure: 'NOT_EXPOSED',
    inputSchema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string', description: 'Supplier ID' },
        locationId: { type: 'string', description: 'Receiving location ID' },
        items: {
          type: 'array',
          description: 'Line items',
          items: { type: 'object' },
        },
      },
      required: ['supplierId', 'locationId', 'items'],
    },
  },

  // ── Notifications ─────────────────────────────────────────────────
  send_notification: {
    toolName: 'send_notification',
    requiredPermission: 'notifications.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Send an in-app notification',
    category: 'communications',
    externalExposure: 'NOT_EXPOSED',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        body: { type: 'string', description: 'Notification body' },
        userId: { type: 'string', description: 'Target user ID (omit for org-wide)' },
        type: {
          type: 'string',
          description: 'Notification type',
          enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'ALERT'],
        },
      },
      required: ['title', 'body'],
    },
  },
};

/** Look up a tool's permission definition. Returns null if not registered — callers must DENY unregistered tools. */
export function getToolPermissionDefinition(toolName: string): ToolPermissionDefinition | null {
  return AI_TOOL_PERMISSION_REGISTRY[toolName] ?? null;
}

/** Return all tools with a given external exposure level. */
export function getExternallyExposedTools(exposure?: ExternalExposure): ToolPermissionDefinition[] {
  return Object.values(AI_TOOL_PERMISSION_REGISTRY).filter((t) =>
    exposure ? t.externalExposure === exposure : t.externalExposure !== 'NOT_EXPOSED',
  );
}
