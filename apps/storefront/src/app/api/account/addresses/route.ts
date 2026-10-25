import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function GET(request: NextRequest) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const res = await fetch(`${BACKEND}/api/v1/storefront/addresses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch addresses' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await request.json();
    // Strip any injected fields
    const { id: _id, createdAt: _c, updatedAt: _u, organizationId: _o, customerAccountId: _ca, ...safe } = body as Record<string, unknown>;
    void _id; void _c; void _u; void _o; void _ca;
    const res = await fetch(`${BACKEND}/api/v1/storefront/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(safe),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to create address' }, { status: 503 });
  }
}
