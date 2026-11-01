/**
 * Authoritative registry of automation action types.
 * Only action types listed here may appear in rule action arrays.
 * High-risk financial/credential actions are deliberately excluded.
 */

export type AutomationActionType =
  | 'SEND_NOTIFICATION'
  | 'SEND_EMAIL'
  | 'SEND_TELEGRAM'
  | 'CREATE_TASK'
  | 'GENERATE_REPORT'
  | 'REQUEST_AI_ANALYSIS';

export interface ActionDefinition {
  label: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
}

export const AUTOMATION_ACTIONS: Record<AutomationActionType, ActionDefinition> = {
  SEND_NOTIFICATION: {
    label: 'Send Notification',
    description: 'Send an in-app notification to a user or broadcast to the organization',
    requiredParams: ['title', 'message'],
    optionalParams: ['userId', 'type'],
  },
  SEND_EMAIL: {
    label: 'Send Email',
    description: 'Send a transactional email via the configured email provider',
    requiredParams: ['to', 'subject', 'body'],
    optionalParams: ['providerId'],
  },
  SEND_TELEGRAM: {
    label: 'Send Telegram Message',
    description: 'Send a message to the organization Telegram channel',
    requiredParams: ['message'],
    optionalParams: [],
  },
  CREATE_TASK: {
    label: 'Create Task',
    description: 'Create a new task record',
    requiredParams: ['title'],
    optionalParams: ['description', 'assigneeId', 'priority', 'dueDate'],
  },
  GENERATE_REPORT: {
    label: 'Generate Report',
    description: 'Queue a report generation job',
    requiredParams: ['reportType'],
    optionalParams: ['format', 'requestedBy'],
  },
  REQUEST_AI_ANALYSIS: {
    label: 'Request AI Analysis',
    description: 'Ask the AI agent to analyze data and produce a recommendation',
    requiredParams: ['prompt'],
    optionalParams: ['agentId'],
  },
};

export const VALID_ACTION_TYPES = new Set(Object.keys(AUTOMATION_ACTIONS)) as Set<AutomationActionType>;

export function isValidActionType(type: string): type is AutomationActionType {
  return VALID_ACTION_TYPES.has(type as AutomationActionType);
}

/**
 * Validate that required params are present for an action.
 * Returns a human-readable error string or null if valid.
 */
export function validateActionParams(
  type: AutomationActionType,
  params: Record<string, unknown>,
): string | null {
  const def = AUTOMATION_ACTIONS[type];
  const missing = def.requiredParams.filter((p) => !params[p]);
  if (missing.length > 0) {
    return `Action ${type} is missing required params: ${missing.join(', ')}`;
  }
  return null;
}
