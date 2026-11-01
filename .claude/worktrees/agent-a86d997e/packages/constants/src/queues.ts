export const QUEUES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  AI_AGENT: 'ai-agent',
  REPORTS: 'reports',
  DOCUMENTS: 'documents',
  BACKUP: 'backup',
  CALENDAR: 'calendar',
  AUTOMATION: 'automation',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOB_TYPES = {
  // email queue
  SEND_CAMPAIGN_EMAIL: 'send-campaign-email',
  SEND_TRANSACTIONAL_EMAIL: 'send-transactional-email',
  // notifications queue
  SEND_NOTIFICATION: 'send-notification',
  // ai-agent queue
  RUN_SCHEDULED_AGENT: 'run-scheduled-agent',
  // reports queue
  GENERATE_REPORT: 'generate-report',
  // documents queue
  INGEST_DOCUMENT: 'ingest-document',
  // backup queue
  RUN_BACKUP: 'run-backup',
  // calendar queue
  SYNC_CALENDAR: 'sync-calendar',
  // automation queue
  AUTOMATION_EXECUTE: 'automation-execute',
} as const;

// ── Job payload types ─────────────────────────────────────────────────────────

export interface CampaignEmailJobData {
  campaignId: string;
  recipientId: string;
  organizationId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  providerId?: string;
}

export interface TransactionalEmailJobData {
  organizationId: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  providerId?: string;
}

export interface NotificationJobData {
  organizationId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduledAgentJobData {
  agentId: string;
  organizationId: string;
}

export interface GenerateReportJobData {
  organizationId: string;
  reportType: string;
  params: Record<string, unknown>;
  requestedBy: string;
}

export interface IngestDocumentJobData {
  organizationId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RunBackupJobData {
  triggeredBy: 'scheduler' | 'manual';
  organizationId?: string;
}

export interface SyncCalendarJobData {
  connectionId: string;
  organizationId: string;
  userId: string;
  provider: string;
}

export interface AutomationExecuteJobData {
  executionId: string;
  ruleId: string;
  organizationId: string;
  eventId: string;
  eventType: string;
  locationId: string | null;
  actionType: string;
  actionIndex: number;
  actionParams: Record<string, unknown>;
  eventData: Record<string, unknown>;
  automationDepth: number;
  causationId: string | null;
}
