import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function POST(request: NextRequest) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    // Only forward known safe fields — never forward organizationId or userId from client
    const { endpoint, p256dhKey, authKey, userAgent } = body as {
      endpoint?: unknown;
      p256dhKey?: unknown;
      authKey?: unknown;
      userAgent?: unknown;
    };
    if (typeof endpoint !== 'string' || typeof p256dhKey !== 'string' || typeof authKey !== 'string') {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }
    const res = await fetch(`${BACKEND}/api/v1/communications/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint, p256dhKey, authKey, userAgent: typeof userAgent === 'string' ? userAgent : undefined }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to register subscription' }, { status: 503 });
  }
}
