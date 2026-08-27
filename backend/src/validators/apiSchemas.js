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
  signup: object({ name: text(2, 120), email, password: z.string().min(6).max(128), phone: phone.optional(), referralCode: optionalText(60) }),
  supplierSignup: object({ companyName: text(2, 180), contactName: text(2, 120), email, phone, city: text(2, 100), state: text(2, 100), password: z.string().min(6).max(128) }),
  login: object({ email, password: z.string().min(1).max(128) }),
};

const bookingQuoteFields = {
  product_id: id.optional(), activity_id: id.optional(), activity_date: date,
  product_option_id: id.optional(), pickup_mode: z.enum(["AIR", "RAIL", "SEA", "OTHER", "air", "rail", "sea", "other"]).optional(),
  hold_id: id.optional(),
  transfer_arrival_mode: z.enum(["AIR", "RAIL", "SEA", "OTHER", "air", "rail", "sea", "other"]).optional(),
  transfer_departure_mode: z.enum(["AIR", "RAIL", "SEA", "OTHER", "air", "rail", "sea", "other"]).optional(),
  pickup_location_ref: optionalText(240), drop_location_ref: optionalText(240), pickup_address: optionalText(500), drop_address: optionalText(500),
  pickup_city: optionalText(100), pickup_state: optionalText(100), drop_type: optionalText(40), custom_pickup: booleanValue.optional(),
  meeting_point_ref: optionalText(240), meeting_point_label: optionalText(500), booking_question_answers: z.record(z.any()).optional(),
  adults: count.optional(), passengers: count.optional(), children: count.optional(), luggage: count.optional(), luggage_bags: count.optional(),
  pickup_time: time.optional(), pickup_location: optionalText(500), drop_location: optionalText(500),
  pickup_lat: optionalCoordinate(-90, 90), pickup_lng: optionalCoordinate(-180, 180),
  drop_lat: optionalCoordinate(-90, 90), drop_lng: optionalCoordinate(-180, 180),
  vehicle_category: optionalText(80), variant_name: optionalText(160),
  flight_number: optionalText(40), flight_arrival_time: time.optional().nullable(), flight_departure_time: time.optional().nullable(), terminal_gate: optionalText(80),
  package_hotels: z.array(object({ day: z.coerce.number().int().min(1).max(60), name: optionalText(240), city: optionalText(100), lat: optionalCoordinate(-90, 90), lng: optionalCoordinate(-180, 180) })).max(60).optional(),
};

const requireBookingProduct = (value, ctx) => {
  if (!value.product_id && !value.activity_id) ctx.addIssue({ code: "custom", path: ["product_id"], message: "Product is required" });
};

export const bookingQuoteSchema = object(bookingQuoteFields).superRefine(requireBookingProduct);

export const bookingCreateSchema = object({
  ...bookingQuoteFields,
  traveler_name: text(2, 120), traveler_email: email, traveler_phone: phone,
  pickup_location: text(2, 500), pickup_instructions: optionalText(1_000), drop_instructions: optionalText(1_000),
  special_requests: optionalText(2_000), promo_code: optionalText(80), client_request_id: optionalText(160),
  payment_method: optionalText(40),
}).superRefine(requireBookingProduct);

export const bookingSchemas = {
  notificationPreferences: object({ emailEnabled: booleanValue.optional(), whatsappEnabled: booleanValue.optional(), email_enabled: booleanValue.optional(), whatsapp_enabled: booleanValue.optional() }),
  otp: object({ otp: z.string().regex(/^\d{6}$/) }),
  status: object({ status: text(2, 60), reason: optionalText(1_000) }),
  resend: object({ channel: z.enum(["EMAIL", "WHATSAPP", "ALL", "email", "whatsapp", "all"]).optional() }),
  amendment: object({ idempotencyKey: text(8, 160), amendmentType: z.enum(["PICKUP", "DROP", "LOGISTICS", "DATE", "TIME"]), proposed: z.record(z.any()), reason: optionalText(1_000) }),
};

const itineraryItemSchema = object({
  id: optionalText(160),
  dayNumber: z.coerce.number().int().min(1).max(30),
  timeSlot: optionalText(80),
  title: text(1, 240),
  location: optionalText(500),
  notes: optionalText(2_000),
  productId: optionalText(160),
  durationHours: z.coerce.number().positive().max(72).optional(),
  type: z.enum(["TOUR", "TRANSFER", "EXPERIENCE", "STAY", "MEAL", "CUSTOM"]).optional(),
  vehicleCategory: optionalText(80),
  variantName: optionalText(160),
});

const itineraryFields = {
  title: text(1, 160),
  destination: optionalText(160),
  startDate: date.optional(),
  travelDate: date.optional(),
  endDate: date.optional(),
  daysCount: z.coerce.number().int().min(1).max(30).optional(),
  adultsCount: z.coerce.number().int().min(1).max(30).optional(),
  childrenCount: z.coerce.number().int().min(0).max(30).optional(),
  items: z.array(itineraryItemSchema).max(120).optional(),
  isPublic: booleanValue.optional(),
};

export const itinerarySchemas = {
  create: object(itineraryFields),
  update: object({
    ...itineraryFields,
    title: itineraryFields.title.optional(),
  }),
  quote: object({
    startDate: date.optional(),
    adultsCount: z.coerce.number().int().min(1).max(30).optional(),
    childrenCount: z.coerce.number().int().min(0).max(30).optional(),
    luggage: z.coerce.number().int().min(0).max(60).optional(),
  }),
};

export const circuitOrderSchemas = {
  create: object({
    quoteId: id,
    idempotencyKey: optionalText(160),
    travelerName: optionalText(120),
    travelerEmail: email.optional(),
    travelerPhone: phone.optional(),
  }),
  paymentOrder: object({
    provider: z.enum(["CASHFREE", "RAZORPAY", "cashfree", "razorpay"]),
    returnUrl: optionalText(2_000),
  }),
  verifyPayment: object({
    provider: z.enum(["CASHFREE", "RAZORPAY", "cashfree", "razorpay"]),
    paymentOrderId: id,
    paymentId: id.optional(),
    signature: optionalText(512),
  }).superRefine((value, ctx) => {
    if (value.provider.toUpperCase() === "RAZORPAY" && (!value.paymentId || !value.signature)) {
      ctx.addIssue({ code: "custom", path: ["signature"], message: "Razorpay payment ID and signature are required" });
    }
  }),
  demoPayment: object({}),
  cancellationPreview: object({}),
  reschedulePreview: object({ newStartDate: date }),
  managementRequest: object({
    type: z.enum(["CANCELLATION", "RESCHEDULE", "cancellation", "reschedule"]),
    reason: text(5, 1_000),
    newStartDate: date.optional(),
    idempotencyKey: text(8, 160),
  }).superRefine((value, ctx) => {
    if (value.type.toUpperCase() === "RESCHEDULE" && !value.newStartDate) {
      ctx.addIssue({ code: "custom", path: ["newStartDate"], message: "New circuit start date is required" });
    }
  }),
  managementReview: object({
    action: z.enum(["APPROVE", "REJECT", "approve", "reject"]),
    resolution: text(5, 2_000),
  }),
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

const locationRuleSchema = object({
  side: z.enum(["PICKUP", "DROP", "pickup", "drop"]).optional(),
  ruleSide: z.enum(["PICKUP", "DROP", "pickup", "drop"]).optional(),
  mode: z.enum(["FIXED_LOCATION", "ZONE_POLYGON", "RADIUS_FROM_CENTER", "CITY_ANYWHERE"]).optional(),
  ruleMode: z.enum(["FIXED_LOCATION", "ZONE_POLYGON", "RADIUS_FROM_CENTER", "CITY_ANYWHERE"]).optional(),
  fixedLocationId: optionalText(160),
  allowedLocationTypes: z.array(z.enum(["AIRPORT", "RAILWAY_STATION", "BUS_STAND", "HOTEL_ZONE", "CITY_CENTER", "LANDMARK", "CRUISE_PORT", "PICKUP_ZONE"])).max(8).optional(),
  centerLat: optionalCoordinate(-90, 90), centerLng: optionalCoordinate(-180, 180),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  allowedState: optionalText(100), allowedCity: optionalText(100),
  polygonCoordinates: z.array(z.tuple([z.coerce.number(), z.coerce.number()])).max(1_000).optional(),
  errorMessage: optionalText(1_000), suggestion: optionalText(1_000),
});

export const supplierSchemas = {
  registration: object({ companyName: text(2, 180), contactName: text(2, 120), email, phone, city: text(2, 100), state: text(2, 100) }),
  kyb: object({
    docType: optionalText(80),
    doc_type: optionalText(80),
    docNumber: optionalText(160),
    doc_number: optionalText(160),
    docUrl: optionalText(2_000),
    doc_url: optionalText(2_000),
    pan: optionalText(32),
    gstin: optionalText(32),
  }),
  geofence: object({ zoneName: text(2, 160), city: text(2, 100), centerLat: z.coerce.number().min(-90).max(90), centerLng: z.coerce.number().min(-180).max(180), radiusKm: z.coerce.number().positive().max(500).optional(), polygonCoordinates: z.union([z.string().max(50_000), z.array(z.tuple([z.coerce.number(), z.coerce.number()])).max(1_000)]).optional() }),
  product: object({
    title: text(2, 240), productType: z.enum(["TRANSFER", "DAY_TOUR", "MULTI_DAY_PACKAGE"]),
    city: text(2, 100), state: text(2, 100), priceInr: amount,
    shortDesc: optionalText(1_500), fullDesc: optionalText(10_000),
    durationHours: z.coerce.number().positive().max(720).optional(),
    locationRules: z.array(locationRuleSchema).max(2).optional(),
    options: z.array(object({
      code: text(1, 80), name: text(1, 160), description: optionalText(1_000),
      pickupOptionType: z.enum(["PICKUP_EVERYONE", "PICKUP_AND_MEET_AT_START_POINT", "MEET_EVERYONE_AT_START_POINT"]).optional(),
      confirmationType: z.enum(["INSTANT", "MANUAL", "INSTANT_THEN_MANUAL"]).optional(),
      supportedArrivalModes: z.array(z.enum(["AIR", "RAIL", "SEA", "OTHER"])).max(4).optional(),
      supportedDepartureModes: z.array(z.enum(["AIR", "RAIL", "SEA", "OTHER"])).max(4).optional(),
      availableStartTimes: z.array(time).max(48).optional(), allowCustomTravelerPickup: booleanValue.optional(),
      pickupWindowMinutes: z.coerce.number().int().min(0).max(720).optional(), waitingTimeMinutes: z.coerce.number().int().min(0).max(720).optional(),
      meetingPointRef: optionalText(240), endPoint: optionalText(500), locations: z.array(object({ ref: optionalText(240), pickupType: optionalText(40), mode: optionalText(20), displayLabel: text(1, 500), address: optionalText(500), city: optionalText(100), state: optionalText(100), lat: optionalCoordinate(-90, 90), lng: optionalCoordinate(-180, 180), isMeetingPoint: booleanValue.optional() })).max(100).optional(),
    })).max(20).optional(),
    dayTourMeta: object({
      distanceKmLimit: z.coerce.number().positive().max(500).optional(),
      availableTimeSlots: z.array(time).min(1).max(24).optional(),
      vehicleRules: z.array(object({ pax_max: z.coerce.number().int().positive().max(100), category: optionalText(80) })).max(20).optional(),
      maxGroupSize: z.coerce.number().int().positive().max(100).optional(),
      advanceBookingCutoffHours: z.coerce.number().min(0).max(168).optional(),
      operatingStartTime: time.optional(), operatingEndTime: time.optional(),
      allowedLocationTypes: z.array(z.enum(["HOTEL_ZONE", "LANDMARK", "CITY_CENTER", "PICKUP_ZONE"])).max(4).optional(),
    }).optional(),
  }),
  publication: object({ isPublished: booleanValue.optional(), status: optionalText(40) }),
  assignment: object({ bookingId: id.optional(), driverId: id.optional(), action: optionalText(80), reason: optionalText(1_000), note: optionalText(1_000) }),
  driver: object({ driverName: text(2, 120), driverPhone: phone, vehicleNumber: text(3, 40), vehicleModel: optionalText(120), vehicleCategory: optionalText(80), licenseNumber: optionalText(80) }),
  dispatch: object({ bookingId: id, pickup: object({ address: text(2, 500), instructions: optionalText(1_000), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), drop: object({ address: text(2, 500), instructions: optionalText(1_000), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), flight: z.object({ number: optionalText(40), scheduledArrival: optionalText(80), terminalGate: optionalText(80) }).passthrough().optional().nullable() }),
  status: object({ status: text(2, 80), reason: optionalText(1_000) }),
  blockDates: object({ dates: z.array(date).min(1).max(366).optional(), startDate: date.optional(), endDate: date.optional(), reason: optionalText(500), capacity: count.optional() }),
  price: object({ priceInr: amount.optional(), price_inr: amount.optional(), variantName: optionalText(160) }),
  cancellation: object({ reason: text(3, 1_000) }),
  profileUpdate: object({
    companyName: optionalText(180),
    contactName: optionalText(120),
    phone: phone.optional(),
    city: optionalText(100),
    state: optionalText(100),
    gstin: optionalText(32),
    panNumber: optionalText(32),
    pan_number: optionalText(32),
    websiteUrl: optionalText(500),
    website_url: optionalText(500),
    businessType: optionalText(100),
    business_type: optionalText(100),
    yearsInOperation: z.union([z.number().int().min(0).max(150), z.string().regex(/^\d+$/)]).optional().nullable(),
    years_in_operation: z.union([z.number().int().min(0).max(150), z.string().regex(/^\d+$/)]).optional().nullable(),
  }),
  payoutDetails: object({
    accountHolder: optionalText(150),
    account_holder: optionalText(150),
    accountHolderName: optionalText(150),
    account_holder_name: optionalText(150),
    bankName: optionalText(120),
    bank_name: optionalText(120),
    accountNumber: optionalText(40),
    account_number: optionalText(40),
    ifscCode: optionalText(20),
    ifsc_code: optionalText(20),
    ifsc: optionalText(20),
    accountType: z.enum(["SAVINGS", "CURRENT", "savings", "current"]).optional(),
    account_type: z.enum(["SAVINGS", "CURRENT", "savings", "current"]).optional(),
    upiId: optionalText(100),
    upi_id: optionalText(100),
  }),
  verifyGstin: object({
    gstin: text(10, 20),
    businessName: optionalText(180),
    business_name: optionalText(180),
  }),
  verifyPan: object({
    pan: text(10, 10),
    name: optionalText(180),
  }),
  verifyBankAccount: object({
    accountNumber: text(5, 40),
    account_number: optionalText(40),
    ifsc: text(5, 20),
    ifscCode: optionalText(20),
    name: optionalText(180),
    phone: phone.optional(),
  }),
};

export const adminSchemas = {
  review: object({ action: text(2, 40), reason: optionalText(1_000) }),
  verification: object({ action: optionalText(40), decision: optionalText(40), reason: optionalText(1_000), commissionRate: z.coerce.number().min(0).max(100).optional() }),
  autoVerify: object({ supplierId: id.optional() }),
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
  create: object({
    bookingId: id.optional(),
    bookingRef: id.optional(),
    experienceRating: rating.optional(),
    experience_rating: rating.optional(),
    supplierRating: rating.optional(),
    supplier_rating: rating.optional(),
    driverRating: rating.optional(),
    driver_rating: rating.optional(),
    title: optionalText(160),
    comment: text(5, 5_000),
    tags: z.array(text(1, 80)).max(20).optional(),
    photos: z.array(z.union([
      z.string().max(2000),
      z.object({ url: z.string().max(2000), caption: optionalText(500) }),
      z.object({ photo_url: z.string().max(2000), caption: optionalText(500) })
    ])).max(10).optional(),
    wouldRecommend: booleanValue.optional(),
    would_recommend: booleanValue.optional()
  }),
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
  productId: id.optional(), product_id: id.optional(),
  pickup: optionalText(500), drop: optionalText(500), pickup_location: optionalText(500), drop_location: optionalText(500),
  pickupAddress: optionalText(500), dropAddress: optionalText(500),
  pickupLat: optionalCoordinate(-90, 90), pickupLng: optionalCoordinate(-180, 180),
  dropLat: optionalCoordinate(-90, 90), dropLng: optionalCoordinate(-180, 180),
  originLat: optionalCoordinate(-90, 90), originLng: optionalCoordinate(-180, 180),
  destLat: optionalCoordinate(-90, 90), destLng: optionalCoordinate(-180, 180),
  passengers: count.optional(), luggage: count.optional(), vehicleCategory: optionalText(80), selectedVehicle: optionalText(80), routeType: optionalText(80), date: date.optional(), pickupTime: time.optional(),
  flight_number: optionalText(40), flight_arrival_time: time.optional().nullable(), flight_departure_time: time.optional().nullable(), terminal_gate: optionalText(80),
});

export const metricsSchemas = {
  webVital: z.object({
    app: z.enum(["next", "vite"]),
    name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
    value: z.number().finite().min(0).max(3_600_000),
    rating: z.enum(["good", "needs-improvement", "poor"]),
    route: z.string().trim().startsWith("/").max(160),
    navigationType: z.string().trim().max(40).optional(),
  }).strict(),
};

export const locationSchemas = {
  suggestions: object({ side: z.enum(["PICKUP", "DROP", "pickup", "drop"]).optional(), q: optionalText(100) }),
  validatePoint: object({ side: z.enum(["PICKUP", "DROP", "pickup", "drop"]).optional(), lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), address: optionalText(500) }),
};
