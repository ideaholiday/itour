import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { hashPassword } from "../lib/passwords.js";

/**
 * Supplier staff logins (ADR 036). The supplier's own login is the OWNER; staff
 * are users with role SUPPLIER linked to one supplier in `supplier_members`.
 *
 * Only the owner adds, changes or removes staff. Removing someone deletes the
 * membership and sets the user back to TRAVELER, which keeps their history.
 * The role is read from the database on every request, so a change applies to
 * open sessions immediately.
 */

export const OWNER_ROLE = "OWNER";
export const STAFF_ROLES = Object.freeze(["MANAGER", "FRONT_DESK", "GUIDE"]);

// Areas only the owner may open: money, identity, billing and staff.
const OWNER_ONLY_PATHS = [/^\/kyb(\/|$)/, /^\/payout/, /^\/subscription(\/|$)/, /^\/plans(\/|$)/, /^\/spotlights(\/|$)/, /^\/staff(\/|$)/];

// Front desk and guides are refused anything not listed here.
const OPERATIONS = [
  ["GET", /^\/?$/],
  ["GET", /^\/departures$/],
  ["GET", /^\/manifest$/],
  ["POST", /^\/check-in$/],
  ["PATCH", /^\/bookings\/[^/]+\/attendance$/],
];
const FRONT_DESK = [
  ...OPERATIONS,
  ["GET", /^\/availability(\/check)?$/],
  ["GET", /^\/booking-calendar$/],
  ["POST", /^\/bookings\/quote$/],
  ["POST", /^\/bookings$/],
  ["GET", /^\/bookings\/[^/]+\/payments$/],
  ["POST", /^\/bookings\/[^/]+\/payments$/],
  ["POST", /^\/bookings\/[^/]+\/notifications\/resend$/],
  ["GET", /^\/bookings\/[^/]+\/dispatch-timeline$/],
  ["GET", /^\/notifications$/],
  ["PATCH", /^\/notifications\/[^/]+\/read$/],
  ["POST", /^\/notifications\/read-all$/],
];
const ALLOWED = { FRONT_DESK, GUIDE: OPERATIONS };

function staffError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Whether a supplier role may call `method path`, where path is relative to
 * /api/suppliers/:id. The owner may do everything; a manager everything except
 * the owner-only areas; front desk and guides only their listed endpoints.
 */
export function supplierRoleAllows(role, method, path) {
  if (role === OWNER_ROLE) return true;
  const cleanPath = String(path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (OWNER_ONLY_PATHS.some((pattern) => pattern.test(cleanPath))) return false;
  if (method === "PATCH" && cleanPath === "/profile") return false;
  if (role === "MANAGER") return true;
  const verb = method === "HEAD" ? "GET" : method;
  return (ALLOWED[role] || []).some(([allowedMethod, pattern]) => allowedMethod === verb && pattern.test(cleanPath));
}

/**
 * Capability checks for supplier endpoints outside /api/suppliers/:id
 * (reviews, support, enquiries, channel manager): "manage" is the manager's
 * day-to-day work, "owner" is owner-only.
 */
export function supplierMay(actor, capability) {
  const role = actor?.supplier_role;
  if (!role || role === OWNER_ROLE) return Boolean(actor?.supplier_id);
  if (capability === "manage") return role === "MANAGER";
  return false;
}

/** The supplier a user signs in for, and their role there, or null. */
export function supplierAccessForUser(database, user) {
  if (!user) return null;
  const owned = database.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ? LIMIT 1").get(String(user.email || "").toLowerCase());
  if (owned) return { supplierId: owned.id, role: OWNER_ROLE };
  let member = null;
  try {
    member = database.prepare("SELECT supplier_id, role FROM supplier_members WHERE user_id = ?").get(user.id);
  } catch (error) {
    if (!/no such table|does not exist/i.test(error.message)) throw error;
  }
  return member ? { supplierId: member.supplier_id, role: member.role } : null;
}

/** Readable, 16-character one-time password; shown to the owner once, stored hashed. */
function temporaryPassword() {
  return randomBytes(12).toString("base64url");
}

function memberView(row) {
  return { id: row.user_id, name: row.name, email: row.email, phone: row.phone || null, role: row.role, createdAt: row.created_at };
}

function findMember(database, supplierId, userId) {
  const row = database.prepare(`
    SELECT m.user_id, m.role, m.created_at, u.name, u.email, u.phone FROM supplier_members m
    JOIN users u ON u.id = m.user_id WHERE m.supplier_id = ? AND m.user_id = ?
  `).get(supplierId, userId);
  if (!row) throw staffError(404, "Staff member not found", "STAFF_MEMBER_NOT_FOUND");
  return row;
}

function staffRole(role) {
  const next = String(role || "").toUpperCase();
  if (!STAFF_ROLES.includes(next)) throw staffError(400, "Role must be MANAGER, FRONT_DESK or GUIDE", "INVALID_ROLE");
  return next;
}

export function listStaff(database, supplierId) {
  return database.prepare(`
    SELECT m.user_id, m.role, m.created_at, u.name, u.email, u.phone FROM supplier_members m
    JOIN users u ON u.id = m.user_id WHERE m.supplier_id = ?
    ORDER BY CASE m.role WHEN 'MANAGER' THEN 0 WHEN 'FRONT_DESK' THEN 1 ELSE 2 END, LOWER(u.name)
  `).all(supplierId).map(memberView);
}

/**
 * Add a staff login. An existing traveler account is linked and keeps its own
 * password; a new person gets a temporary password returned exactly once.
 */
export function addStaffMember(database, supplierId, { name, email, phone = null, role }, actor) {
  const nextRole = staffRole(role);
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanPhone = phone ? String(phone).trim() : null;

  return database.transaction(() => {
    const existing = database.prepare("SELECT id, role FROM users WHERE LOWER(email) = ?").get(cleanEmail);
    let userId;
    let password = null;
    if (existing) {
      const currentRole = String(existing.role || "").toUpperCase();
      if (currentRole !== "TRAVELER") {
        throw staffError(409, "This email already has a supplier or IdeaHoliday team account. Use a different email.", "ACCOUNT_IN_USE");
      }
      userId = existing.id;
      database.prepare("UPDATE users SET name = ?, phone = COALESCE(?, phone), role = 'SUPPLIER' WHERE id = ?").run(cleanName, cleanPhone, userId);
    } else {
      userId = `usr_staff_${nanoid(12)}`;
      password = temporaryPassword();
      database.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, 'SUPPLIER')")
        .run(userId, cleanName, cleanEmail, hashPassword(password), cleanPhone);
    }
    database.prepare("INSERT INTO supplier_members (id, supplier_id, user_id, role, created_by_user_id) VALUES (?, ?, ?, ?, ?)")
      .run(`sm_${nanoid(12)}`, supplierId, userId, nextRole, actor?.id || null);
    return { member: memberView(findMember(database, supplierId, userId)), temporaryPassword: password, linkedExistingAccount: Boolean(existing) };
  })();
}

export function updateStaffMember(database, supplierId, userId, { name, phone, role }) {
  const member = findMember(database, supplierId, userId);
  const nextRole = role === undefined ? member.role : staffRole(role);
  database.transaction(() => {
    database.prepare("UPDATE supplier_members SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE supplier_id = ? AND user_id = ?").run(nextRole, supplierId, userId);
    database.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?")
      .run(name === undefined ? member.name : String(name).trim(), phone === undefined ? member.phone : phone, userId);
  })();
  return memberView(findMember(database, supplierId, userId));
}

/** Revoke the login; the account stays as a traveler so its history is kept. */
export function removeStaffMember(database, supplierId, userId) {
  findMember(database, supplierId, userId);
  database.transaction(() => {
    database.prepare("DELETE FROM supplier_members WHERE supplier_id = ? AND user_id = ?").run(supplierId, userId);
    database.prepare("UPDATE users SET role = 'TRAVELER' WHERE id = ?").run(userId);
  })();
  return { id: userId, removed: true };
}

export function resetStaffPassword(database, supplierId, userId) {
  const member = findMember(database, supplierId, userId);
  const password = temporaryPassword();
  database.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(password), userId);
  return { member: memberView(member), temporaryPassword: password };
}
