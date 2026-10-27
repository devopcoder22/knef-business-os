import {
  Controller,
  Post,
  Param,
  Headers,
  Req,
  Res,
  HttpCode,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { PrismaService } from '../../common/services/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';

const PRIVATE_IP_PATTERN = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)/i;

function isValidShopDomain(domain: string): boolean {
  // Must be *.myshopify.com or configured domain; block private IPs
  if (PRIVATE_IP_PATTERN.test(domain)) return false;
  return /^[a-z0-9\-]+\.myshopify\.com$/i.test(domain) || /^[a-z0-9\-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(domain);
}

@Controller('shopify/webhooks')
@Public()
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly webhookService: ShopifyWebhookService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Post(':shopDomain')
  @HttpCode(200)
  async receive(
    @Param('shopDomain') shopDomain: string,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-webhook-id') deliveryId: string,
    @Headers('x-shopify-event-id') eventId: string,
    @Headers('x-shopify-topic') topic: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Validate domain format (SSRF protection)
    if (!isValidShopDomain(shopDomain)) {
      this.logger.warn(`Rejected webhook from invalid shopDomain: ${shopDomain}`);
      res.status(401).json({ error: 'Invalid shop domain' });
      return;
    }

    if (!hmac || !deliveryId || !topic) {
      res.status(401).json({ error: 'Missing required headers' });
      return;
    }

    // Find connection by shopDomain in metadata
    const conn = await this.prisma.externalConnection.findFirst({
      where: {
        provider: 'shopify',
        status: { not: 'disconnected' },
      },
    });

    if (!conn) {
      this.logger.warn(`No Shopify connection found for shopDomain: ${shopDomain}`);
      // Return 200 to avoid Shopify retries for unlinked domains
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Validate shopDomain against connection metadata
    const connMeta = conn.metadata as Record<string, unknown> | null;
    const connDomain = connMeta?.['domain'] as string | undefined;
    if (connDomain && connDomain !== shopDomain) {
      this.logger.warn(`shopDomain mismatch: expected ${connDomain}, got ${shopDomain}`);
      res.status(401).json({ error: 'Domain mismatch' });
      return;
    }

    // Get client secret
    const clientSecret = this.config.get('SHOPIFY_CLIENT_SECRET');
    if (!clientSecret) {
      this.logger.error('SHOPIFY_CLIENT_SECRET not configured');
      res.status(500).json({ error: 'Server misconfiguration' });
      return;
    }

    // Raw body for HMAC verification — use req.rawBody if available, else req body buffer
    const rawBody: Buffer | string =
      (req as Request & { rawBody?: Buffer | string }).rawBody ??
      JSON.stringify(req.body);

    // Verify HMAC
    const signatureValid = this.webhookService.verifySignature(rawBody, hmac, clientSecret);
    if (!signatureValid) {
      this.logger.warn(`Invalid Shopify webhook HMAC for deliveryId ${deliveryId}`);
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Dedup check
    const existing = await this.prisma.shopifyWebhookEvent.findUnique({
      where: { shopifyDeliveryId: deliveryId },
    });
    if (existing) {
      this.logger.debug(`Duplicate webhook deliveryId ${deliveryId} — returning 200`);
      res.status(200).json({ status: 'duplicate' });
      return;
    }

    // Store event
    const webhookEventId = await this.webhookService.storeWebhookEvent(
      conn.organizationId,
      conn.id,
      deliveryId,
      eventId ?? null,
      topic,
      shopDomain,
    );

    // Parse payload for immediate processing
    let payload: Record<string, unknown> = {};
    try {
      const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      payload = JSON.parse(bodyStr) as Record<string, unknown>;
    } catch {
      // Non-JSON or empty body — use topic-based routing
    }

    // Enqueue async processing (non-blocking)
    this.webhookService
      .processWebhookWithPayload(conn.organizationId, conn.id, topic, webhookEventId, payload)
      .catch(err => {
        this.logger.warn(`Webhook processing failed for ${deliveryId}: ${err instanceof Error ? err.message : err}`);
        this.webhookService.enqueueWebhookProcessing(webhookEventId, conn.organizationId, conn.id, topic).catch(() => void 0);
      });

    res.status(200).json({ status: 'queued' });
  }
}
