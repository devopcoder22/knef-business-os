import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppMessageService } from './whatsapp-message.service';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';

interface MetaWebhookVerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; message: string }>;
        }>;
      };
      field?: string;
    }>;
  }>;
}

@Controller('public/whatsapp')
@Public()
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly configService: WhatsAppConfigService,
    private readonly messageService: WhatsAppMessageService,
    private readonly metaProvider: MetaWhatsAppProvider,
  ) {}

  // Meta webhook verification challenge
  @Get('webhook')
  async verifyWebhook(
    @Query() query: MetaWebhookVerifyQuery,
    @Res() res: Response,
  ): Promise<void> {
    const mode = query['hub.mode'];
    const verifyToken = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode !== 'subscribe' || !verifyToken || !challenge) {
      res.status(HttpStatus.FORBIDDEN).send('Invalid verification request');
      return;
    }

    // Attempt to find org by verify token (search all active configs)
    const config = await this.configService.findByVerifyToken(verifyToken);
    if (!config) {
      res.status(HttpStatus.FORBIDDEN).send('Unknown verify token');
      return;
    }

    await this.configService.markWebhookVerified(config.organizationId);
    this.logger.log(`Webhook verified for org ${config.organizationId}`);
    res.status(HttpStatus.OK).send(challenge);
  }

  // Incoming messages and delivery status events
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Req() req: Request,
    @Headers('x-hub-signature-256') signature: string,
    @Body() body: MetaWebhookPayload,
  ): Promise<{ status: string }> {
    if (body.object !== 'whatsapp_business_account') {
      return { status: 'ignored' };
    }

    for (const entry of body.entry ?? []) {
      const wabaId = entry.id;

      // Resolve org by wabaId
      const config = await this.configService.findByWabaId(wabaId);
      if (!config) continue;

      // Verify HMAC-SHA256 signature if app secret is configured.
      // NOTE: req.rawBody is only available when the Express app is initialised with
      // the `rawBody: true` option (NestJS >= 9 supports this via NestFactory.create).
      // Until that option is enabled we fall back to re-serialising the parsed body,
      // which is functionally equivalent for well-formed Meta payloads but loses
      // key ordering — enable rawBody for production-grade verification.
      const appSecret = await this.configService.resolveAppSecret(config.organizationId);
      if (appSecret) {
        const rawBody =
          (req as Request & { rawBody?: Buffer | string }).rawBody != null
            ? String((req as Request & { rawBody?: Buffer | string }).rawBody)
            : JSON.stringify(body);
        const isValid = this.metaProvider.verifyWebhookSignature(
          rawBody,
          signature ?? '',
          appSecret,
        );
        if (!isValid) {
          this.logger.warn(`Invalid webhook signature for org ${config.organizationId}`);
          continue;
        }
      }

      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value || change.field !== 'messages') continue;

        const phoneNumberId =
          value.metadata?.phone_number_id ?? config.phoneNumberId;

        // Process inbound messages
        for (const msg of value.messages ?? []) {
          await this.messageService
            .processInboundMessage(config.organizationId, wabaId, msg, phoneNumberId)
            .catch((err: Error) =>
              this.logger.warn(`Error processing inbound: ${err.message}`),
            );
        }

        // Process delivery / read status updates
        for (const status of value.statuses ?? []) {
          await this.messageService
            .updateMessageStatus(config.organizationId, status)
            .catch((err: Error) =>
              this.logger.warn(`Error updating status: ${err.message}`),
            );
        }
      }
    }

    return { status: 'ok' };
  }
}
