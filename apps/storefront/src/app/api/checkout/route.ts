import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';
const LOCATION_ID = process.env.STOREFRONT_ORG_LOCATION_ID ?? '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    if (!body.customerPhone || !body.customerName) {
      return NextResponse.json({ error: 'Customer name and phone are required' }, { status: 400 });
    }
    if (!body.paymentMethod) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 });
    }

    const locationId = (body.locationId as string | undefined) || LOCATION_ID;
    if (!locationId) {
      return NextResponse.json(
        { error: 'Store location not configured — contact support' },
        { status: 503 },
      );
    }

    const payload = { ...body, locationId };

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
