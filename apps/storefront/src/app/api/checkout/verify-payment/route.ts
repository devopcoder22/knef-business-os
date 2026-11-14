import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

/** Asks the API to verify a Paystack payment with Paystack and confirm the order. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { reference?: unknown };
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    if (!reference || reference.length > 100) {
      return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });
    }

    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/payments/paystack/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ reference }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Could not check payment — please try again' }, { status: 503 });
  }
}
