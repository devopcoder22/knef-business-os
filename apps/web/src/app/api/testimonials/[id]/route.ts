import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function getAuthHeader(req: NextRequest): Record<string, string> {
  const auth = req.headers.get('authorization');
  return auth ? { authorization: auth } : {};
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/testimonials/${params.id}`, {
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
    return NextResponse.json({ message: 'Failed to update testimonial' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${BACKEND}/testimonials/${params.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(req),
      },
    });
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Failed to delete testimonial' }, { status: 502 });
  }
}
