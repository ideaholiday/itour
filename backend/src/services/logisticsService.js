import { nanoid } from "nanoid";

const HOLD_MINUTES = 15;
const MODES = new Set(["AIR", "RAIL", "SEA", "OTHER"]);
const PICKUP_TYPES = new Set(["AIRPORT", "HOTEL", "PORT", "LOCATION", "OTHER"]);

function json(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function tableReady(db, table) {
  try { return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)); } catch { return true; }
}

export function optionView(row, locations = []) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    code: row.option_code,
    name: row.name,
    description: row.description || null,
    pickupOptionType: row.pickup_option_type,
    confirmationType: row.confirmation_type,
    supportedArrivalModes: json(row.supported_arrival_modes, []),
    supportedDepartureModes: json(row.supported_departure_modes, []),
    availableStartTimes: json(row.available_start_times, []),
    capacity: row.capacity == null ? null : Number(row.capacity),
    allowCustomTravelerPickup: Boolean(row.allow_custom_traveler_pickup),
    pickupWindowMinutes: Number(row.pickup_window_minutes || 30),
    waitingTimeMinutes: Number(row.waiting_time_minutes || 30),
    noShowPolicy: row.no_show_policy || null,
    serviceHours: row.service_hours_start ? { start: row.service_hours_start, end: row.service_hours_end } : null,
    supplierConfirmationSlaMinutes: Number(row.supplier_confirmation_sla_minutes || 10),
    meetingPointRef: row.meeting_point_ref || null,
    endPoint: row.end_point || null,
    allowedPickupReferences: ["MEET_AT_DEPARTURE_POINT", "CONTACT_SUPPLIER_LATER"],
    locations: locations.map((location) => ({
      id: location.id, ref: location.location_ref || location.external_ref || null,
      provider: location.provider || "IDEA_HOLIDAY", externalRef: location.external_ref || null,
      pickupType: location.pickup_type, mode: location.mode || null,
      displayLabel: location.display_label, address: location.address || null,
      city: location.city || null, state: location.state || null,
      lat: location.lat == null ? null : Number(location.lat), lng: location.lng == null ? null : Number(location.lng),
      isMeetingPoint: Boolean(location.is_meeting_point),
    })),
  };
}

export function getProductOptions(db, productId) {
  if (!tableReady(db, "product_options")) return [];
  const rows = db.prepare("SELECT * FROM product_options WHERE product_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY name").all(productId);
  return rows.map((row) => optionView(row, db.prepare("SELECT * FROM product_option_locations WHERE option_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order, display_label").all(row.id)));
}

export function getOption(db, productId, optionId) {
  if (!optionId || !tableReady(db, "product_options")) return null;
  const row = db.prepare("SELECT * FROM product_options WHERE id = ? AND product_id = ? AND COALESCE(is_active, 1) = 1").get(optionId, productId);
  return row ? optionView(row, db.prepare("SELECT * FROM product_option_locations WHERE option_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order, display_label").all(row.id)) : null;
}

export function ensureDefaultProductOption(db, product) {
  if (!tableReady(db, "product_options") || !product?.id) return null;
  const existing = db.prepare("SELECT * FROM product_options WHERE product_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY created_at LIMIT 1").get(product.id);
  if (existing) return optionView(existing, db.prepare("SELECT * FROM product_option_locations WHERE option_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY sort_order").all(existing.id));
  const route = product.product_type === "TRANSFER" ? db.prepare("SELECT * FROM transfer_routes WHERE product_id = ? LIMIT 1").get(product.id) : null;
  const dayTour = product.product_type === "DAY_TOUR" ? db.prepare("SELECT * FROM day_tours WHERE product_id = ? LIMIT 1").get(product.id) : null;
  const routeType = String(route?.route_type || "").toUpperCase();
  const pickupType = product.product_type === "TRANSFER" && routeType.includes("AIRPORT") ? "PICKUP_EVERYONE" : "PICKUP_AND_MEET_AT_START_POINT";
  const option = {
    id: `opt_${nanoid(12)}`, productId: product.id, code: "STANDARD", name: "Standard option",
    pickupOptionType: pickupType, confirmationType: product.default_confirmation_type || "INSTANT_THEN_MANUAL",
    arrivalModes: routeType.includes("AIRPORT") ? ["AIR"] : ["AIR", "RAIL", "SEA", "OTHER"],
    departureModes: routeType.includes("AIRPORT") ? ["AIR"] : ["AIR", "RAIL", "SEA", "OTHER"],
    startTimes: json(dayTour?.available_time_slots, ["09:00"]), allowCustom: false,
    pickupWindow: 30, waiting: 30, sla: 10,
  };
  db.prepare(`INSERT INTO product_options (id, product_id, option_code, name, pickup_option_type, confirmation_type,
    supported_arrival_modes, supported_departure_modes, available_start_times, allow_custom_traveler_pickup,
    pickup_window_minutes, waiting_time_minutes, supplier_confirmation_sla_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    option.id, option.productId, option.code, option.name, option.pickupOptionType, option.confirmationType,
    JSON.stringify(option.arrivalModes), JSON.stringify(option.departureModes), JSON.stringify(option.startTimes), option.allowCustom ? 1 : 0,
    option.pickupWindow, option.waiting, option.sla,
  );
  return getOption(db, product.id, option.id);
}

export function backfillProductOptions(db) {
  if (!tableReady(db, "product_options")) return;
  const questionSeed = [
    ["TRANSFER_ARRIVAL_MODE", "How are you arriving?", "SELECT", "PER_BOOKING", false, null, ["AIR", "RAIL", "SEA", "OTHER"], {}],
    ["TRANSFER_DEPARTURE_MODE", "How are you departing?", "SELECT", "PER_BOOKING", false, null, ["AIR", "RAIL", "SEA", "OTHER"], {}],
    ["AIRLINE", "Airline", "TEXT", "PER_BOOKING", false, null, [], { field: "TRANSFER_ARRIVAL_MODE", equals: "AIR" }],
    ["FLIGHT_NUMBER", "Flight number", "TEXT", "PER_BOOKING", false, null, [], { field: "TRANSFER_ARRIVAL_MODE", equals: "AIR" }],
    ["FLIGHT_ARRIVAL_TIME", "Arrival time", "TIME", "PER_BOOKING", false, "LOCAL", [], { field: "TRANSFER_ARRIVAL_MODE", equals: "AIR" }],
    ["FLIGHT_DEPARTURE_TIME", "Departure time", "TIME", "PER_BOOKING", false, "LOCAL", [], { field: "TRANSFER_DEPARTURE_MODE", equals: "AIR" }],
    ["SPECIAL_REQUIREMENTS", "Special requirements", "TEXT", "PER_BOOKING", false, null, [], {}],
    ["ACCESSIBILITY", "Accessibility requirements", "TEXT", "PER_TRAVELER", false, null, [], {}],
    ["LUGGAGE_DETAILS", "Luggage details", "TEXT", "PER_BOOKING", false, "BAGS", [], {}],
  ];
  if (tableReady(db, "booking_question_definitions")) {
    const insertQuestion = db.prepare(`INSERT INTO booking_question_definitions (id, code, label, answer_type, scope, required, unit, allowed_answers, condition_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(code) DO NOTHING`);
    for (const [code, label, type, scope, required, unit, allowed, condition] of questionSeed) insertQuestion.run(`q_${code.toLowerCase()}`, code, label, type, scope, required ? 1 : 0, unit, JSON.stringify(allowed), JSON.stringify(condition));
  }
  const products = db.prepare("SELECT * FROM products").all();
  for (const product of products) {
    const option = ensureDefaultProductOption(db, product);
    if (!option) continue;
    if (tableReady(db, "product_option_questions")) {
      const insertRelation = db.prepare("INSERT INTO product_option_questions (option_id, question_id, sort_order) SELECT ?, id, ? FROM booking_question_definitions WHERE code = ? ON CONFLICT(option_id, question_id) DO NOTHING");
      const codes = product.product_type === "TRANSFER" ? ["TRANSFER_ARRIVAL_MODE", "TRANSFER_DEPARTURE_MODE", "AIRLINE", "FLIGHT_NUMBER", "FLIGHT_ARRIVAL_TIME", "FLIGHT_DEPARTURE_TIME", "SPECIAL_REQUIREMENTS"] : ["SPECIAL_REQUIREMENTS"];
      codes.forEach((code, index) => insertRelation.run(option.id, index, code));
    }
    if (product.product_type === "TRANSFER") {
      const route = db.prepare("SELECT * FROM transfer_routes WHERE product_id = ? LIMIT 1").get(product.id);
      for (const side of ["origin", "dest"]) {
        const ref = route?.[`${side}_location_id`];
        const label = route?.[`${side}_name`];
        if (!ref && !label) continue;
        const exists = db.prepare("SELECT id FROM product_option_locations WHERE option_id = ? AND location_ref = ?").get(option.id, ref || label);
        if (exists) continue;
        const canonical = ref ? db.prepare("SELECT * FROM canonical_locations WHERE id = ?").get(ref) : null;
        db.prepare(`INSERT INTO product_option_locations (id, option_id, location_ref, provider, pickup_type, mode, display_label, address, city, state, lat, lng, sort_order)
          VALUES (?, ?, ?, 'IDEA_HOLIDAY', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          `opl_${nanoid(12)}`, option.id, ref || label, canonical?.location_type === "CRUISE_PORT" ? "PORT" : canonical?.location_type === "AIRPORT" ? "AIRPORT" : "LOCATION",
          side === "origin" ? "AIR" : "AIR", canonical?.name || label, canonical?.name || label, canonical?.city || product.city, canonical?.state || product.state,
          canonical?.lat ?? route?.[`${side}_lat`] ?? null, canonical?.lng ?? route?.[`${side}_lng`] ?? null, side === "origin" ? 0 : 1,
        );
      }
    }
  }
}

export function getBookingQuestions(db, optionId) {
  if (!tableReady(db, "booking_question_definitions") || !optionId) return [];
  return db.prepare(`SELECT q.*, pq.sort_order, pq.required_override
    FROM booking_question_definitions q JOIN product_option_questions pq ON pq.question_id = q.id
    WHERE pq.option_id = ? ORDER BY pq.sort_order, q.code`).all(optionId).map((q) => ({
    code: q.code, label: q.label, answerType: q.answer_type, scope: q.scope,
    required: q.required_override == null ? Boolean(q.required) : Boolean(q.required_override),
    unit: q.unit || null, helpText: q.help_text || null, allowedAnswers: json(q.allowed_answers, []), condition: json(q.condition_json, {}),
  }));
}

export function validateQuestionAnswers(db, optionId, answers = {}, modes = {}) {
  const questions = getBookingQuestions(db, optionId);
  const normalized = {};
  for (const question of questions) {
    const condition = question.condition || {};
    const conditionValue = condition.field
      ? (answers[condition.field] ?? answers[String(condition.field).toLowerCase()] ?? modes[condition.field] ?? modes[String(condition.field).toLowerCase()])
      : undefined;
    if (condition.field && condition.equals != null && String(conditionValue || "").toUpperCase() !== String(condition.equals).toUpperCase()) continue;
    const value = answers[question.code];
    if (question.required && (value == null || value === "")) {
      const error = new Error(`${question.label} is required`); error.status = 400; error.code = "BOOKING_QUESTION_REQUIRED"; throw error;
    }
    if (value != null && value !== "") normalized[question.code] = value;
  }
  return normalized;
}

export function validateOptionLogistics(db, productId, input = {}) {
  const option = input.product_option_id ? getOption(db, productId, input.product_option_id) : getProductOptions(db, productId)[0];
  if (!option) return null;
  const mode = String(input.pickup_mode || input.transfer_arrival_mode || input.transfer_departure_mode || "").toUpperCase();
  if (mode && !MODES.has(mode)) { const e = new Error("Unsupported pickup mode"); e.status = 400; throw e; }
  if (mode && !(option.supportedArrivalModes || []).includes(mode) && !(option.supportedDepartureModes || []).includes(mode)) { const e = new Error("This option does not support the selected arrival or departure mode"); e.status = 409; throw e; }
  if (input.pickup_type && !PICKUP_TYPES.has(String(input.pickup_type).toUpperCase())) { const e = new Error("Unsupported pickup type"); e.status = 400; throw e; }
  if (option.pickupOptionType === "MEET_EVERYONE_AT_START_POINT" && input.pickup_location && input.pickup_location_ref) { const e = new Error("This option uses a meeting point and does not accept hotel pickup"); e.status = 409; throw e; }
  if (input.custom_pickup && !option.allowCustomTravelerPickup) { const e = new Error("Custom pickup is not available for this option"); e.status = 409; e.code = "CUSTOM_PICKUP_DISABLED"; throw e; }
  const refs = new Set((option.locations || []).map((location) => String(location.ref || "")).filter(Boolean));
  const pickupRef = String(input.pickup_location_ref || "");
  if (pickupRef && !["MEET_AT_DEPARTURE_POINT", "CONTACT_SUPPLIER_LATER"].includes(pickupRef) && !refs.has(pickupRef)) {
    const canonical = (() => { try { return db.prepare("SELECT id FROM canonical_locations WHERE id = ? AND COALESCE(is_active, 1) = 1").get(pickupRef); } catch { return null; } })();
    if (!canonical && !option.allowCustomTravelerPickup && !(Number.isFinite(Number(input.pickup_lat)) && Number.isFinite(Number(input.pickup_lng)))) { const e = new Error("Select a valid pickup location for this option"); e.status = 400; e.code = "INVALID_LOCATION_REFERENCE"; throw e; }
  }
  return option;
}

export function buildLogisticsSnapshot(input, option, validation = {}) {
  return {
    optionId: option?.id || input.product_option_id || null,
    pickupOptionType: option?.pickupOptionType || null,
    confirmationType: option?.confirmationType || "INSTANT_THEN_MANUAL",
    pickupMode: String(input.pickup_mode || input.transfer_arrival_mode || input.transfer_departure_mode || "OTHER").toUpperCase(),
    pickupType: String(input.pickup_type || "HOTEL").toUpperCase(),
    pickupLocationRef: input.pickup_location_ref || null,
    pickupLocation: input.pickup_location || null,
    pickupAddress: input.pickup_address || input.pickup_location || null,
    pickupCity: input.pickup_city || null, pickupState: input.pickup_state || null,
    pickupLat: input.pickup_lat ?? null, pickupLng: input.pickup_lng ?? null,
    dropType: input.drop_type || null, dropLocationRef: input.drop_location_ref || null,
    dropLocation: input.drop_location || null, dropAddress: input.drop_address || input.drop_location || null,
    dropLat: input.drop_lat ?? null, dropLng: input.drop_lng ?? null,
    meetingPointRef: input.meeting_point_ref || option?.meetingPointRef || null,
    meetingPointLabel: input.meeting_point_label || null,
    packageHotels: Array.isArray(input.package_hotels) ? input.package_hotels.map((hotel) => ({ day: Number(hotel.day), city: hotel.city || null, locationRef: hotel.location_ref || null, location: hotel.name || hotel.address || null, lat: hotel.lat ?? null, lng: hotel.lng ?? null, status: hotel.name && hotel.lat != null && hotel.lng != null ? "VERIFIED" : "REQUIRES_CONFIRMATION" })) : [],
    customPickup: Boolean(input.custom_pickup), needsOpsReview: Boolean(validation.needsOpsReview),
    pendingSupplier: option?.confirmationType !== "INSTANT",
  };
}

export function persistBookingLogistics(db, bookingId, snapshot, answers = {}, actorId = null) {
  if (!tableReady(db, "booking_logistics")) return;
  const id = `log_${nanoid(12)}`;
  db.prepare(`INSERT INTO booking_logistics (id, booking_id, option_id, pickup_mode, pickup_type, pickup_location_ref, pickup_location,
    pickup_address, pickup_city, pickup_state, pickup_lat, pickup_lng, drop_type, drop_location_ref, drop_location, drop_address,
    drop_lat, drop_lng, meeting_point_ref, meeting_point_label, status, custom_pickup, needs_ops_review, pending_supplier, snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(booking_id) DO UPDATE SET snapshot=excluded.snapshot, updated_at=CURRENT_TIMESTAMP`).run(
    id, bookingId, snapshot.optionId, snapshot.pickupMode, snapshot.pickupType, snapshot.pickupLocationRef, snapshot.pickupLocation,
    snapshot.pickupAddress, snapshot.pickupCity, snapshot.pickupState, snapshot.pickupLat, snapshot.pickupLng, snapshot.dropType,
    snapshot.dropLocationRef, snapshot.dropLocation, snapshot.dropAddress, snapshot.dropLat, snapshot.dropLng, snapshot.meetingPointRef,
    snapshot.meetingPointLabel, snapshot.pendingSupplier ? "SUPPLIER_CONFIRMATION_PENDING" : "PICKUP_REQUESTED", snapshot.customPickup ? 1 : 0,
    snapshot.needsOpsReview ? 1 : 0, snapshot.pendingSupplier ? 1 : 0, JSON.stringify(snapshot),
  );
  for (const [code, value] of Object.entries(answers || {})) {
    db.prepare(`INSERT INTO booking_question_answers (id, booking_id, question_code, traveler_num, answer, unit)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(booking_id, question_code, traveler_num) DO UPDATE SET answer=excluded.answer`).run(`ans_${nanoid(12)}`, bookingId, code, value?.travelerNum ?? null, typeof value === "object" ? JSON.stringify(value.answer ?? value) : String(value), value?.unit || null);
  }
  db.prepare("INSERT INTO booking_logistics_events (id, booking_id, event_type, status, payload, actor_id) VALUES (?, ?, ?, ?, ?, ?)").run(`ble_${nanoid(12)}`, bookingId, "PICKUP_REQUESTED", "PICKUP_REQUESTED", JSON.stringify(snapshot), actorId);
  try {
    const insertStop = db.prepare(`INSERT INTO booking_logistics_stops (id, booking_id, itinerary_day, city, location_ref, location, lat, lng, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(booking_id, itinerary_day) DO UPDATE SET city=excluded.city, location_ref=excluded.location_ref, location=excluded.location, lat=excluded.lat, lng=excluded.lng, status=excluded.status`);
    for (const hotel of snapshot.packageHotels || []) insertStop.run(`bls_${nanoid(12)}`, bookingId, hotel.day, hotel.city, hotel.locationRef, hotel.location, hotel.lat, hotel.lng, hotel.status);
  } catch {}
}

export function createBookingHold(db, { productId, optionId = null, bookingId = null, activityDate, adults, children = 0, amount, quote = {}, logistics = {}, clientRequestId = null }) {
  if (!tableReady(db, "booking_holds") || !productId || !activityDate || !adults || !amount) return null;
  const id = `hld_${nanoid(12)}`;
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  if (clientRequestId) {
    const existing = db.prepare("SELECT * FROM booking_holds WHERE client_request_id = ? AND status = 'ACTIVE' AND datetime(expires_at) > datetime('now')").get(clientRequestId);
    if (existing) {
      db.prepare("UPDATE booking_holds SET product_id=?, product_option_id=?, activity_date=?, adults=?, children=?, amount_inr=?, quote_snapshot=?, logistics_snapshot=?, status='ACTIVE', expires_at=?, consumed_at=NULL WHERE id=?").run(productId, optionId, activityDate, adults, children, amount, JSON.stringify(quote || {}), JSON.stringify(logistics || {}), expiresAt, existing.id);
      return db.prepare("SELECT * FROM booking_holds WHERE id = ?").get(existing.id);
    }
  }
  db.prepare(`INSERT INTO booking_holds (id, booking_id, client_request_id, product_id, product_option_id, activity_date, adults, children, amount_inr, quote_snapshot, logistics_snapshot, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, bookingId, clientRequestId, productId, optionId, activityDate, adults, children, amount, JSON.stringify(quote || {}), JSON.stringify(logistics || {}), expiresAt);
  return db.prepare("SELECT * FROM booking_holds WHERE id = ?").get(id);
}

export function expireBookingHolds(db) {
  if (!tableReady(db, "booking_holds")) return 0;
  const now = new Date().toISOString();
  return db.prepare("UPDATE booking_holds SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= ?").run(now).changes;
}

export function consumeBookingHold(db, holdId, bookingId) {
  if (!holdId || !tableReady(db, "booking_holds")) return null;
  const hold = db.prepare("SELECT * FROM booking_holds WHERE id = ?").get(holdId);
  if (!hold || hold.status !== "ACTIVE" || new Date(hold.expires_at).getTime() <= Date.now()) { const e = new Error("Booking hold has expired. Please recheck availability"); e.status = 409; e.code = "HOLD_EXPIRED"; throw e; }
  db.prepare("UPDATE booking_holds SET status='CONSUMED', booking_id=COALESCE(booking_id, ?), consumed_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").run(bookingId, holdId);
  return hold;
}

export function bookingLogistics(db, bookingId) {
  if (!tableReady(db, "booking_logistics")) return null;
  const row = db.prepare("SELECT * FROM booking_logistics WHERE booking_id = ?").get(bookingId);
  if (!row) return null;
  let stops = [];
  try { stops = db.prepare("SELECT * FROM booking_logistics_stops WHERE booking_id = ? ORDER BY itinerary_day").all(bookingId); } catch {}
  return { ...row, snapshot: json(row.snapshot, {}), customPickup: Boolean(row.custom_pickup), needsOpsReview: Boolean(row.needs_ops_review), pendingSupplier: Boolean(row.pending_supplier), stops, events: db.prepare("SELECT * FROM booking_logistics_events WHERE booking_id = ? ORDER BY created_at ASC").all(bookingId) };
}

export { HOLD_MINUTES };
