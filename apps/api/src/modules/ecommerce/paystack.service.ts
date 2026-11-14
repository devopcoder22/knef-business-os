import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../common/services/prisma.service';
import { CredentialService } from '../credentials/credential.service';

const PAYSTACK_API = 'https://api.paystack.co';
const TIMEOUT_MS = 15_000;

export type PaystackVerifyStatus = 'paid' | 'pending' | 'failed' | 'not_found';

interface PaystackVerifyData {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  paid_at?: string;
}

/**
 * Server-driven Paystack flow:
 *   1. initialize() — the server starts the transaction with a server-computed amount
 *      and a server-generated reference (stored as Payment.gatewayRef, unique per org).
 *   2. The browser completes payment in Paystack's popup using the access code.
 *   3. verifyAndConfirm() — called from the storefront after payment and from the
 *      signed webhook. It re-verifies with Paystack's API and only then marks the
 *      payment COMPLETED and the order CONFIRMED. Safe to call any number of times.
 */
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialService,
    private readonly events: EventEmitter2,
  ) {}

  async isConfigured(): Promise<boolean> {
    return !!(await this.credentials.resolve('PAYSTACK_SECRET_KEY'));
  }

  private async secretKey(): Promise<string> {
    const key = await this.credentials.resolve('PAYSTACK_SECRET_KEY');
    if (!key) throw new BadRequestException('Card payments are not configured on this store');
    return key;
  }

  async initialize(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ accessCode: string; authorizationUrl: string }> {
    const key = await this.secretKey();
    let res: Response;
    try {
      res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          amount: params.amountKobo,
          currency: 'NGN',
          reference: params.reference,
          ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
          metadata: params.metadata ?? {},
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Paystack initialize unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not reach the card payment provider. Please try again or choose another payment method.',
      );
    }

    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { access_code?: string; authorization_url?: string };
    };
    if (!res.ok || !json.status || !json.data?.access_code || !json.data.authorization_url) {
      this.logger.error(`Paystack initialize failed (${res.status}): ${json.message ?? 'no message'}`);
      throw new ServiceUnavailableException(
        'Card payment could not be started. Please try again or choose another payment method.',
      );
    }
    return { accessCode: json.data.access_code, authorizationUrl: json.data.authorization_url };
  }

  /**
   * Verifies a Paystack transaction by our gateway reference and, if it is fully paid in NGN,
   * completes the payment and confirms the order. Idempotent.
   *
   * organizationId is required for storefront calls. The webhook has no tenant context, so it
   * passes undefined and the payment row (looked up by our unique, server-generated reference)
   * supplies the organisation.
   */
  async verifyAndConfirm(
    gatewayRef: string,
    organizationId?: string,
  ): Promise<{ status: PaystackVerifyStatus; orderReference?: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { gatewayRef, method: 'PAYSTACK', ...(organizationId ? { organizationId } : {}) },
      include: {
        order: {
          select: {
            id: true,
            reference: true,
            organizationId: true,
            totalAmount: true,
            customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!payment || !payment.order) return { status: 'not_found' };

    const order = payment.order;
    if (payment.status === 'COMPLETED') return { status: 'paid', orderReference: order.reference };

    const key = await this.secretKey();
    let data: PaystackVerifyData | undefined;
    try {
      const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(gatewayRef)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: boolean; data?: PaystackVerifyData };
      data = json.status ? json.data : undefined;
    } catch (err) {
      this.logger.warn(`Paystack verify unreachable (ref=${gatewayRef}): ${(err as Error).message}`);
      return { status: 'pending', orderReference: order.reference };
    }

    if (!data) return { status: 'pending', orderReference: order.reference };
    if (data.status !== 'success') {
      return { status: data.status === 'failed' ? 'failed' : 'pending', orderReference: order.reference };
    }

    const expectedKobo = Math.round(Number(payment.amount) * 100);
    if (
      data.reference !== gatewayRef ||
      data.currency !== 'NGN' ||
      typeof data.amount !== 'number' ||
      data.amount < expectedKobo
    ) {
      this.logger.error(
        `Paystack payment mismatch (ref=${gatewayRef}): paid ${data.amount} ${data.currency}, expected ${expectedKobo} NGN`,
      );
      return { status: 'failed', orderReference: order.reference };
    }

    const newlyConfirmed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'FAILED'] } },
        data: {
          status: 'COMPLETED',
          receivedAt: new Date(),
          gatewayData: { channel: data!.channel ?? null, paidAt: data!.paid_at ?? null, amountKobo: data!.amount },
        },
      });
      if (updated.count === 0) return false; // another request confirmed it first
      await tx.salesOrder.updateMany({
        where: { id: order.id, organizationId: order.organizationId, status: OrderStatus.DRAFT },
        data: { status: OrderStatus.CONFIRMED },
      });
      return true;
    });

    if (newlyConfirmed) {
      this.logger.log(`Paystack payment confirmed for order ${order.reference} (ref=${gatewayRef})`);
      const c = order.customer;
      this.events.emit('storefront.order.created', {
        organizationId: order.organizationId,
        orderId: order.id,
        reference: order.reference,
        customerName: `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || 'Customer',
        customerEmail: c?.email ?? null,
        customerPhone: c?.phone ?? '',
        totalAmount: order.totalAmount.toString(),
      });
    }
    return { status: 'paid', orderReference: order.reference };
  }
}
