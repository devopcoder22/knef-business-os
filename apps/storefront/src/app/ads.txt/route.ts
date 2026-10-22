import { NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';
const API_KEY = process.env.STOREFRONT_API_KEY ?? '';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/v1/ecommerce/public/settings`, {
      headers: { 'x-api-key': API_KEY },
      next: { revalidate: 3600 },
    });
    const json = await res.json();
    const settings: Array<{ key: string; value: string }> = json.data ?? [];

    const enabled = settings.find((s) => s.key === 'adsense.enabled')?.value === 'true';
    const publisherId = settings.find((s) => s.key === 'adsense.publisherId')?.value ?? '';

    // Validate publisherId strictly — must be ca-pub-digits only
    if (!enabled || !/^ca-pub-\d+$/.test(publisherId)) {
      return new NextResponse('', { status: 404 });
    }

    // Extract numeric publisher ID (without ca-pub- prefix) for ads.txt
    const pubId = publisherId.replace('ca-pub-', '');
    const content = `google.com, pub-${pubId}, DIRECT, f08c47fec0942fa0\n`;

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse('', { status: 503 });
  }
}
