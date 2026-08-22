import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAccessToken } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const accessToken = await getVerifiedAccessToken();
  if (!accessToken) return NextResponse.json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, { status: 401 });
  const backendUrl = (
    process.env.IDEA_HOLIDAY_API_URL ||
    process.env.WANDERINDIA_API_URL ||
    'http://localhost:4000'
  ).replace(/\/$/, '');

  try {
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${backendUrl}/api/checkout/cashfree/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Next.js Cashfree Verify Proxy Error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to verify Cashfree payment' },
      { status: 502 }
    );
  }
}
