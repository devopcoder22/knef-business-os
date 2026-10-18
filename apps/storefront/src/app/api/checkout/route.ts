import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/turnstile';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';
const LOCATION_ID = process.env.STOREFRONT_ORG_LOCATION_ID ?? '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { turnstileToken, ...bodyWithoutToken } = body;
    const bodyClean = bodyWithoutToken as Record<string, unknown>;

    const check = await verifyTurnstile(turnstileToken as string | undefined);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    if (!bodyClean.items || !Array.isArray(bodyClean.items) || bodyClean.items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    if (!bodyClean.customerPhone || !bodyClean.customerName) {
      return NextResponse.json({ error: 'Customer name and phone are required' }, { status: 400 });
    }
    if (!bodyClean.paymentMethod) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 });
    }

    const locationId = (bodyClean.locationId as string | undefined) || LOCATION_ID;
    if (!locationId) {
      return NextResponse.json(
        { error: 'Store location not configured — contact support' },
        { status: 503 },
      );
    }

    // Server-authoritative monetary fields — strip anything the client sends
    // that would influence pricing. The backend DTO also forbids these, but
    // we strip at the BFF edge so a tampered client can't even forward them.
    const {
      deliveryFee: _ignoredDeliveryFee,
      subtotal: _ignoredSubtotal,
      totalAmount: _ignoredTotalAmount,
      discountAmount: _ignoredDiscountAmount,
      taxAmount: _ignoredTaxAmount,
      ...sanitized
    } = bodyClean;
    void _ignoredDeliveryFee;
    void _ignoredSubtotal;
    void _ignoredTotalAmount;
    void _ignoredDiscountAmount;
    void _ignoredTaxAmount;

    const payload = { ...sanitized, locationId };

    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Checkout failed — please try again' }, { status: 503 });
  }
}
