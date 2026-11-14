import { NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export const dynamic = 'force-dynamic';

/** Which online payment methods the store can accept right now. */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/payment-config`, {
      headers: { 'x-api-key': API_KEY },
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ success: true, data: { paystackEnabled: false } });
  }
}
