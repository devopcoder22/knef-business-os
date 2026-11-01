import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { EVENTS, QUEUES, JOB_TYPES, type TransactionalEmailJobData } from '@knef/constants';
import { QueueService } from '../../common/services/queue.service';

export interface PasswordResetRequestedEvent {
  userId: string;
  organizationId: string;
  email: string;
  firstName: string | null;
  token: string;
  expires: Date;
}

function buildResetEmail(firstName: string | null, resetUrl: string, expires: Date): string {
  const name = firstName ?? 'there';
  const expiryMin = Math.round((expires.getTime() - Date.now()) / 60_000);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 20px; background: #f4f4f4; font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 40px; }
    .logo { font-size: 22px; font-weight: bold; color: #1d4ed8; margin-bottom: 24px; }
    h2 { margin: 0 0 16px; font-size: 20px; }
    p { line-height: 1.6; margin: 0 0 16px; }
    .btn { display: inline-block; padding: 14px 28px; background: #1d4ed8; color: #ffffff;
           text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; }
    .expiry { font-size: 13px; color: #555; }
    .security { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb;
                font-size: 13px; color: #666; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">KNEF Business OS</div>
    <h2>Reset your password</h2>
    <p>Hi ${name},</p>
    <p>We received a request to reset the password for your KNEF Business OS account.
       Click the button below to choose a new password:</p>
    <p><a class="btn" href="${resetUrl}">Reset Password</a></p>
    <p class="expiry">This link expires in <strong>${expiryMin} minutes</strong>.</p>
    <div class="security">
      <p><strong>Didn't request this?</strong><br>
      If you didn't ask to reset your password, you can safely ignore this email.
      Your password will remain unchanged and your account is secure.</p>
      <p>For your security, never share this link with anyone — KNEF support will never ask for it.</p>
    </div>
  </div>
</body>
</html>`;
}

@Injectable()
export class AuthEventsListener {
  private readonly logger = new Logger(AuthEventsListener.name);

  constructor(
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent(EVENTS.USER.PASSWORD_RESET_REQUESTED)
  async onPasswordResetRequested(payload: PasswordResetRequestedEvent): Promise<void> {
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const resetUrl = `${appUrl}/reset-password?token=${payload.token}`;
    const html = buildResetEmail(payload.firstName, resetUrl, payload.expires);
    const expiryMin = Math.round((payload.expires.getTime() - Date.now()) / 60_000);

    const jobData: TransactionalEmailJobData = {
      organizationId: payload.organizationId,
      to: payload.email,
      subject: 'Reset your KNEF Business OS password',
      html,
      text: `Reset your KNEF Business OS password.\n\nVisit the link below to set a new password (expires in ${expiryMin} minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email — your password is unchanged.`,
    };

    try {
      await this.queue.enqueue<TransactionalEmailJobData>(
        QUEUES.EMAIL,
        JOB_TYPES.SEND_TRANSACTIONAL_EMAIL,
        jobData,
        { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
      );
      this.logger.log(`Password reset email queued for user ${payload.userId}`);
    } catch (err: unknown) {
      // Do NOT re-throw — anti-enumeration requires API response to remain unchanged
      // regardless of whether the email job was enqueued successfully.
      this.logger.error(
        `Failed to enqueue password reset email for user ${payload.userId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }
}
