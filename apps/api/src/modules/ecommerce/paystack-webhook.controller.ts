import {
  Controller,
  Post,
  Headers,
  Req,
  Res,
  HttpCode,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/services/prisma.service';
import type { AppConfig } from '../../config/app.config';

@Controller('webhooks/paystack')
@Public()
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const secret = this.config.get('PAYSTACK_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET not configured');
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const rawBody: Buffer | string =
      (req as Request & { rawBody?: Buffer | string }).rawBody ??
      JSON.stringify(req.body);

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const expected = createHmac('sha512', secret).update(bodyStr).digest('hex');

    let signatureValid = false;
    try {
      signatureValid = timingSafeEqual(Buffer.from(signature ?? ''), Buffer.from(expected));
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      this.logger.warn('Invalid Paystack webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let event: { event?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(bodyStr) as typeof event;
    } catch {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const eventType = event.event;
    const data = event.data ?? {};

    this.logger.log(`Paystack webhook received: ${eventType}`);

    if (eventType === 'charge.success') {
      const reference = data['reference'] as string | undefined;
      if (reference) {
        await this.prisma.payment.updateMany({
          where: { gatewayRef: reference, status: 'PENDING' },
          data: { status: 'COMPLETED', receivedAt: new Date() },
        }).catch(err => {
          this.logger.warn(`Paystack charge.success update failed (ref=${reference}): ${(err as Error).message}`);
        });
      }
    } else if (eventType === 'charge.failed') {
      const reference = data['reference'] as string | undefined;
      if (reference) {
        await this.prisma.payment.updateMany({
          where: { gatewayRef: reference, status: 'PENDING' },
          data: { status: 'FAILED' },
        }).catch(err => {
          this.logger.warn(`Paystack charge.failed update failed (ref=${reference}): ${(err as Error).message}`);
        });
      }
    }

    res.status(200).json({ status: 'ok' });
  }
}
