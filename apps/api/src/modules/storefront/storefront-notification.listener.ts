import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '../communications/email.service';
import { PrismaService } from '../../common/services/prisma.service';

interface OrderCreatedPayload {
  organizationId: string;
  orderId: string;
  reference: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  totalAmount: string;
}

function buildOrderConfirmationEmail(payload: {
  customerName: string;
  reference: string;
  totalAmount: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
  <h2 style="color:#1d4ed8">Order Confirmed!</h2>
  <p>Hi ${payload.customerName},</p>
  <p>Thank you for your order. We've received it and it's being processed.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Order Reference</td><td style="padding:8px">${payload.reference}</td></tr>
    <tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Total Amount</td><td style="padding:8px">&#8358;${Number(payload.totalAmount).toLocaleString()}</td></tr>
  </table>
  <p>You can track your order at any time using your reference number and email address.</p>
  <p style="color:#6b7280;font-size:12px">KNEF Gadgets &bull; Thank you for shopping with us</p>
</body>
</html>`;
}

@Injectable()
export class StorefrontNotificationListener {
  private readonly logger = new Logger(StorefrontNotificationListener.name);

  constructor(
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('storefront.order.created')
  async onOrderCreated(payload: OrderCreatedPayload) {
    // Send email confirmation if email provided
    if (payload.customerEmail) {
      const html = buildOrderConfirmationEmail(payload);
      await this.email
        .sendEmail({
          organizationId: payload.organizationId,
          to: payload.customerEmail,
          subject: `Order Confirmed — ${payload.reference}`,
          html,
        })
        .catch((err) => this.logger.warn('Email send failed:', err));
    }

    // Send SMS confirmation
    const smsBody = `Hi ${payload.customerName.split(' ')[0]}, your KNEF order ${payload.reference} has been confirmed. Total: NGN ${Number(payload.totalAmount).toLocaleString()}. Track at /order`;
    await this.email
      .sendSms(payload.organizationId, payload.customerPhone, smsBody)
      .catch((err) => this.logger.warn('SMS send failed:', err));
  }
}
