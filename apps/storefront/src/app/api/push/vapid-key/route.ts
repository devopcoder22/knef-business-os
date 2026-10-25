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
    const res = await fetch(`${BACKEND}/api/v1/communications/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch VAPID key' }, { status: 503 });
  }
}
