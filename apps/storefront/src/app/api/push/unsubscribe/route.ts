import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function DELETE(request: NextRequest) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const { endpoint } = body as { endpoint?: unknown };
    if (typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }
    const res = await fetch(`${BACKEND}/api/v1/communications/push/unsubscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 503 });
  }
}
