import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/turnstile';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';
const LOCATION_ID = process.env.STOREFRONT_ORG_LOCATION_ID ?? '';

/** Public origin of the storefront (behind Caddy), e.g. https://knefgadgets.com */
function publicOrigin(request: NextRequest): string {
  const configured = process.env.STOREFRONT_PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto.split(',')[0].trim()}://${host}`;
}

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
    if (bodyClean.paymentMethod !== 'CASH' && bodyClean.paymentMethod !== 'PAYSTACK') {
      return NextResponse.json({ error: 'Please choose a payment method' }, { status: 400 });
    }
    if (bodyClean.termsAccepted !== true) {
      return NextResponse.json({ error: 'Please accept the Terms and Conditions to place your order' }, { status: 400 });
    }

    // Storefront checkout requires an account: either signed in (token verified by the API)
    // or creating one with this order.
    const auth = request.headers.get('authorization');
    const signedIn = !!auth?.startsWith('Bearer ');
    if (!signedIn) {
      const password = typeof bodyClean.accountPassword === 'string' ? bodyClean.accountPassword : '';
      if (bodyClean.createAccount !== true || password.length < 8) {
        return NextResponse.json(
          { error: 'Please create a password (at least 8 characters) for your account to check out' },
          { status: 400 },
        );
      }
      if (bodyClean.accountPasswordConfirm !== password) {
        return NextResponse.json({ error: 'Your passwords do not match' }, { status: 400 });
      }
    }

    const locationId = (bodyClean.locationId as string | undefined) || LOCATION_ID;
    if (!locationId) {
      return NextResponse.json(
        { error: 'Store location not configured — contact support' },
        { status: 503 },
      );
    }

    // Server-authoritative monetary fields — strip anything the client sends
    // that would influence pricing. couponCode and giftCardCode are allowed
    // through so the backend can validate and apply them server-side.
    // Identity and redirect targets are also server-controlled: the linked account comes
    // from the customer's access token, and the Paystack return URL is set here.
    const {
      deliveryFee: _ignoredDeliveryFee,
      subtotal: _ignoredSubtotal,
      totalAmount: _ignoredTotalAmount,
      discountAmount: _ignoredDiscountAmount,
      taxAmount: _ignoredTaxAmount,
      customerAccountId: _ignoredCustomerAccountId,
      paystackCallbackUrl: _ignoredCallbackUrl,
      paystackReference: _ignoredPaystackReference,
      termsAccepted: _termsAccepted,
      accountPasswordConfirm: _passwordConfirm,
      ...sanitized
    } = bodyClean;
    void _termsAccepted;
    void _passwordConfirm;
    void _ignoredDeliveryFee;
    void _ignoredSubtotal;
    void _ignoredTotalAmount;
    void _ignoredDiscountAmount;
    void _ignoredTaxAmount;
    void _ignoredCustomerAccountId;
    void _ignoredCallbackUrl;
    void _ignoredPaystackReference;

    const payload: Record<string, unknown> = { ...sanitized, locationId };
    if (payload.paymentMethod === 'PAYSTACK') {
      payload.paystackCallbackUrl = `${publicOrigin(request)}/checkout/payment-return`;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': API_KEY };
    if (signedIn && auth) headers.Authorization = auth; // verified by the API

    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Checkout failed — please try again' }, { status: 503 });
  }
}
