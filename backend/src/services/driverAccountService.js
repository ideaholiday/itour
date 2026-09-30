import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { toE164 } from '../lib/phone.js';
import { sendEmail } from './emailService.js';
import { currentDriverAssignment, driverAccessToken } from './dispatchWorkflowService.js';

/**
 * Driver sign-in by email code and the driver's own trip list (ADR 053).
 * A driver is identified by the roster email; typing the mobile number sends
 * the code to the email on file for it. Answers never say whether a login
 * exists.
 */
const CODE_TTL_MS = 10 * 60000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const SESSION_AUDIENCE = 'driver-account';
const PAST_TRIPS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const error = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
function secret() {
  if (!process.env.JWT_SECRET) throw error('Driver sign-in is not configured', 503);
  return process.env.JWT_SECRET;
}
const codeHash = (email, code) => createHmac('sha256', secret()).update(`driver-login:${email}:${code}`).digest('hex');

/** The roster email a login (email or mobile) belongs to, or null when there isn't exactly one. */
export function driverEmailFor(db, login) {
  const value = String(login || '').trim();
  if (value.includes('@')) {
    const email = value.toLowerCase();
    if (!EMAIL.test(email)) return null;
    const known = db.prepare(`SELECT 1 FROM supplier_drivers WHERE LOWER(driver_email) = ?
      UNION SELECT 1 FROM driver_assignments WHERE LOWER(driver_email) = ? LIMIT 1`).get(email, email);
    return known ? email : null;
  }
  const phone = toE164(value);
  if (!phone) return null;
  const emails = db.prepare(`SELECT LOWER(driver_email) AS email FROM supplier_drivers WHERE driver_phone = ? AND driver_email IS NOT NULL AND driver_email <> ''
    UNION SELECT LOWER(driver_email) FROM driver_assignments WHERE driver_phone = ? AND driver_email IS NOT NULL AND driver_email <> ''`).all(phone, phone);
  return emails.length === 1 ? emails[0].email : null;
}

/** Emails a sign-in code when the login is a known driver. Returns whether one was sent, for tests only. */
export async function requestDriverCode(db, login, { send = sendEmail, now = new Date() } = {}) {
  const email = driverEmailFor(db, login);
  if (!email) return { sent: false };
  const recent = db.prepare('SELECT COUNT(*) AS n FROM driver_login_codes WHERE email = ? AND created_at > ?')
    .get(email, new Date(now.getTime() - 3600000).toISOString()).n;
  if (recent >= MAX_CODES_PER_HOUR) return { sent: false };
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('INSERT INTO driver_login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), email, codeHash(email, code), new Date(now.getTime() + CODE_TTL_MS).toISOString(), now.toISOString());
  const body = (shown) => `Your Idea Holiday driver sign-in code is ${shown}. It works once, for 10 minutes. Don't share it with anyone, including your supplier.`;
  await send({ to: email, recipientRole: 'DRIVER', eventType: 'DRIVER_SIGN_IN_CODE', subject: `${code} is your Idea Holiday driver code`, text: body(code), logText: body('******') });
  return { sent: true };
}

/** Checks a code and returns a 30-day driver session. */
export function verifyDriverCode(db, login, code, now = new Date()) {
  const email = driverEmailFor(db, login);
  const row = email && db.prepare('SELECT * FROM driver_login_codes WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1').get(email);
  if (!row || Date.parse(row.expires_at) <= now.getTime()) throw error('This code has expired. Ask for a new one.', 401, 'CODE_EXPIRED');
  if (row.attempts >= MAX_ATTEMPTS) throw error('Too many wrong codes. Ask for a new one.', 429, 'TOO_MANY_ATTEMPTS');
  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(codeHash(email, String(code || '').trim()));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    db.prepare('UPDATE driver_login_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw error('That code is not right. Check the email and try again.', 401, 'WRONG_CODE');
  }
  db.prepare('UPDATE driver_login_codes SET used_at = ? WHERE id = ?').run(now.toISOString(), row.id);
  return jwt.sign({ sub: email }, secret(), { audience: SESSION_AUDIENCE, issuer: 'idea-holiday', expiresIn: '30d' });
}

/** The driver email in a session token. */
export function authenticateDriverAccount(token) {
  try { return jwt.verify(token, secret(), { algorithms: ['HS256'], audience: SESSION_AUDIENCE, issuer: 'idea-holiday' }).sub; }
  catch (err) { throw err.status ? err : error('Please sign in again.', 401); }
}

/** Every trip assigned to this driver email, from any supplier. */
export function driverTrips(db, email, now = new Date()) {
  const rows = db.prepare(`SELECT da.id, da.acknowledgement, da.assignment_status, da.response_deadline, da.completed_at, da.vehicle_model, da.vehicle_number,
      b.ref, b.activity_date, b.pickup_time, b.pickup_location, b.drop_location, b.traveler_name, b.adults, b.children,
      p.title AS product_title, s.company_name AS supplier_name
    FROM driver_assignments da JOIN bookings b ON b.id = da.booking_id
    LEFT JOIN products p ON p.id = b.product_id LEFT JOIN suppliers s ON s.id = da.supplier_id
    WHERE LOWER(da.driver_email) = ? AND da.assignment_status <> 'CANCELLED' AND da.acknowledgement IN ('PENDING', 'ACCEPTED')
      AND LOWER(COALESCE(b.status, '')) <> 'cancelled'
    ORDER BY b.activity_date, b.pickup_time`).all(email);
  const trip = (r) => ({
    assignmentId: r.id, bookingRef: r.ref, tour: r.product_title, supplierName: r.supplier_name,
    date: r.activity_date, pickupTime: r.pickup_time, pickupLocation: r.pickup_location, dropLocation: r.drop_location,
    travelerName: r.traveler_name, passengers: Number(r.adults || 0) + Number(r.children || 0),
    vehicle: [r.vehicle_model, r.vehicle_number].filter(Boolean).join(', '),
    acknowledgement: r.acknowledgement, status: r.assignment_status, responseDeadline: r.response_deadline, completedAt: r.completed_at,
  });
  const waiting = rows.filter(r => r.acknowledgement === 'PENDING' && Date.parse(r.response_deadline) > now.getTime()).map(trip);
  const upcoming = rows.filter(r => r.acknowledgement === 'ACCEPTED' && r.assignment_status !== 'COMPLETED').map(trip);
  const past = rows.filter(r => r.assignment_status === 'COMPLETED').reverse().slice(0, PAST_TRIPS).map(trip);
  return { email, waiting, upcoming, past };
}

/** The private trip-link token for one of this driver's open trips, so the trip page can open it. */
export function driverTripLink(db, email, assignmentId, now = new Date()) {
  const assignment = db.prepare('SELECT * FROM driver_assignments WHERE id = ?').get(String(assignmentId));
  if (!assignment || String(assignment.driver_email || '').toLowerCase() !== email) throw error('Trip not found', 404);
  if (assignment.assignment_status === 'COMPLETED') throw error('This trip is completed', 409);
  try { currentDriverAssignment(db, assignment.id, assignment.revision, now); }
  catch (err) { throw error(err.message, 409); }
  return driverAccessToken(assignment);
}
