import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function getAuthHeader(req: NextRequest): Record<string, string> {
  const auth = req.headers.get('authorization');
  return auth ? { authorization: auth } : {};
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/testimonials/${params.id}/active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(req),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Failed to toggle testimonial status' }, { status: 502 });
  }
}
