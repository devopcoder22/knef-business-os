export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApprovalRequirement = 'NONE' | 'SOFT' | 'REQUIRED';

export interface ToolPermissionDefinition {
  /** The exact tool name as stored in AITool.name */
  toolName: string;
  /** The permission string the calling user must have */
  requiredPermission: string;
  /** Risk classification — HIGH and CRITICAL always require approval */
  riskLevel: ToolRiskLevel;
  /** Whether this tool requires human approval before executing */
  approvalRequired: ApprovalRequirement;
  /** Human-readable description for audit logs */
  description: string;
}

/**
 * Authoritative permission registry for all AI-executable tools.
 * Every tool that can be invoked by AI MUST be listed here.
 * Tools not listed here are DENIED by default.
 */
export const AI_TOOL_PERMISSION_REGISTRY: Record<string, ToolPermissionDefinition> = {
  get_inventory_levels: {
    toolName: 'get_inventory_levels',
    requiredPermission: 'inventory.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read inventory stock levels for products and locations',
  },
  get_sales_summary: {
    toolName: 'get_sales_summary',
    requiredPermission: 'reports.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read sales summary for a date range',
  },
  get_low_stock_products: {
    toolName: 'get_low_stock_products',
    requiredPermission: 'inventory.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read products below low-stock threshold',
  },
  create_purchase_order: {
    toolName: 'create_purchase_order',
    requiredPermission: 'purchasing.create',
    riskLevel: 'HIGH',
    approvalRequired: 'REQUIRED',
    description: 'Create a draft purchase order',
  },
  send_notification: {
    toolName: 'send_notification',
    requiredPermission: 'notifications.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Send an in-app notification',
  },
  get_financial_summary: {
    toolName: 'get_financial_summary',
    requiredPermission: 'finance.view',
    riskLevel: 'LOW',
    approvalRequired: 'NONE',
    description: 'Read financial summary for a period',
  },
};

/**
 * Look up a tool's permission definition.
 * Returns null if the tool is not registered — callers must DENY unregistered tools.
 */
export function getToolPermissionDefinition(toolName: string): ToolPermissionDefinition | null {
  return AI_TOOL_PERMISSION_REGISTRY[toolName] ?? null;
}
