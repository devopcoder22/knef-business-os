import { z } from 'zod';

const WorkerConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENCRYPTION_KEY: z.string().length(64),
  BACKUP_DIR: z.string().default('/app/backups'),
  UPLOAD_DIR: z.string().default('/app/uploads'),
  // Email concurrency
  EMAIL_CONCURRENCY: z.coerce.number().default(5),
  // AI scheduled agents
  AI_AGENT_CONCURRENCY: z.coerce.number().default(2),
  AI_AGENT_POLL_INTERVAL_MS: z.coerce.number().default(60_000),
  // Campaign scheduler poll interval
  CAMPAIGN_POLL_INTERVAL_MS: z.coerce.number().default(60_000),
  // Calendar sync poll interval
  CALENDAR_POLL_INTERVAL_MS: z.coerce.number().default(300_000),
  // Daily backup cron (default: 2am)
  BACKUP_CRON_HOUR: z.coerce.number().default(2),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(7),
  // Calendar provider OAuth credentials (optional — calendar sync disabled if absent)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().default('common'),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function validateWorkerConfig(config: Record<string, unknown>): WorkerConfig {
  const result = WorkerConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid worker configuration:\n${errorMessages}`);
  }
  return result.data;
}

export default (): WorkerConfig => validateWorkerConfig(process.env as Record<string, unknown>);
