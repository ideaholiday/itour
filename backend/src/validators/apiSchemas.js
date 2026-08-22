import { z } from "zod";

const text = (min = 1, max = 500) => z.string().trim().min(min).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).optional().nullable();
const id = text(1, 160);
const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const phone = z.string().trim().min(8).max(24).refine(
  (value) => value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15,
  "Enter a valid phone number",
);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().trim().regex(/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i);
const count = z.union([z.number().int(), z.string().regex(/^\d+$/)]).refine((value) => Number(value) >= 0 && Number(value) <= 100);
const amount = z.union([z.number(), z.string().regex(/^\d+(?:\.\d{1,2})?$/)]).refine((value) => Number(value) >= 0 && Number(value) <= 100_000_000);
const rating = z.union([z.number(), z.string().regex(/^[1-5]$/)]).refine((value) => Number(value) >= 1 && Number(value) <= 5);
const booleanValue = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal("true"), z.literal("false")])
  .transform((value) => value === true || value === 1 || value === "true");
const optionalCoordinate = (min, max) => z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().min(min).max(max).optional(),
);
const object = (shape) => z.object(shape).passthrough();

export const identifierParams = object({ id: id.optional(), ref: id.optional(), zoneId: id.optional(), productId: id.optional(), bookingId: id.optional(), driverId: id.optional(), fenceId: id.optional(), dateId: id.optional() });

export const authSchemas = {
  signup: object({ name: text(2, 120), email, password: z.string().min(8).max(128), phone: phone.optional() }),
  supplierSignup: object({ companyName: text(2, 180), contactName: text(2, 120), email, phone, city: text(2, 100), state: text(2, 100), password: z.string().min(8).max(128) }),
  login: object({ email, password: z.string().min(1).max(128) }),
};

export const bookingQuoteSchema = object({
  product_id: id.optional(), activity_id: id.optional(), activity_date: date,
  adults: count.optional(), passengers: count.optional(), children: count.optional(), luggage: count.optional(), luggage_bags: count.optional(),
  pickup_time: time.optional(), pickup_location: optionalText(500), drop_location: optionalText(500),
  pickup_lat: optionalCoordinate(-90, 90), pickup_lng: optionalCoordinate(-180, 180),
  drop_lat: optionalCoordinate(-90, 90), drop_lng: optionalCoordinate(-180, 180),
  vehicle_category: optionalText(80), variant_name: optionalText(160),
}).superRefine((value, ctx) => {
  if (!value.product_id && !value.activity_id) ctx.addIssue({ code: "custom", path: ["product_id"], message: "Product is required" });
});

export const bookingCreateSchema = bookingQuoteSchema.and(object({
  traveler_name: text(2, 120), traveler_email: email, traveler_phone: phone,
  pickup_location: text(2, 500), pickup_instructions: optionalText(1_000), drop_instructions: optionalText(1_000),
  special_requests: optionalText(2_000), promo_code: optionalText(80), client_request_id: optionalText(160),
  flight_number: optionalText(40), terminal_gate: optionalText(80), payment_method: optionalText(40),
}));

export const bookingSchemas = {
  notificationPreferences: object({ emailEnabled: booleanValue.optional(), whatsappEnabled: booleanValue.optional(), email_enabled: booleanValue.optional(), whatsapp_enabled: booleanValue.optional() }),
  otp: object({ otp: z.string().regex(/^\d{6}$/) }),
  status: object({ status: text(2, 60), reason: optionalText(1_000) }),
  resend: object({ channel: z.enum(["EMAIL", "WHATSAPP", "ALL", "email", "whatsapp", "all"]).optional() }),
};

export const checkoutSchemas = {
  booking: object({ bookingId: id.optional(), bookingRef: id.optional() }).superRefine((value, ctx) => {
    if (!value.bookingId && !value.bookingRef) ctx.addIssue({ code: "custom", path: ["bookingId"], message: "Booking is required" });
  }),
  razorpayVerify: object({ bookingId: id.optional(), bookingRef: id.optional(), razorpay_order_id: id, razorpay_payment_id: id, razorpay_signature: text(16, 512) }),
  cashfreeVerify: object({ bookingId: id.optional(), bookingRef: id.optional(), orderId: id.optional(), cashfreeOrderId: id.optional() }),
  cancel: object({ bookingId: id.optional(), bookingRef: id.optional(), reason: text(3, 1_000) }),
  refund: object({ bookingId: id.optional(), bookingRef: id.optional(), reason: optionalText(1_000), refundPercentage: z.coerce.number().min(0).max(100).optional() }),
};

export const supplierSchemas = {
  registration: object({ companyName: text(2, 180), contactName: text(2, 120), email, phone, city: text(2, 100), state: text(2, 100) }),
  kyb: object({ docType: text(2, 80), docNumber: text(2, 160), docUrl: optionalText(2_000), pan: optionalText(32), gstin: optionalText(32) }),
  geofence: object({ zoneName: text(2, 160), city: text(2, 100), centerLat: z.coerce.number().min(-90).max(90), centerLng: z.coerce.number().min(-180).max(180), radiusKm: z.coerce.number().positive().max(500).optional(), polygonCoordinates: z.union([z.string().max(50_000), z.array(z.tuple([z.coerce.number(), z.coerce.number()])).max(1_000)]).optional() }),
  product: object({ title: text(2, 240), productType: text(2, 80), city: text(2, 100), state: text(2, 100), priceInr: amount, shortDesc: optionalText(1_000), fullDesc: optionalText(10_000), durationHours: z.coerce.number().positive().max(720).optional() }),
  publication: object({ isPublished: booleanValue.optional(), status: optionalText(40) }),
  assignment: object({ bookingId: id.optional(), driverId: id.optional(), action: optionalText(80), reason: optionalText(1_000) }),
  driver: object({ driverName: text(2, 120), driverPhone: phone, vehicleNumber: text(3, 40), vehicleModel: optionalText(120), vehicleCategory: optionalText(80), licenseNumber: optionalText(80) }),
  dispatch: object({ bookingId: id, pickup: object({ address: text(2, 500), instructions: optionalText(1_000), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), drop: object({ address: text(2, 500), instructions: optionalText(1_000), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), flight: z.object({ number: optionalText(40), scheduledArrival: optionalText(80), terminalGate: optionalText(80) }).passthrough().optional().nullable() }),
  status: object({ status: text(2, 80), reason: optionalText(1_000) }),
  blockDates: object({ dates: z.array(date).min(1).max(366).optional(), startDate: date.optional(), endDate: date.optional(), reason: optionalText(500), capacity: count.optional() }),
  price: object({ priceInr: amount.optional(), price_inr: amount.optional(), variantName: optionalText(160) }),
  cancellation: object({ reason: text(3, 1_000) }),
};

export const adminSchemas = {
  review: object({ action: text(2, 40), reason: optionalText(1_000) }),
  verification: object({ action: optionalText(40), decision: optionalText(40), reason: optionalText(1_000), commissionRate: z.coerce.number().min(0).max(100).optional() }),
  commission: object({ commissionRate: z.coerce.number().min(0).max(100).optional(), commission_rate: z.coerce.number().min(0).max(100).optional(), category: optionalText(100) }),
  categoryCommission: object({ categoryCode: text(2, 100), defaultCommissionRate: z.coerce.number().min(0).max(100) }),
  publication: object({ isPublished: booleanValue.optional(), status: optionalText(40), notifySupplier: booleanValue.optional() }),
  settlement: object({ supplierId: id.optional(), payoutIds: z.array(id).max(1_000).optional(), bookingIds: z.array(id).max(1_000).optional(), provider: optionalText(100), providerReference: optionalText(240), notes: optionalText(2_000), note: optionalText(2_000) }),
  financeAction: object({ action: optionalText(80), status: optionalText(80), reason: optionalText(1_000), providerReference: optionalText(240) }),
  override: object({ action: text(2, 80), newSupplierId: id.optional(), driverName: optionalText(120), driverPhone: phone.optional(), vehicleNumber: optionalText(40), refundReason: optionalText(1_000) }),
  payout: object({ payoutId: id, providerReference: text(2, 240), provider: text(2, 100) }),
};

export const supportSchemas = {
  create: object({ bookingId: id.optional(), bookingRef: id.optional(), type: optionalText(80), caseType: optionalText(80), subject: text(3, 240), message: optionalText(5_000), description: optionalText(5_000), category: optionalText(100), priority: optionalText(40), requestedRefundPercentage: z.coerce.number().min(0).max(100).optional() }).superRefine((value, ctx) => {
    if (!value.message && !value.description) ctx.addIssue({ code: "custom", path: ["description"], message: "Description is required" });
  }),
  message: object({ message: text(1, 5_000), isInternal: booleanValue.optional() }),
  evidence: object({ url: optionalText(2_000), evidenceUrl: optionalText(2_000), label: optionalText(240), displayName: optionalText(240), description: optionalText(1_000), note: optionalText(1_000) }).superRefine((value, ctx) => {
    if (!value.url && !value.evidenceUrl) ctx.addIssue({ code: "custom", path: ["evidenceUrl"], message: "Evidence URL is required" });
  }),
  update: object({ status: optionalText(80), priority: optionalText(40), assignedTo: optionalText(160), resolution: optionalText(5_000) }),
  refundDecision: object({ action: z.enum(["APPROVE", "REJECT", "approve", "reject"]), resolution: text(5, 5_000), approvedRefundPercentage: z.coerce.number().min(0).max(100).optional() }),
};

export const reviewSchemas = {
  create: object({ bookingId: id.optional(), bookingRef: id.optional(), experienceRating: rating.optional(), experience_rating: rating.optional(), supplierRating: rating.optional(), supplier_rating: rating.optional(), driverRating: rating.optional(), driver_rating: rating.optional(), title: optionalText(160), comment: text(5, 5_000), tags: z.array(text(1, 80)).max(20).optional(), wouldRecommend: booleanValue.optional(), would_recommend: booleanValue.optional() }),
  response: object({ response: text(2, 2_000) }),
  moderate: object({ action: text(2, 40), reason: optionalText(1_000) }),
};

export const opsSchemas = {
  scheduler: object({ limit: z.coerce.number().int().min(1).max(500).optional() }),
  fallback: object({ bookingId: id, fallbackDriverName: optionalText(120), fallbackDriverPhone: phone.optional(), fallbackVehicleModel: optionalText(120), fallbackVehicleNumber: optionalText(40), notes: optionalText(2_000) }),
  reallocate: object({ bookingId: id, radiusKm: z.coerce.number().positive().max(500).optional() }),
  whatsapp: object({ bookingId: id.optional(), phone: phone.optional(), template: optionalText(160), message: optionalText(4_000) }),
  notification: object({ notificationId: id.optional(), bookingId: id.optional(), channel: optionalText(40) }),
  providerTest: object({ channel: z.enum(["EMAIL", "WHATSAPP", "email", "whatsapp"]), to: text(3, 254), recipientName: optionalText(120), recipientRole: optionalText(40), subject: optionalText(240), text: optionalText(4_000) }),
  task: object({ status: optionalText(80), assignee: optionalText(160), note: optionalText(2_000), notes: optionalText(2_000), resolution: optionalText(2_000) }),
};

export const transferSchema = object({
  pickup: optionalText(500), drop: optionalText(500), pickup_location: optionalText(500), drop_location: optionalText(500),
  pickupLat: optionalCoordinate(-90, 90), pickupLng: optionalCoordinate(-180, 180),
  dropLat: optionalCoordinate(-90, 90), dropLng: optionalCoordinate(-180, 180),
  passengers: count.optional(), luggage: count.optional(), vehicleCategory: optionalText(80), routeType: optionalText(80), date: date.optional(), pickupTime: time.optional(),
});
