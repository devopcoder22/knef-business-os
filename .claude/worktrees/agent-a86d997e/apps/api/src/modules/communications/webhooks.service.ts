import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';

interface DeliverParams {
  organizationId: string;
  event: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async deliver(params: DeliverParams): Promise<void> {
    const { organizationId, event, payload } = params;

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId, isActive: true },
    });

    const matchingEndpoints = endpoints.filter((ep) =>
      ep.events.includes(event) || ep.events.includes('*'),
    );

    const payloadString = JSON.stringify(payload);

    await Promise.allSettled(
      matchingEndpoints.map(async (endpoint) => {
        const deliveryId = createId();
        let status = 'failed';
        let responseCode: number | null = null;
        let responseBody: string | null = null;

        try {
          const signature = createHmac('sha256', endpoint.secretHash)
            .update(payloadString)
            .digest('hex');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-KNEF-Signature': `sha256=${signature}`,
              'X-KNEF-Event': event,
            },
            body: payloadString,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          responseCode = response.status;
          responseBody = await response.text().catch(() => null);
          status = response.ok ? 'delivered' : 'failed';

          await this.prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: {
              lastTriggeredAt: new Date(),
              failureCount: response.ok ? 0 : { increment: 1 },
            },
          });
        } catch {
          await this.prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: { failureCount: { increment: 1 } },
          });
        }

        await this.prisma.webhookDelivery.create({
          data: {
            id: deliveryId,
            endpointId: endpoint.id,
            event,
            payload: payload as Prisma.InputJsonValue,
            status,
            responseCode,
            responseBody,
            attempts: 1,
            deliveredAt: status === 'delivered' ? new Date() : null,
          },
        });
      }),
    );
  }
}
