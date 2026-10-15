import { NextResponse } from 'next/server';

const BACKEND = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/organization/branding`, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ name: 'KNEF Business OS', logoUrl: null });
    const json = await res.json();
    const data = json.data ?? json; // unwrap ResponseTransformInterceptor envelope
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ name: 'KNEF Business OS', logoUrl: null });
  }
}
