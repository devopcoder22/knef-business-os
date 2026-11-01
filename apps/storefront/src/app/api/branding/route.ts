import { NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/organization/branding`, { next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json({ name: 'KNEF Gadgets', logoUrl: null, faviconUrl: null });
    const json = await res.json();
    const data = json.data ?? json;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ name: 'KNEF Gadgets', logoUrl: null, faviconUrl: null });
  }
}
