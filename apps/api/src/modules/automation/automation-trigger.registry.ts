/**
 * Authoritative registry of automation triggers.
 * Only events listed here may be used as rule triggers.
 * Populated from events actually emitted by the KNEF codebase.
 */
export interface TriggerDefinition {
  label: string;
  description: string;
  fields: string[];
}

export const AUTOMATION_TRIGGERS: Record<string, TriggerDefinition> = {
  // ── Inventory ──────────────────────────────────────────────────────────────
  'inventory.low': {
    label: 'Inventory Low',
    description: 'A product quantity has dropped below its alert threshold',
    fields: ['productId', 'productName', 'sku', 'quantity', 'threshold', 'locationId'],
  },
  'inventory.out_of_stock': {
    label: 'Inventory Out of Stock',
    description: 'A product has reached zero stock',
    fields: ['productId', 'productName', 'sku', 'locationId'],
  },
  'inventory.updated': {
    label: 'Inventory Updated',
    description: 'An inventory level was adjusted or transferred',
    fields: ['productId', 'productName', 'sku', 'quantity', 'delta', 'locationId', 'movementType'],
  },

  // ── Sales / Orders ─────────────────────────────────────────────────────────
  'order.created': {
    label: 'Order Created',
    description: 'A new sales order was created',
    fields: ['orderId', 'reference', 'customerId', 'totalAmount', 'locationId', 'channel'],
  },
  'order.completed': {
    label: 'Order Completed',
    description: 'A sales order was marked as completed',
    fields: ['orderId', 'reference', 'customerId', 'totalAmount', 'locationId'],
  },
  'order.cancelled': {
    label: 'Order Cancelled',
    description: 'A sales order was cancelled',
    fields: ['orderId', 'reference', 'customerId', 'totalAmount', 'locationId', 'reason'],
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  'payment.received': {
    label: 'Payment Received',
    description: 'A payment was successfully recorded',
    fields: ['paymentId', 'orderId', 'amount', 'method', 'customerId'],
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  'invoice.created': {
    label: 'Invoice Created',
    description: 'A new invoice was generated',
    fields: ['invoiceId', 'reference', 'customerId', 'totalAmount', 'dueDate'],
  },
  'invoice.paid': {
    label: 'Invoice Paid',
    description: 'An invoice was marked as paid',
    fields: ['invoiceId', 'reference', 'customerId', 'totalAmount'],
  },

  // ── Purchasing ─────────────────────────────────────────────────────────────
  'purchase_order.created': {
    label: 'Purchase Order Created',
    description: 'A new purchase order was created',
    fields: ['purchaseOrderId', 'reference', 'supplierId', 'totalAmount', 'locationId'],
  },
  'purchase_order.approved': {
    label: 'Purchase Order Approved',
    description: 'A purchase order was approved',
    fields: ['purchaseOrderId', 'reference', 'supplierId', 'totalAmount', 'locationId'],
  },

  // ── Customers ──────────────────────────────────────────────────────────────
  'customer.created': {
    label: 'Customer Created',
    description: 'A new customer record was added',
    fields: ['customerId', 'firstName', 'lastName', 'email', 'phone'],
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  'task.created': {
    label: 'Task Created',
    description: 'A new task was created',
    fields: ['taskId', 'title', 'priority', 'assigneeId', 'creatorId', 'dueDate'],
  },
  'task.completed': {
    label: 'Task Completed',
    description: 'A task was marked as complete',
    fields: ['taskId', 'title', 'priority', 'assigneeId', 'completedAt'],
  },

  // ── Goals ──────────────────────────────────────────────────────────────────
  'goal.reached': {
    label: 'Goal Reached',
    description: 'A goal has been achieved',
    fields: ['goalId', 'title', 'targetValue', 'currentValue'],
  },

  // ── Staff ──────────────────────────────────────────────────────────────────
  'staff.clocked_in': {
    label: 'Staff Clocked In',
    description: 'An employee clocked in',
    fields: ['employeeId', 'locationId', 'clockInTime'],
  },
  'staff.clocked_out': {
    label: 'Staff Clocked Out',
    description: 'An employee clocked out',
    fields: ['employeeId', 'locationId', 'clockOutTime', 'hoursWorked'],
  },
} as const;

export const VALID_TRIGGER_STRINGS = new Set(Object.keys(AUTOMATION_TRIGGERS));

export function isValidTrigger(trigger: string): boolean {
  return VALID_TRIGGER_STRINGS.has(trigger);
}
