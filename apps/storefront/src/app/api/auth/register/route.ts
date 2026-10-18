import { NextRequest, NextResponse } from 'next/server';
import { verifyTurnstile } from '@/lib/turnstile';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const { turnstileToken, ...rest } = body;

    const check = await verifyTurnstile(turnstileToken as string | undefined);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    const res = await fetch(`${BACKEND}/api/v1/storefront/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Registration failed' }, { status: 503 });
  }
}
