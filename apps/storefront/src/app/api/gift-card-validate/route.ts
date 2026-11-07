import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code: string };
    if (!body.code) {
      return NextResponse.json({ error: 'Gift card code is required' }, { status: 400 });
    }

    const res = await fetch(`${BACKEND}/api/v1/public/gift-cards/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ code: body.code }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to validate gift card' }, { status: 503 });
  }
}
