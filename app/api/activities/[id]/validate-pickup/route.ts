import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const backendUrl = (process.env.IDEA_HOLIDAY_API_URL || process.env.WANDERINDIA_API_URL || 'http://localhost:4000').replace(/\/$/, '');
  const payload = await request.json().catch(() => null);
  try {
    const response = await fetch(`${backendUrl}/api/activities/${encodeURIComponent(id)}/validate-pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ error: 'Location validation is unavailable.' }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Location validation is temporarily unavailable.' }, { status: 502 });
  }
}
