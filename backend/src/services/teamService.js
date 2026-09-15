import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { hashPassword } from "../lib/passwords.js";
import { normalizeWhatsAppPhone } from "./whatsappService.js";

/**
 * The platform team: users with the ADMIN or STAFF role. They sign in at the
 * admin portal and receive booking and operations alerts by email and
 * WhatsApp, so every member needs a reachable WhatsApp number.
 *
 * Removing someone sets their role back to TRAVELER instead of deleting the
 * user, which keeps their booking history. Roles are read from the database on
 * every request, so a change takes effect immediately, even for open sessions.
 */

export const TEAM_ROLES = Object.freeze(["STAFF", "ADMIN"]);

function teamError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function normalizedRole(role) {
  return String(role || "").toUpperCase();
}

/** A WhatsApp-deliverable number as +<country><number>, or an error. */
function teamPhone(value) {
  const digits = normalizeWhatsAppPhone(value);
  if (!digits) throw teamError(400, "Enter a WhatsApp number with country code, for example +91 98765 43210.", "INVALID_PHONE");
  return `+${digits}`;
}

function memberView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: normalizedRole(user.role),
  };
}

function findMember(database, id) {
  const user = database.prepare("SELECT id, name, email, phone, role FROM users WHERE id = ?").get(id);
  if (!user || !TEAM_ROLES.includes(normalizedRole(user.role))) throw teamError(404, "Team member not found", "TEAM_MEMBER_NOT_FOUND");
  return user;
}

function adminCount(database) {
  return Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE UPPER(role) = 'ADMIN'").get().count);
}

/** Readable, 16-character one-time password; shown to the admin once, stored hashed. */
function temporaryPassword() {
  return randomBytes(12).toString("base64url");
}

export function listTeam(database) {
  return database.prepare(`
    SELECT id, name, email, phone, role FROM users
    WHERE UPPER(role) IN ('ADMIN', 'STAFF')
    ORDER BY CASE WHEN UPPER(role) = 'ADMIN' THEN 0 ELSE 1 END, LOWER(name)
  `).all().map(memberView);
}

/**
 * Add a team member. An existing traveler account is promoted and keeps its
 * own password; a new person gets a temporary password returned exactly once.
 */
export function addTeamMember(database, { name, email, phone, role = "STAFF" }) {
  const nextRole = normalizedRole(role);
  if (!TEAM_ROLES.includes(nextRole)) throw teamError(400, "Role must be STAFF or ADMIN", "INVALID_ROLE");
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanPhone = teamPhone(phone);

  const existing = database.prepare("SELECT id, name, email, phone, role FROM users WHERE LOWER(email) = ?").get(cleanEmail);
  if (existing) {
    const currentRole = normalizedRole(existing.role);
    if (TEAM_ROLES.includes(currentRole)) throw teamError(409, "This person is already on the team", "ALREADY_TEAM_MEMBER");
    if (currentRole === "SUPPLIER") throw teamError(409, "This email belongs to a supplier account. Use a different email for team access.", "SUPPLIER_ACCOUNT");
    database.prepare("UPDATE users SET name = ?, phone = ?, role = ? WHERE id = ?").run(cleanName, cleanPhone, nextRole, existing.id);
    return { member: memberView(findMember(database, existing.id)), temporaryPassword: null, promotedExistingAccount: true };
  }

  const id = `usr_team_${nanoid(12)}`;
  const password = temporaryPassword();
  database.prepare("INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, cleanName, cleanEmail, hashPassword(password), cleanPhone, nextRole);
  return { member: memberView(findMember(database, id)), temporaryPassword: password, promotedExistingAccount: false };
}

export function updateTeamMember(database, id, { name, phone, role }, actor) {
  const member = findMember(database, id);
  const nextRole = role === undefined ? normalizedRole(member.role) : normalizedRole(role);
  if (!TEAM_ROLES.includes(nextRole)) throw teamError(400, "Role must be STAFF or ADMIN", "INVALID_ROLE");
  if (normalizedRole(member.role) === "ADMIN" && nextRole !== "ADMIN") {
    if (member.id === actor?.id) throw teamError(409, "You can't remove your own administrator access", "SELF_DEMOTION");
    if (adminCount(database) <= 1) throw teamError(409, "At least one administrator must remain", "LAST_ADMIN");
  }
  const nextName = name === undefined ? member.name : String(name).trim();
  const nextPhone = phone === undefined ? member.phone : teamPhone(phone);
  database.prepare("UPDATE users SET name = ?, phone = ?, role = ? WHERE id = ?").run(nextName, nextPhone, nextRole, member.id);
  return memberView(findMember(database, member.id));
}

/** Revoke team access; the account stays as a traveler so its history is kept. */
export function removeTeamMember(database, id, actor) {
  const member = findMember(database, id);
  if (member.id === actor?.id) throw teamError(409, "You can't remove your own team access", "SELF_REMOVAL");
  if (normalizedRole(member.role) === "ADMIN" && adminCount(database) <= 1) {
    throw teamError(409, "At least one administrator must remain", "LAST_ADMIN");
  }
  database.prepare("UPDATE users SET role = 'TRAVELER' WHERE id = ?").run(member.id);
  return { id: member.id, removed: true };
}

export function resetTeamMemberPassword(database, id) {
  const member = findMember(database, id);
  const password = temporaryPassword();
  database.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(password), member.id);
  return { member: memberView(member), temporaryPassword: password };
}
