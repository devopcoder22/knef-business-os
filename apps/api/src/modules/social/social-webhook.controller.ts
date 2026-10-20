import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicationService } from './publication.service';
import * as crypto from 'crypto';

function verifyMetaSignature(body: string, signature: string): boolean {
  const secret = process.env.META_APP_SECRET ?? '';
  if (!secret || !signature) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function verifyTikTokSignature(
  body: string,
  timestamp: string,
  nonce: string,
  signature: string,
): boolean {
  const clientKey = process.env.TIKTOK_CLIENT_KEY ?? '';
  if (!clientKey) return false;
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  const expected = crypto
    .createHmac('sha256', clientKey)
    .update(message)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

@Public()
@Controller('social/webhooks')
export class SocialWebhookController {
  private readonly logger = new Logger(SocialWebhookController.name);

  constructor(private readonly publication: PublicationService) {}

  // ── Meta Webhook Verification (GET) ─────────────────────────────────────────
  @Get('meta/:organizationId')
  verifyMeta(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (
      mode === 'subscribe' &&
      verifyToken === (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '')
    ) {
      return parseInt(challenge, 10);
    }
    throw new BadRequestException('Webhook verification failed.');
  }

  // ── Meta Webhook Events (POST) ───────────────────────────────────────────────
  @Post('meta/:organizationId')
  @HttpCode(HttpStatus.OK)
  async metaWebhook(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-raw-body') rawBody: string,
  ) {
    if (!verifyMetaSignature(rawBody ?? JSON.stringify(body), signature)) {
      this.logger.warn(`Meta webhook signature mismatch for org ${organizationId}`);
      return { ok: true }; // return 200 to avoid Meta retries, log the failure
    }

    const payload = body as {
      object?: string;
      entry?: Array<{
        changes?: Array<{ value?: { post_id?: string; published?: boolean } }>;
      }>;
    };
    this.logger.log(
      `Meta webhook received for org ${organizationId}: ${payload.object}`,
    );
    // Meta media_publish webhooks carry post_id in entry[].changes[].value
    // We handle status via polling for now; webhook confirms final state
    return { ok: true };
  }

  // ── TikTok Webhook Events (POST) ─────────────────────────────────────────────
  @Post('tiktok/:organizationId')
  @HttpCode(HttpStatus.OK)
  async tiktokWebhook(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @Headers('x-tiktok-signature') signature: string,
    @Headers('x-tiktok-timestamp') timestamp: string,
    @Headers('x-tiktok-nonce') nonce: string,
    @Headers('x-raw-body') rawBody: string,
  ) {
    const bodyStr = rawBody ?? JSON.stringify(body);
    if (!verifyTikTokSignature(bodyStr, timestamp, nonce, signature)) {
      this.logger.warn(`TikTok webhook signature mismatch for org ${organizationId}`);
      return { ok: true };
    }

    // Replay protection: check timestamp freshness (5 minute window)
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      this.logger.warn(`TikTok webhook timestamp too old: ${timestamp}`);
      return { ok: true };
    }

    const payload = body as {
      event?: string;
      data?: { publish_id?: string; video_id?: string };
      event_id?: string;
    };

    if (!payload.event || !payload.data?.publish_id) return { ok: true };

    const succeeded = payload.event === 'post.publish.complete';
    await this.publication.handleWebhookEvent(
      organizationId,
      'TIKTOK',
      payload.event_id ?? `${payload.data.publish_id}:${payload.event}`,
      payload.data.publish_id,
      succeeded,
      payload.data.video_id,
    );

    return { ok: true };
  }
}
