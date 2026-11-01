import { z } from 'zod';

const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex = 64 chars
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().default('noreply@knefgadgets.com'),
  SMTP_FROM_NAME: z.string().default('KNEF Gadgets'),
  UNSUBSCRIBE_SECRET: z.string().min(32).optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = AppConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `  ${field}: ${(msgs ?? []).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errorMessages}`);
  }
  return result.data;
}

export default (): AppConfig => validateConfig(process.env as Record<string, unknown>);
