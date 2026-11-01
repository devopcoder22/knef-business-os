import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } },
) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const res = await fetch(
      `${BACKEND}/api/v1/ecommerce/public/orders/${encodeURIComponent(params.reference)}?email=${encodeURIComponent(email)}`,
      { headers: { 'x-api-key': API_KEY }, cache: 'no-store' },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Order lookup failed' }, { status: 503 });
  }
}
