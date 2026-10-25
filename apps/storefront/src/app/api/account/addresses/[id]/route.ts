import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.STOREFRONT_BACKEND_URL ?? 'http://localhost:4000';

function extractToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const body = await request.json();
    const { id: _id, createdAt: _c, updatedAt: _u, organizationId: _o, customerAccountId: _ca, ...safe } = body as Record<string, unknown>;
    void _id; void _c; void _u; void _o; void _ca;
    const res = await fetch(
      `${BACKEND}/api/v1/storefront/addresses/${encodeURIComponent(params.id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(safe),
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to update address' }, { status: 503 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const res = await fetch(
      `${BACKEND}/api/v1/storefront/addresses/${encodeURIComponent(params.id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 503 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const res = await fetch(
      `${BACKEND}/api/v1/storefront/addresses/${encodeURIComponent(params.id)}/default`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to set default address' }, { status: 503 });
  }
}
