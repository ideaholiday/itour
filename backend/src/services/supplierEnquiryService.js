import { customAlphabet, nanoid } from "nanoid";
import { containsContactDetails, isProfileVisible } from "./supplierProfileService.js";
import { supplierMay } from "./supplierStaffService.js";

/**
 * Traveler questions to a supplier, sent from the supplier's public profile.
 *
 * The profile shows no phone number or email, so this is the only way to reach
 * a supplier before booking — and it stays on the platform. Neither side sees
 * the other's contact details, and a message that carries a phone number,
 * email, link or WhatsApp handle is refused with an explanation instead of
 * being delivered.
 */

const enquiryError = (message, status = 400) => Object.assign(new Error(message), { status });
const refCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const STATUSES = new Set(["OPEN", "REPLIED", "CLOSED"]);
const CONTACT_REFUSAL = "Messages can't include phone numbers, emails, links or WhatsApp. Keep the conversation on Idea Holiday — contact details are shared with your booking.";

function roleOf(actor) {
  return String(actor?.role || "").toUpperCase();
}

function cleanMessage(value) {
  const message = String(value || "").trim();
  if (message.length < 10) throw enquiryError("Write at least 10 characters");
  if (message.length > 2000) throw enquiryError("Keep your message under 2000 characters");
  if (containsContactDetails(message)) throw enquiryError(CONTACT_REFUSAL);
  return message;
}

function firstName(name) {
  return String(name || "Traveler").trim().split(/\s+/)[0] || "Traveler";
}

function notifySupplier(database, supplierId, { title, message, ref }) {
  database.prepare(`
    INSERT INTO supplier_notifications (id, supplier_id, type, title, message, action_url)
    VALUES (?, ?, 'ENQUIRY', ?, ?, ?)
  `).run(`snotif_${nanoid(12)}`, supplierId, title, message.slice(0, 240), `/supplier/dashboard?panel=enquiries&enquiry=${encodeURIComponent(ref)}`);
}

function isOwnSupplier(database, actor, supplierId) {
  if (actor?.supplier_id && actor.supplier_id === supplierId) return true;
  const supplier = database.prepare("SELECT email FROM suppliers WHERE id = ?").get(supplierId);
  return Boolean(supplier?.email && actor?.email && supplier.email.toLowerCase() === String(actor.email).toLowerCase());
}

/**
 * Opens an enquiry, or adds to the traveler's open one with this supplier so a
 * supplier never gets several parallel threads from the same person.
 */
export function createEnquiry(database, { supplier, actor, message, travelDate = null, travelers = null, today = new Date() }) {
  if (!actor?.id) throw enquiryError("Sign in to send an enquiry", 401);
  if (!supplier || !isProfileVisible(supplier)) throw enquiryError("This operator is not accepting enquiries", 404);
  if (["SUPPLIER", "DRIVER"].includes(roleOf(actor)) || isOwnSupplier(database, actor, supplier.id)) {
    throw enquiryError("Enquiries are for travelers. Sign in with a traveler account.", 403);
  }

  const body = cleanMessage(message);
  let date = null;
  if (travelDate) {
    date = String(travelDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw enquiryError("Travel date must be YYYY-MM-DD");
    if (date < today.toISOString().slice(0, 10)) throw enquiryError("Travel date can't be in the past");
  }
  let partySize = null;
  if (travelers !== null && travelers !== undefined && travelers !== "") {
    partySize = Number(travelers);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) throw enquiryError("Travelers must be between 1 and 100");
  }

  const existing = database.prepare(`
    SELECT * FROM supplier_enquiries WHERE supplier_id = ? AND user_id = ? AND status <> 'CLOSED'
    ORDER BY created_at DESC LIMIT 1
  `).get(supplier.id, actor.id);

  const save = database.transaction(() => {
    let enquiry = existing;
    if (!enquiry) {
      const id = `enq_${nanoid(12)}`;
      database.prepare(`
        INSERT INTO supplier_enquiries (id, enquiry_ref, supplier_id, user_id, travel_date, travelers)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, `ENQ-${refCode()}`, supplier.id, actor.id, date, partySize);
      enquiry = database.prepare("SELECT * FROM supplier_enquiries WHERE id = ?").get(id);
    } else {
      database.prepare(`
        UPDATE supplier_enquiries SET status = 'OPEN', travel_date = COALESCE(?, travel_date), travelers = COALESCE(?, travelers),
          last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
      `).run(date, partySize, enquiry.id);
    }
    database.prepare("INSERT INTO supplier_enquiry_messages (id, enquiry_id, author_role, author_id, message) VALUES (?, ?, 'TRAVELER', ?, ?)")
      .run(`enqm_${nanoid(12)}`, enquiry.id, actor.id, body);
    notifySupplier(database, supplier.id, {
      title: existing ? `New message on ${enquiry.enquiry_ref}` : `New enquiry from ${firstName(actor.name)}`,
      message: body,
      ref: enquiry.enquiry_ref,
    });
    return enquiry.enquiry_ref;
  });

  const ref = save();
  return { enquiry: enquiryThread(database, ref, actor), reused: Boolean(existing) };
}

function loadEnquiry(database, ref) {
  const enquiry = database.prepare(`
    SELECT e.*, s.company_name AS supplier_name, s.public_slug AS supplier_slug, u.name AS traveler_name
    FROM supplier_enquiries e
    JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.enquiry_ref = ?
  `).get(String(ref || "").toUpperCase());
  if (!enquiry) throw enquiryError("Enquiry not found", 404);
  return enquiry;
}

function accessRole(actor, enquiry) {
  const role = roleOf(actor);
  if (["ADMIN", "STAFF"].includes(role)) return "STAFF";
  // Enquiries are manager work; front desk and guides don't see them (ADR 036).
  if (role === "SUPPLIER" && actor.supplier_id === enquiry.supplier_id && supplierMay(actor, "manage")) return "SUPPLIER";
  if (actor?.id && actor.id === enquiry.user_id) return "TRAVELER";
  return null;
}

function summary(enquiry) {
  return {
    ref: enquiry.enquiry_ref,
    status: enquiry.status,
    supplierName: enquiry.supplier_name,
    supplierPath: enquiry.supplier_slug ? `/suppliers/${encodeURIComponent(enquiry.supplier_slug)}` : null,
    // A supplier sees a first name only; the traveler's contact details are not part of an enquiry.
    travelerName: firstName(enquiry.traveler_name),
    travelDate: enquiry.travel_date || null,
    travelers: enquiry.travelers ? Number(enquiry.travelers) : null,
    lastMessage: enquiry.last_message ? String(enquiry.last_message).slice(0, 160) : undefined,
    lastMessageAt: enquiry.last_message_at,
    createdAt: enquiry.created_at,
  };
}

export function enquiryThread(database, ref, actor) {
  const enquiry = loadEnquiry(database, ref);
  if (!accessRole(actor, enquiry)) throw enquiryError("Enquiry not found", 404);
  const messages = database.prepare(`
    SELECT id, author_role, message, created_at FROM supplier_enquiry_messages WHERE enquiry_id = ? ORDER BY created_at ASC, rowid ASC
  `).all(enquiry.id).map((row) => ({ id: row.id, authorRole: row.author_role, message: row.message, createdAt: row.created_at }));
  const { lastMessage, ...rest } = summary(enquiry);
  return { ...rest, messages };
}

function listQuery(database, whereSql, params) {
  return database.prepare(`
    SELECT e.*, s.company_name AS supplier_name, s.public_slug AS supplier_slug, u.name AS traveler_name,
      (SELECT m.message FROM supplier_enquiry_messages m WHERE m.enquiry_id = e.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS last_message
    FROM supplier_enquiries e
    JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE ${whereSql}
    ORDER BY e.last_message_at DESC
    LIMIT 200
  `).all(...params).map(summary);
}

export function listEnquiries(database, actor, { status = null } = {}) {
  const role = roleOf(actor);
  const where = [];
  const params = [];
  if (role === "SUPPLIER") {
    if (!actor.supplier_id || !supplierMay(actor, "manage")) throw enquiryError("Supplier access required", 403);
    where.push("e.supplier_id = ?");
    params.push(actor.supplier_id);
  } else if (["ADMIN", "STAFF"].includes(role)) {
    where.push("1 = 1");
  } else if (actor?.id) {
    where.push("e.user_id = ?");
    params.push(actor.id);
  } else {
    throw enquiryError("Sign in to see enquiries", 401);
  }
  const wanted = String(status || "").toUpperCase();
  if (wanted) {
    if (!STATUSES.has(wanted)) throw enquiryError("Status must be OPEN, REPLIED or CLOSED");
    where.push("e.status = ?");
    params.push(wanted);
  }
  return listQuery(database, where.join(" AND "), params);
}

export function addEnquiryMessage(database, ref, actor, message) {
  const enquiry = loadEnquiry(database, ref);
  const role = accessRole(actor, enquiry);
  if (!role || role === "STAFF") throw enquiryError("Enquiry not found", 404);
  if (enquiry.status === "CLOSED") throw enquiryError("This enquiry is closed. Send a new enquiry from the operator's profile.", 409);
  const body = cleanMessage(message);

  const save = database.transaction(() => {
    database.prepare("INSERT INTO supplier_enquiry_messages (id, enquiry_id, author_role, author_id, message) VALUES (?, ?, ?, ?, ?)")
      .run(`enqm_${nanoid(12)}`, enquiry.id, role, actor.id || null, body);
    database.prepare("UPDATE supplier_enquiries SET status = ?, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(role === "SUPPLIER" ? "REPLIED" : "OPEN", enquiry.id);
    if (role === "TRAVELER") {
      notifySupplier(database, enquiry.supplier_id, { title: `New message on ${enquiry.enquiry_ref}`, message: body, ref: enquiry.enquiry_ref });
    }
  });
  save();
  return enquiryThread(database, enquiry.enquiry_ref, actor);
}

export function closeEnquiry(database, ref, actor) {
  const enquiry = loadEnquiry(database, ref);
  const role = accessRole(actor, enquiry);
  if (!role) throw enquiryError("Enquiry not found", 404);
  database.prepare("UPDATE supplier_enquiries SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?").run(enquiry.id);
  return enquiryThread(database, enquiry.enquiry_ref, actor);
}
