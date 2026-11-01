import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } },
) {
  try {
    const authHeader = request.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const res = await fetch(
      `${BACKEND}/api/v1/storefront/orders/${encodeURIComponent(params.reference)}`,
      { headers: { Authorization: authHeader }, cache: 'no-store' },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Order unavailable' }, { status: 503 });
  }
}
