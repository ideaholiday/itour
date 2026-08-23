import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const webVitalSchema = z.object({
  app: z.literal('next'),
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number().finite().min(0).max(3_600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  route: z.string().startsWith('/').max(160),
  navigationType: z.string().max(40).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = webVitalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid performance metric', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const backendUrl = (
    process.env.IDEA_HOLIDAY_API_URL ||
    process.env.WANDERINDIA_API_URL ||
    'http://localhost:4000'
  ).replace(/\/$/, '');

  try {
    const response = await fetch(`${backendUrl}/api/telemetry/web-vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
    });
    return new NextResponse(null, { status: response.ok ? 202 : response.status });
  } catch {
    // Real-user monitoring is best-effort and must not expose infrastructure details.
    return new NextResponse(null, { status: 202 });
  }
}

