export const QUEUES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  AI_AGENT: 'ai-agent',
  REPORTS: 'reports',
  DOCUMENTS: 'documents',
  BACKUP: 'backup',
  CALENDAR: 'calendar',
  AUTOMATION: 'automation',
  INTEGRATIONS: 'integrations',
  MARKETING: 'marketing',
  ADVERTISING: 'advertising',
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
  // integrations queue
  INTEGRATION_REFRESH_TOKENS: 'integration-refresh-tokens',
  INTEGRATION_HEALTH_CHECK: 'integration-health-check',
  INTEGRATION_SYNC: 'integration-sync',
  // notifications queue (additional types)
  SEND_SMS: 'send-sms',
  SEND_PUSH: 'send-push',
  SEND_WHATSAPP: 'send-whatsapp',
  // marketing queue
  MARKETING_SCHEDULE_CHECK: 'marketing-schedule-check',
  MARKETING_AUDIENCE_RESOLVE: 'marketing-audience-resolve',
  // social publishing queue (Stage 24E)
  SOCIAL_PUBLISH: 'social-publish',
  SOCIAL_STATUS_CHECK: 'social-status-check',
  // advertising queue (Stage 24F)
  ADVERTISING_ACCOUNT_SYNC: 'advertising-account-sync',
  ADVERTISING_CAMPAIGN_SYNC: 'advertising-campaign-sync',
  ADVERTISING_METRICS_SYNC: 'advertising-metrics-sync',
  ADVERTISING_ACTION_SUBMIT: 'advertising-action-submit',
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

export interface IntegrationRefreshTokensJobData {
  connectionId: string;
  organizationId: string;
  provider: string;
}

export interface IntegrationHealthCheckJobData {
  connectionId: string;
  organizationId: string;
  provider: string;
}

export interface IntegrationSyncJobData {
  connectionId: string;
  organizationId: string;
  provider: string;
  jobType: string;
  metadata?: Record<string, unknown>;
}

export interface SmsSendJobData {
  organizationId: string;
  to: string;
  message: string;
  messageType: 'TRANSACTIONAL' | 'MARKETING';
  providerId?: string;
  senderId?: string;
  logId?: string;
  idempotencyKey?: string;
}

export interface PushSendJobData {
  organizationId: string;
  userId: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  logId?: string;
  idempotencyKey?: string;
}

export interface WhatsAppSendJobData {
  organizationId: string;
  to: string;
  message: string;
  messageType: 'TRANSACTIONAL' | 'MARKETING';
  templateName?: string;
  logId?: string;
  idempotencyKey?: string;
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

export interface MarketingScheduleCheckJobData {
  organizationId: string;
}

export interface MarketingAudienceResolveJobData {
  organizationId: string;
  campaignId: string;
  segmentId: string;
  channel: string;
}

export interface SocialPublishJobData {
  attemptId: string;
  organizationId: string;
  draftId: string;
  socialAccountId: string;
  provider: string;
}

export interface SocialStatusCheckJobData {
  attemptId: string;
  organizationId: string;
  provider: string;
  providerPublishId: string;
  socialAccountId: string;
}

export interface AdvertisingAccountSyncJobData {
  organizationId: string;
  advertisingAccountId: string;
  provider: string;
}

export interface AdvertisingCampaignSyncJobData {
  organizationId: string;
  advertisingAccountId: string;
  provider: string;
}

export interface AdvertisingMetricsSyncJobData {
  organizationId: string;
  advertisingAccountId: string;
  provider: string;
  fromDate: string;
  toDate: string;
}

export interface AdvertisingActionSubmitJobData {
  organizationId: string;
  actionId: string;
}
