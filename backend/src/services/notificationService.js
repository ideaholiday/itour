import { sendEmail, sendSupplierNotification } from "./emailService.js";
import { normalizeWhatsAppPhone, sendWhatsAppMessage, whatsAppTemplate } from "./whatsappService.js";
import { guestDocumentLinks } from "./guestDocumentService.js";
import logger from "../config/logger.js";

const clean = (value) => String(value || "").trim();

function uniqueRecipients(recipients) {
  const seen = new Set();
  return recipients.filter((recipient) => {
    const key = `${recipient.role}:${clean(recipient.email).toLowerCase()}:${normalizeWhatsAppPhone(recipient.phone) || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(recipient.email || recipient.phone);
  });
}

export function guestNotificationPreferences(database, userId) {
  if (!database || !userId) return { emailEnabled: true, whatsappEnabled: true };
  try {
    const row = database.prepare("SELECT email_enabled, whatsapp_enabled FROM notification_preferences WHERE user_id = ?").get(userId);
    return { emailEnabled: row ? Boolean(row.email_enabled) : true, whatsappEnabled: row ? Boolean(row.whatsapp_enabled) : true };
  } catch {
    return { emailEnabled: true, whatsappEnabled: true };
  }
}

async function sendRecipientChannels({ database, eventType, eventKeyPrefix, recipient, subject, emailText, whatsappText, whatsappTemplate, metadata }) {
  const tasks = [];
  const preferences = recipient.role === "TRAVELER" ? guestNotificationPreferences(database, recipient.id) : { emailEnabled: true, whatsappEnabled: true };
  if (recipient.email && preferences.emailEnabled) {
    tasks.push(sendEmail({
      to: recipient.email,
      recipientName: recipient.name,
      recipientRole: recipient.role,
      recipientId: recipient.id,
      eventType,
      eventKey: `${eventKeyPrefix}:EMAIL:${clean(recipient.email).toLowerCase()}`,
      subject,
      text: emailText,
      metadata,
    }, { database }));
  }
  if (recipient.phone && preferences.whatsappEnabled) {
    tasks.push(sendWhatsAppMessage({
      to: recipient.phone,
      recipientName: recipient.name,
      recipientRole: recipient.role,
      recipientId: recipient.id,
      eventType,
      eventKey: `${eventKeyPrefix}:WHATSAPP:${normalizeWhatsAppPhone(recipient.phone)}`,
      text: whatsappText || emailText,
      template: whatsappTemplate,
      metadata,
    }, { database }));
  }
  return Promise.all(tasks);
}

export function queueNotification(work, label = "notification") {
  Promise.resolve(work).catch((error) => logger.error(`${label} failed`, { error }));
}

export async function notifyBookingConfirmed(database, bookingId) {
  const booking = database.prepare(`
    SELECT b.*, p.title AS product_title, s.company_name AS supplier_name,
      s.contact_name AS supplier_contact_name, s.email AS supplier_email, s.phone AS supplier_phone
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.id = ?
  `).get(bookingId);
  if (!booking) throw new Error("Booking not found for confirmation notification");

  const eventType = "BOOKING_CONFIRMED";
  const common = `Booking ${booking.ref} for ${booking.product_title || booking.product_type} on ${booking.activity_date} at ${booking.pickup_time || "time TBC"}.`;
  const documents = guestDocumentLinks(booking);
  const traveler = {
    id: booking.user_id, role: "TRAVELER", name: booking.traveler_name,
    email: booking.traveler_email, phone: booking.traveler_phone,
  };
  const supplier = {
    id: booking.supplier_id, role: "SUPPLIER", name: booking.supplier_contact_name || booking.supplier_name,
    email: booking.supplier_email, phone: booking.supplier_phone,
  };
  const operations = database.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN', 'STAFF')").all();
  const recipients = uniqueRecipients([traveler, supplier, ...operations.map((user) => ({ ...user, role: String(user.role).toUpperCase() }))]);

  const results = [];
  for (const recipient of recipients) {
    let subject = `Booking ${booking.ref} confirmed`;
    let message = `Hello ${recipient.name || "there"},\n\n${common}\n\nView the latest details in Idea Holiday.`;
    if (recipient.role === "TRAVELER") {
      message = `Hello ${recipient.name || "Traveler"},\n\nYour payment is confirmed. ${common}\nPickup: ${booking.pickup_location}\n\nVoucher: ${documents.voucherUrl}\nInvoice: ${documents.invoiceUrl}\n\nYour supplier is confirming the booking. Your private pickup OTP is available only in My Trips.`;
    } else if (recipient.role === "SUPPLIER") {
      subject = `Action required: accept booking ${booking.ref}`;
      message = `Hello ${recipient.name || "Partner"},\n\nA paid booking has been assigned to you. ${common}\nPickup: ${booking.pickup_location}\nRespond before ${booking.supplier_response_deadline || "the supplier SLA deadline"}.`;
    } else {
      subject = `New paid booking ${booking.ref}`;
      message = `${common}\nSupplier: ${booking.supplier_name || "Pending"}\nTraveler: ${booking.traveler_name}\nMonitor supplier acceptance and dispatch in Operations.`;
    }
    const template = recipient.role === "TRAVELER"
      ? whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED, [booking.ref, booking.product_title || booking.product_type, booking.activity_date, booking.pickup_time, booking.pickup_location, documents.voucherUrl, documents.invoiceUrl])
      : recipient.role === "SUPPLIER"
        ? whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPLIER_ASSIGNMENT, [booking.ref, booking.product_title || booking.product_type, booking.activity_date, booking.pickup_location, booking.supplier_response_deadline])
        : whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_OPS_ALERT, [booking.ref, "New paid booking"]);
    results.push(...await sendRecipientChannels({
      database,
      eventType,
      eventKeyPrefix: `${booking.id}:${eventType}:${recipient.role}:${recipient.id || "external"}`,
      recipient,
      subject,
      emailText: message,
      whatsappText: message,
      whatsappTemplate: template,
      metadata: { bookingId: booking.id, bookingRef: booking.ref },
    }));
  }
  return { eventType, bookingId, attempted: results.length, results };
}

export async function sendGuestBookingNotification(database, bookingId, requestedEventType, { eventKeySuffix = `RESEND_${Date.now()}` } = {}) {
  const booking = database.prepare(`
    SELECT b.*, p.title AS product_title, s.company_name AS supplier_name,
      da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.id = ? OR b.ref = ?
  `).get(bookingId, bookingId);
  if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });

  const eventType = String(requestedEventType || "DOCUMENTS").toUpperCase();
  if (!["BOOKING_CONFIRMED", "DRIVER_ASSIGNED", "DOCUMENTS"].includes(eventType)) {
    throw Object.assign(new Error("Choose booking confirmation, driver details or documents"), { status: 400 });
  }
  if (eventType === "DRIVER_ASSIGNED" && !booking.driver_name) {
    throw Object.assign(new Error("Assign a driver before sending driver details"), { status: 409 });
  }

  const documents = guestDocumentLinks(booking);
  const recipient = {
    id: booking.user_id, role: "TRAVELER", name: booking.traveler_name,
    email: booking.traveler_email, phone: booking.traveler_phone,
  };
  const content = {
    BOOKING_CONFIRMED: {
      subject: `Booking ${booking.ref} confirmed`,
      message: `Hello ${booking.traveler_name || "Traveler"},\n\nYour booking for ${booking.product_title || booking.product_type} on ${booking.activity_date} is confirmed.\nPickup: ${booking.pickup_time || "Time TBC"}, ${booking.pickup_location}.\nVoucher: ${documents.voucherUrl}\nInvoice: ${documents.invoiceUrl}`,
      template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED, [booking.ref, booking.product_title || booking.product_type, booking.activity_date, booking.pickup_time, booking.pickup_location, documents.voucherUrl, documents.invoiceUrl]),
    },
    DRIVER_ASSIGNED: {
      subject: `Driver assigned for booking ${booking.ref}`,
      message: `Hello ${booking.traveler_name || "Traveler"},\n\nDriver ${booking.driver_name} (${booking.driver_phone}) will arrive in ${booking.vehicle_model}, number ${booking.vehicle_number}.\nPickup: ${booking.pickup_time}, ${booking.pickup_location}.\nVoucher: ${documents.voucherUrl}`,
      template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_DRIVER_ASSIGNED, [booking.ref, booking.driver_name, booking.driver_phone, booking.vehicle_model, booking.vehicle_number, booking.pickup_time, booking.pickup_location, documents.voucherUrl]),
    },
    DOCUMENTS: {
      subject: `Voucher and invoice for booking ${booking.ref}`,
      message: `Hello ${booking.traveler_name || "Traveler"},\n\nYour Idea Holiday documents are ready.\nVoucher: ${documents.voucherUrl}\nInvoice: ${documents.invoiceUrl}\n\nThese secure links expire automatically. You can generate new links from My Trips.`,
      template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_BOOKING_DOCUMENTS, [booking.ref, documents.voucherUrl, documents.invoiceUrl]),
    },
  }[eventType];
  const results = await sendRecipientChannels({
    database,
    eventType,
    eventKeyPrefix: `${booking.id}:${eventType}:TRAVELER:${eventKeySuffix}`,
    recipient,
    subject: content.subject,
    emailText: content.message,
    whatsappText: content.message,
    whatsappTemplate: content.template,
    metadata: { bookingId: booking.id, bookingRef: booking.ref, resend: true },
  });
  return { eventType, bookingId: booking.id, bookingRef: booking.ref, attempted: results.length, results };
}

export async function notifyDriverAssigned(database, bookingId) {
  const booking = database.prepare(`
    SELECT b.*, p.title AS product_title, s.company_name AS supplier_name,
      s.contact_name AS supplier_contact_name, s.email AS supplier_email, s.phone AS supplier_phone,
      da.driver_name, da.driver_phone, da.vehicle_model, da.vehicle_number
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.id = ?
  `).get(bookingId);
  if (!booking) throw new Error("Driver assignment not found for notification");

  const documents = guestDocumentLinks(booking);
  const traveler = {
    id: booking.user_id, role: "TRAVELER", name: booking.traveler_name,
    email: booking.traveler_email, phone: booking.traveler_phone,
  };
  const travelerMessage = `Hello ${booking.traveler_name || "Traveler"},\n\nDriver ${booking.driver_name} (${booking.driver_phone}) will arrive in ${booking.vehicle_model}, number ${booking.vehicle_number}.\nPickup: ${booking.pickup_time}, ${booking.pickup_location}.\nVoucher: ${documents.voucherUrl}\n\nCheck the vehicle number before sharing your pickup OTP.`;
  const travelerResults = await sendRecipientChannels({
    database,
    eventType: "DRIVER_ASSIGNED",
    eventKeyPrefix: `${booking.id}:DRIVER_ASSIGNED:TRAVELER:${booking.vehicle_number}`,
    recipient: traveler,
    subject: `Driver assigned for booking ${booking.ref}`,
    emailText: travelerMessage,
    whatsappText: travelerMessage,
    whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_DRIVER_ASSIGNED, [booking.ref, booking.driver_name, booking.driver_phone, booking.vehicle_model, booking.vehicle_number, booking.pickup_time, booking.pickup_location, documents.voucherUrl]),
    metadata: { bookingId: booking.id, bookingRef: booking.ref, vehicleNumber: booking.vehicle_number },
  });
  const driverMessage = await sendWhatsAppMessage({
    to: booking.driver_phone,
    recipientName: booking.driver_name,
    recipientRole: "DRIVER",
    eventType: "DRIVER_ASSIGNED",
    eventKey: `${booking.id}:DRIVER_ASSIGNED:DRIVER:WHATSAPP:${booking.vehicle_number}`,
    text: `Idea Holiday trip ${booking.ref}\nTraveler: ${booking.traveler_name} (${booking.traveler_phone})\nPickup: ${booking.activity_date} ${booking.pickup_time}, ${booking.pickup_location}\nDrop: ${booking.drop_location || "See trip details"}\nVehicle: ${booking.vehicle_number}\n\nAsk for the pickup OTP only after meeting the traveler.`,
    template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_DRIVER_TRIP, [booking.ref, booking.traveler_name, booking.traveler_phone, `${booking.activity_date} ${booking.pickup_time}`, booking.pickup_location, booking.drop_location || "See trip details", booking.vehicle_number]),
    metadata: { bookingId: booking.id, bookingRef: booking.ref, vehicleNumber: booking.vehicle_number },
  }, { database });
  return { eventType: "DRIVER_ASSIGNED", bookingId, results: [...travelerResults, driverMessage] };
}

export async function notifyDispatchStatusChanged(database, bookingId) {
  const booking = database.prepare(`
    SELECT b.*, p.title AS product_title, da.driver_name, da.driver_phone,
      da.vehicle_model, da.vehicle_number, da.assignment_status
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    JOIN driver_assignments da ON da.booking_id = b.id
    WHERE b.id = ?
  `).get(bookingId);
  if (!booking) throw new Error("Dispatch was not found for notification");
  const status = String(booking.assignment_status || "ASSIGNED").toUpperCase();
  const statusMessages = {
    EN_ROUTE: `${booking.driver_name} is on the way in ${booking.vehicle_model}, ${booking.vehicle_number}.`,
    ARRIVED: `${booking.driver_name} has arrived at ${booking.pickup_location}. Check the vehicle plate ${booking.vehicle_number} before sharing your pickup code.`,
    TRIP_STARTED: `Pickup is verified and your trip ${booking.ref} has started.`,
    COMPLETED: `Your trip ${booking.ref} is complete. Thank you for traveling with Idea Holiday. Share a verified experience, supplier and driver rating in My Trips: ${String(process.env.PUBLIC_APP_URL || "https://ideaholiday.in").replace(/\/$/, "")}/bookings`,
  };
  const message = statusMessages[status];
  if (!message) return { eventType: "DISPATCH_STATUS_CHANGED", bookingId, attempted: 0, results: [] };
  const recipient = {
    id: booking.user_id,
    role: "TRAVELER",
    name: booking.traveler_name,
    email: booking.traveler_email,
    phone: booking.traveler_phone,
  };
  const results = await sendRecipientChannels({
    database,
    eventType: `DISPATCH_${status}`,
    eventKeyPrefix: `${booking.id}:DISPATCH_${status}:TRAVELER`,
    recipient,
    subject: `Trip ${booking.ref}: ${status.replaceAll("_", " ").toLowerCase()}`,
    emailText: `Hello ${booking.traveler_name || "Traveler"},\n\n${message}`,
    whatsappText: message,
    whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_TRIP_STATUS, [booking.ref, status.replaceAll("_", " "), message]),
    metadata: { bookingId: booking.id, bookingRef: booking.ref, dispatchStatus: status },
  });
  return { eventType: `DISPATCH_${status}`, bookingId, attempted: results.length, results };
}

export async function notifyRefundProcessed(database, refundId) {
  const refund = database.prepare(`
    SELECT r.*, b.user_id, b.supplier_id, b.traveler_name, b.traveler_email, b.traveler_phone,
      s.company_name AS supplier_name, s.contact_name AS supplier_contact_name,
      s.email AS supplier_email, s.phone AS supplier_phone
    FROM refunds r JOIN bookings b ON b.id = r.booking_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE r.id = ?
  `).get(refundId);
  if (!refund) throw new Error("Refund not found for notification");
  const recipients = uniqueRecipients([
    { id: refund.user_id, role: "TRAVELER", name: refund.traveler_name, email: refund.traveler_email, phone: refund.traveler_phone },
    { id: refund.supplier_id, role: "SUPPLIER", name: refund.supplier_contact_name || refund.supplier_name, email: refund.supplier_email, phone: refund.supplier_phone },
  ]);
  const results = [];
  for (const recipient of recipients) {
    const travelerMessage = Number(refund.refund_amount) > 0
      ? `Cancellation ${refund.booking_ref}: ₹${refund.refund_amount} (${refund.refund_percentage}%) was submitted to the original payment source. Reference: ${refund.gateway_refund_id || "pending"}.`
      : `Cancellation ${refund.booking_ref}: no traveler refund applies under ${refund.policy_tier}.`;
    const supplierMessage = `Booking ${refund.booking_ref} was cancelled. Traveler refund: ₹${refund.refund_amount}. Your adjusted settlement is available in the Supplier Portal.`;
    const message = recipient.role === "TRAVELER" ? travelerMessage : supplierMessage;
    results.push(...await sendRecipientChannels({
      database,
      eventType: "REFUND_STATUS",
      eventKeyPrefix: `${refund.id}:REFUND_STATUS:${recipient.role}`,
      recipient,
      subject: `Cancellation and refund update for ${refund.booking_ref}`,
      emailText: message,
      whatsappText: message,
      whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_REFUND_STATUS, [refund.booking_ref, refund.refund_amount, refund.refund_percentage, refund.gateway_refund_id || "Not applicable"]),
      metadata: { bookingId: refund.booking_id, bookingRef: refund.booking_ref, refundId: refund.id },
    }));
  }
  return { eventType: "REFUND_STATUS", refundId, attempted: results.length, results };
}

export async function notifySupportCaseUpdate(database, caseId, { event = "UPDATED" } = {}) {
  const item = database.prepare(`
    SELECT sc.*, b.ref AS booking_ref, b.user_id, b.traveler_name, b.traveler_email, b.traveler_phone,
      s.contact_name AS supplier_contact_name, s.company_name AS supplier_name,
      s.email AS supplier_email, s.phone AS supplier_phone
    FROM support_cases sc JOIN bookings b ON b.id = sc.booking_id
    LEFT JOIN suppliers s ON s.id = sc.supplier_id WHERE sc.id = ? OR sc.case_ref = ?
  `).get(caseId, caseId);
  if (!item) throw new Error("Support case not found for notification");
  const eventName = String(event).toUpperCase();
  const traveler = { id: item.user_id, role: "TRAVELER", name: item.traveler_name, email: item.traveler_email, phone: item.traveler_phone };
  const supplier = { id: item.supplier_id, role: "SUPPLIER", name: item.supplier_contact_name || item.supplier_name, email: item.supplier_email, phone: item.supplier_phone };
  const operations = database.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN', 'STAFF')").all();
  const operationsRecipients = operations.map((user) => ({ ...user, role: String(user.role).toUpperCase() }));
  const supplierRecipients = ["CANCELLATION", "REFUND_DISPUTE"].includes(item.case_type) ? [supplier] : [];
  const recipients = eventName === "OPENED"
    ? uniqueRecipients([traveler, ...operationsRecipients])
    : eventName === "MESSAGE"
      ? uniqueRecipients([traveler, ...supplierRecipients, ...operationsRecipients])
      : uniqueRecipients([traveler, ...supplierRecipients]);
  const results = [];
  for (const recipient of recipients) {
    const opsMessage = eventName === "OPENED"
      ? `New ${item.priority.toLowerCase()} support case ${item.case_ref} for booking ${item.booking_ref}.\nType: ${item.case_type.replaceAll("_", " ")}\nSubject: ${item.subject}\nFirst response due: ${item.first_response_due_at}.`
      : `New activity on support case ${item.case_ref} for booking ${item.booking_ref}.\nStatus: ${item.status.replaceAll("_", " ")}\nOpen the support desk to review and respond.`;
    const guestMessage = eventName === "OPENED"
      ? `We received support case ${item.case_ref} for booking ${item.booking_ref}. Priority: ${item.priority}. Our team will respond by ${item.first_response_due_at}.`
      : `Support case ${item.case_ref} for booking ${item.booking_ref} is now ${item.status.replaceAll("_", " ")}.${item.resolution ? `\nResolution: ${item.resolution}` : ""}${item.approved_refund_percentage !== null && item.approved_refund_percentage !== undefined ? `\nApproved refund: ${item.approved_refund_percentage}%` : ""}`;
    const message = ["ADMIN", "STAFF"].includes(recipient.role) ? opsMessage : guestMessage;
    results.push(...await sendRecipientChannels({
      database,
      eventType: `SUPPORT_CASE_${eventName}`,
      eventKeyPrefix: `${item.id}:SUPPORT_CASE_${eventName}:${recipient.role}:${recipient.id || "external"}:${item.updated_at}`,
      recipient,
      subject: `${eventName === "OPENED" ? "New" : "Update for"} support case ${item.case_ref}`,
      emailText: message,
      whatsappText: message,
      whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPORT_CASE, [item.case_ref, item.booking_ref, item.status, item.resolution || "Update available in your account"]),
      metadata: { bookingId: item.booking_id, bookingRef: item.booking_ref, caseId: item.id, caseRef: item.case_ref },
    }));
  }
  return { eventType: `SUPPORT_CASE_${eventName}`, caseId: item.id, attempted: results.length, results };
}

export async function notifySettlementProcessed(database, batchId) {
  const batch = database.prepare(`
    SELECT pb.*, s.contact_name, s.company_name, s.email, s.phone
    FROM payout_batches pb JOIN suppliers s ON s.id = pb.supplier_id WHERE pb.id = ?
  `).get(batchId);
  if (!batch) throw new Error("Settlement not found for notification");
  const recipient = { id: batch.supplier_id, role: "SUPPLIER", name: batch.contact_name || batch.company_name, email: batch.email, phone: batch.phone };
  const message = `Settlement ${batch.batch_ref} for ₹${batch.net_amount} covering ${batch.payout_count} payout${batch.payout_count === 1 ? "" : "s"} was processed. Provider reference: ${batch.provider_batch_id}.`;
  const results = await sendRecipientChannels({
    database,
    eventType: "SUPPLIER_SETTLEMENT_PROCESSED",
    eventKeyPrefix: `${batch.id}:SUPPLIER_SETTLEMENT_PROCESSED`,
    recipient,
    subject: `Supplier settlement ${batch.batch_ref} processed`,
    emailText: message,
    whatsappText: message,
    whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_PAYOUT_STATUS, [batch.batch_ref, batch.net_amount, batch.payout_count, batch.provider_batch_id]),
    metadata: { batchId: batch.id, batchRef: batch.batch_ref, supplierId: batch.supplier_id },
  });
  return { eventType: "SUPPLIER_SETTLEMENT_PROCESSED", batchId, attempted: results.length, results };
}

export async function notifyAssignmentUpdate(database, bookingId, update) {
  const booking = database.prepare(`
    SELECT b.*, p.title AS product_title, s.company_name AS supplier_name,
      s.contact_name AS supplier_contact_name, s.email AS supplier_email, s.phone AS supplier_phone
    FROM bookings b
    LEFT JOIN products p ON p.id = b.product_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.id = ?
  `).get(bookingId);
  if (!booking) throw new Error("Booking not found for assignment notification");

  if (update.replacement || update.status === "AWAITING_ACCEPTANCE") {
    const recipient = {
      id: booking.supplier_id, role: "SUPPLIER", name: booking.supplier_contact_name || booking.supplier_name,
      email: booking.supplier_email, phone: booking.supplier_phone,
    };
    return sendRecipientChannels({
      database,
      eventType: "SUPPLIER_ASSIGNMENT",
      eventKeyPrefix: `${booking.id}:SUPPLIER_ASSIGNMENT:ROUND_${booking.assignment_round || 1}`,
      recipient,
      subject: `Action required: booking ${booking.ref}`,
      emailText: `A paid ${booking.product_title || booking.product_type} booking is assigned to you.\nTravel: ${booking.activity_date} ${booking.pickup_time}.\nPickup: ${booking.pickup_location}.\nRespond before ${booking.supplier_response_deadline}.`,
      whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPLIER_ASSIGNMENT, [booking.ref, booking.product_title || booking.product_type, booking.activity_date, booking.pickup_location, booking.supplier_response_deadline]),
      metadata: { bookingId: booking.id, bookingRef: booking.ref, assignmentRound: booking.assignment_round },
    });
  }

  if (update.status === "SUPPLIER_ACCEPTED") {
    const traveler = { id: booking.user_id, role: "TRAVELER", name: booking.traveler_name, email: booking.traveler_email, phone: booking.traveler_phone };
    return sendRecipientChannels({
      database,
      eventType: "SUPPLIER_ACCEPTED",
      eventKeyPrefix: `${booking.id}:SUPPLIER_ACCEPTED`,
      recipient: traveler,
      subject: `Supplier confirmed booking ${booking.ref}`,
      emailText: `Hello ${booking.traveler_name},\n\n${booking.supplier_name} accepted your booking. Driver and vehicle details will be shared before pickup.`,
      whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPLIER_ACCEPTED, [booking.ref, booking.supplier_name]),
      metadata: { bookingId: booking.id, bookingRef: booking.ref },
    });
  }

  if (update.status === "MANUAL_REVIEW_REQUIRED") {
    const operations = database.prepare("SELECT id, name, email, phone, role FROM users WHERE UPPER(role) IN ('ADMIN', 'STAFF')").all();
    const results = [];
    for (const user of operations) {
      results.push(...await sendRecipientChannels({
        database,
        eventType: "ASSIGNMENT_MANUAL_REVIEW",
        eventKeyPrefix: `${booking.id}:ASSIGNMENT_MANUAL_REVIEW:${user.id}`,
        recipient: { ...user, role: String(user.role).toUpperCase() },
        subject: `Supplier assignment failed for ${booking.ref}`,
        emailText: `No eligible supplier remained for booking ${booking.ref}. Open Operations and assign a supplier manually.`,
        whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_OPS_ALERT, [booking.ref, "Supplier assignment requires manual review"]),
        metadata: { bookingId: booking.id, bookingRef: booking.ref },
      }));
    }
    return results;
  }
  return [];
}

export async function notifySupplierVerification({ supplier, action, reason, commissionRate }) {
  let email;
  try {
    email = await sendSupplierNotification({
      supplierEmail: supplier.email,
      supplierName: supplier.contact_name || supplier.company_name,
      action,
      reason,
      details: { commissionRate },
    });
  } catch (error) {
    logger.error("Supplier verification email failed", { error });
    email = { success: false, status: "FAILED", error: error?.message || "Email delivery failed" };
  }

  let whatsapp;
  try {
    whatsapp = await sendWhatsAppMessage({
      to: supplier.phone,
      recipientName: supplier.contact_name || supplier.company_name,
      recipientRole: "SUPPLIER",
      recipientId: supplier.id,
      eventType: `SUPPLIER_${action}`,
      eventKey: `${supplier.id}:SUPPLIER_${action}:WHATSAPP`,
      text: `Idea Holiday supplier account update\n\nStatus: ${action}\n${reason ? `Reason: ${reason}\n` : ""}Sign in to the Supplier Portal for details.`,
      template: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_SUPPLIER_STATUS, [action, reason || "Open the Supplier Portal for details"]),
      metadata: { supplierId: supplier.id, action },
    });
  } catch (error) {
    logger.error("Supplier verification WhatsApp failed", { error });
    whatsapp = { success: false, status: "FAILED", error: error?.message || "WhatsApp delivery failed" };
  }
  return { email, whatsapp, success: email.success || whatsapp.success };
}

export async function notifyProductPublished(database, productId) {
  const product = database.prepare(`
    SELECT p.id, p.title, p.supplier_id, s.company_name, s.contact_name, s.email, s.phone
    FROM products p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(productId);
  if (!product) throw new Error("Published product was not found for notification");

  const recipient = {
    id: product.supplier_id,
    role: "SUPPLIER",
    name: product.contact_name || product.company_name,
    email: product.email,
    phone: product.phone,
  };
  const message = `Hello ${recipient.name || "Partner"},\n\nYour listing “${product.title}” has been approved and is now live on the Idea Holiday marketplace.\n\nOpen the Supplier Portal to review its visibility and booking settings.`;
  const results = await sendRecipientChannels({
    database,
    eventType: "PRODUCT_PUBLISHED",
    eventKeyPrefix: `${product.id}:PRODUCT_PUBLISHED:${Date.now()}`,
    recipient,
    subject: `Your listing “${product.title}” is now live`,
    emailText: message,
    whatsappText: message,
    whatsappTemplate: whatsAppTemplate(process.env.WHATSAPP_TEMPLATE_PRODUCT_PUBLISHED, [product.title]),
    metadata: { productId: product.id, supplierId: product.supplier_id },
  });
  return { eventType: "PRODUCT_PUBLISHED", productId, attempted: results.length, results };
}
