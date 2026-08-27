import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedAccessToken } from '@/lib/supabase/server';

const locationSchema = z.object({
  address: z.string().trim().min(4).max(255),
  instructions: z.string().trim().max(255),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const payloadSchema = z.object({
  productId: z.string().min(1),
  optionId: z.string().min(1).optional(),
  supplierId: z.string().min(1),
  productType: z.enum(['TRANSFER', 'DAY_TOUR', 'MULTI_DAY_PACKAGE']),
  activityDate: z.string().min(8),
  traveler: z.object({
    name: z.string().trim().min(2),
    phone: z.string().trim().min(10),
    email: z.string().email(),
  }),
  pickup: locationSchema,
  drop: locationSchema,
  flight: z.object({
    number: z.string().min(2),
    scheduledArrival: z.string().min(4).optional(),
    scheduledDeparture: z.string().min(4).optional(),
    terminalGate: z.string().max(100),
  }).nullable(),
  fare: z.object({
    baseFare: z.number().nonnegative(),
    gst: z.number().nonnegative(),
    fastagAndAllowance: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    total: z.number().positive(),
    promoCode: z.string().nullable(),
  }),
}).superRefine((value, context) => {
  if (value.productType === 'TRANSFER' && (!value.flight || (!value.flight.scheduledArrival && !value.flight.scheduledDeparture))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['flight'], message: 'Flight details are required for airport transfers.' });
  }
});

export async function POST(request: NextRequest) {
  const accessToken = await getVerifiedAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please correct the trip details before payment.', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const airportDeparture = Boolean(data.flight?.scheduledDeparture && !data.flight?.scheduledArrival);
  const backendUrl = (process.env.IDEA_HOLIDAY_API_URL || process.env.WANDERINDIA_API_URL || 'http://localhost:4000').replace(/\/$/, '');

  try {
    const bookingResponse = await fetch(`${backendUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        product_id: data.productId,
        product_option_id: data.optionId,
        activity_date: data.activityDate,
        traveler_name: data.traveler.name,
        traveler_phone: data.traveler.phone,
        traveler_email: data.traveler.email,
        pickup_location: data.pickup.address,
        pickup_type: data.productType === 'TRANSFER' ? (airportDeparture ? 'HOTEL' : 'AIRPORT') : 'HOTEL',
        pickup_location_ref: undefined,
        drop_type: data.productType === 'TRANSFER' ? (airportDeparture ? 'AIRPORT' : 'HOTEL') : 'LOCATION',
        pickup_instructions: data.pickup.instructions,
        pickup_lat: data.pickup.lat,
        pickup_lng: data.pickup.lng,
        drop_location: data.drop.address,
        drop_instructions: data.drop.instructions,
        drop_lat: data.drop.lat,
        drop_lng: data.drop.lng,
        pickup_time: data.flight?.scheduledArrival || data.flight?.scheduledDeparture,
        flight_number: data.flight?.number,
        flight_arrival_time: data.flight?.scheduledArrival,
        flight_departure_time: data.flight?.scheduledDeparture,
        terminal_gate: data.flight?.terminalGate,
        amount_inr: data.fare.total,
        tolls_and_tax_amount: data.fare.gst + data.fare.fastagAndAllowance,
        promo_code: data.fare.promoCode,
        payment_status: 'PENDING',
        booking_status: 'pending_payment',
      }),
    });
    const booking = await bookingResponse.json();
    if (!bookingResponse.ok) throw new Error(booking.error || 'Booking draft failed.');

    return NextResponse.json({
      success: true,
      bookingRef: booking.ref,
      bookingId: booking.bookingId,
      assignment: booking.assignment || null,
    });
  } catch (error) {
    console.error('Checkout dispatch error:', error);
    return NextResponse.json({ error: 'We could not save the trip with the supplier. Please try again.' }, { status: 502 });
  }
}
