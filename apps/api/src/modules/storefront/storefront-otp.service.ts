import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '../../common/services/redis.service';
import { EmailService } from '../communications/email.service';
import { PrismaService } from '../../common/services/prisma.service';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

interface OtpRecord {
  code: string;
  attempts: number;
  verified: boolean;
}

@Injectable()
export class StorefrontOtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async requestEmailOtp(organizationId: string, emailAddress: string): Promise<void> {
    const code = this.generateCode();
    const key = `otp:email:${emailAddress.toLowerCase()}`;
    const record: OtpRecord = { code, attempts: 0, verified: false };
    await this.redis.setJson(key, record, OTP_TTL_SECONDS);

    const html = `<p>Your KNEF verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`;
    await this.email.sendEmail({
      organizationId,
      to: emailAddress,
      subject: 'Your KNEF Verification Code',
      html,
    });
  }

  async verifyEmailOtp(emailAddress: string, code: string): Promise<void> {
    const key = `otp:email:${emailAddress.toLowerCase()}`;
    const record = await this.redis.getJson<OtpRecord>(key);

    if (!record) {
      throw new BadRequestException('Code expired or not found');
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts');
    }

    if (record.code.toLowerCase() !== code.toLowerCase()) {
      record.attempts += 1;
      await this.redis.setJson(key, record, OTP_TTL_SECONDS);
      throw new BadRequestException('Invalid verification code');
    }

    record.verified = true;
    await this.redis.setJson(key, record, OTP_TTL_SECONDS);
  }

  async requestSmsOtp(organizationId: string, phone: string): Promise<void> {
    const code = this.generateCode();
    const key = `otp:sms:${phone}`;
    const record: OtpRecord = { code, attempts: 0, verified: false };
    await this.redis.setJson(key, record, OTP_TTL_SECONDS);

    const smsBody = `Your KNEF verification code: ${code}. Expires in 10 minutes.`;
    await this.email.sendSms(organizationId, phone, smsBody);
  }

  async verifySmsOtp(phone: string, code: string): Promise<void> {
    const key = `otp:sms:${phone}`;
    const record = await this.redis.getJson<OtpRecord>(key);

    if (!record) {
      throw new BadRequestException('Code expired or not found');
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts');
    }

    if (record.code.toLowerCase() !== code.toLowerCase()) {
      record.attempts += 1;
      await this.redis.setJson(key, record, OTP_TTL_SECONDS);
      throw new BadRequestException('Invalid verification code');
    }

    record.verified = true;
    await this.redis.setJson(key, record, OTP_TTL_SECONDS);
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
