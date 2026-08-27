import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const backendUrl = (process.env.IDEA_HOLIDAY_API_URL || process.env.WANDERINDIA_API_URL || 'http://localhost:4000').replace(/\/$/, '');
  const query = request.nextUrl.searchParams;
  const url = `${backendUrl}/api/activities/${encodeURIComponent(id)}/pickup-suggestions?side=${encodeURIComponent(query.get('side') || 'PICKUP')}&q=${encodeURIComponent(query.get('q') || '')}`;
  try {
    const response = await fetch(url, { next: { revalidate: 30 } });
    const body = await response.json().catch(() => ({ error: 'Location search is unavailable.' }));
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Location search is temporarily unavailable.', suggestions: [] }, { status: 502 });
  }
}
