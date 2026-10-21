import { NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/testimonials`, {
      headers: { 'x-api-key': API_KEY },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
