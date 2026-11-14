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
import { Public } from '../../common/decorators/public.decorator';
import { CredentialService } from '../credentials/credential.service';
import { PaystackService } from './paystack.service';

function signatureMatches(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha512', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

@Controller('webhooks/paystack')
@Public()
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(
    private readonly credentialService: CredentialService,
    private readonly paystack: PaystackService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Paystack signs webhooks with the account's secret key (HMAC-SHA512 of the raw body).
    // PAYSTACK_WEBHOOK_SECRET is accepted as an alternative for existing configurations.
    const secrets = [
      await this.credentialService.resolve('PAYSTACK_SECRET_KEY'),
      await this.credentialService.resolve('PAYSTACK_WEBHOOK_SECRET'),
    ].filter((s): s is string => !!s);

    if (secrets.length === 0) {
      this.logger.error('Paystack webhook received but no Paystack secret is configured — ignoring');
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const rawBody: Buffer | string | undefined = (req as Request & { rawBody?: Buffer | string }).rawBody;
    if (!rawBody) {
      // Without the exact raw bytes the signature cannot be checked — fail closed.
      this.logger.error('Paystack webhook: raw body unavailable, cannot verify signature');
      res.status(400).json({ error: 'Raw body unavailable' });
      return;
    }
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    if (!signature || !secrets.some((s) => signatureMatches(bodyStr, signature, s))) {
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

    this.logger.log(`Paystack webhook received: ${event.event}`);

    if (event.event === 'charge.success') {
      const reference = event.data?.['reference'];
      if (typeof reference === 'string' && reference) {
        // Never trust the webhook body for amounts: re-verify with Paystack's API.
        try {
          const result = await this.paystack.verifyAndConfirm(reference);
          this.logger.log(`Paystack webhook ref=${reference} → ${result.status}`);
        } catch (err) {
          this.logger.error(`Paystack webhook confirm failed (ref=${reference}): ${(err as Error).message}`);
          res.status(500).json({ error: 'Processing failed' }); // Paystack will retry
          return;
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  }
}
