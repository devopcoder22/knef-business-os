import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization') ?? '';
    const res = await fetch(`${BACKEND}/api/v1/storefront/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
    });
    return NextResponse.json({ message: 'Logged out' }, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ message: 'Logged out' }, { status: 200 });
  }
}
