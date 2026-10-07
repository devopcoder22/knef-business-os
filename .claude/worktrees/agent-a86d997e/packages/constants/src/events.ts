export const EVENTS = {
  ORDER: {
    CREATED: 'order.created',
    CONFIRMED: 'order.confirmed',
    PROCESSING: 'order.processing',
    COMPLETED: 'order.completed',
    CANCELLED: 'order.cancelled',
    REFUNDED: 'order.refunded',
    PARTIAL_REFUND: 'order.partial_refund',
  },
  PAYMENT: {
    RECEIVED: 'payment.received',
    FAILED: 'payment.failed',
    REFUNDED: 'payment.refunded',
    PENDING: 'payment.pending',
  },
  INVOICE: {
    CREATED: 'invoice.created',
    PAID: 'invoice.paid',
    OVERDUE: 'invoice.overdue',
    CANCELLED: 'invoice.cancelled',
  },
  INVENTORY: {
    LOW: 'inventory.low',
    OUT_OF_STOCK: 'inventory.out_of_stock',
    UPDATED: 'inventory.updated',
    TRANSFERRED: 'inventory.transferred',
    ADJUSTED: 'inventory.adjusted',
    COUNT_COMPLETED: 'inventory.count_completed',
  },
  PURCHASE_ORDER: {
    CREATED: 'purchase_order.created',
    APPROVED: 'purchase_order.approved',
    RECEIVED: 'purchase_order.received',
    CANCELLED: 'purchase_order.cancelled',
  },
  CUSTOMER: {
    CREATED: 'customer.created',
    UPDATED: 'customer.updated',
  },
  STAFF: {
    CLOCKED_IN: 'staff.clocked_in',
    CLOCKED_OUT: 'staff.clocked_out',
  },
  TASK: {
    CREATED: 'task.created',
    ASSIGNED: 'task.assigned',
    COMPLETED: 'task.completed',
    OVERDUE: 'task.overdue',
  },
  AI: {
    ACTION_REQUESTED: 'ai.action_requested',
    ACTION_APPROVED: 'ai.action_approved',
    ACTION_REJECTED: 'ai.action_rejected',
    BUDGET_THRESHOLD: 'ai.budget_threshold',
  },
  USER: {
    CREATED: 'user.created',
    LOGIN: 'user.login',
    LOCKED: 'user.locked',
    PASSWORD_CHANGED: 'user.password_changed',
    PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  },
  SYSTEM: {
    BACKUP_COMPLETED: 'system.backup_completed',
    BACKUP_FAILED: 'system.backup_failed',
    ERROR: 'system.error',
  },
} as const;

type EventsType = typeof EVENTS;
type EventLeaves<T> = T extends string
  ? T
  : { [K in keyof T]: EventLeaves<T[K]> }[keyof T];

export type AppEvent = EventLeaves<EventsType>;
