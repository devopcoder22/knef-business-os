import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const res = await fetch(
      `${BACKEND}/api/v1/ecommerce/public/products?${searchParams.toString()}`,
      {
        headers: { 'x-api-key': API_KEY },
        next: { revalidate: 30 }, // safe 30s cache — availability refreshes client-side
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Catalog unavailable' }, { status: 503 });
  }
}
