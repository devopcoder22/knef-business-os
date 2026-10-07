import { NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/categories`, {
      headers: { 'x-api-key': API_KEY },
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Categories unavailable' }, { status: 503 });
  }
}
