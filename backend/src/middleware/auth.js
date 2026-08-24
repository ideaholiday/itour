import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { hashPassword } from "../lib/passwords.js";
import { supabase } from "../supabaseClient.js";
import logger from "../config/logger.js";
import { recordAuditEvent } from "../services/auditService.js";

const LOCAL_JWT_SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === "production" ? null : "dev-secret-change-me");
const ROLE_ALIASES = Object.freeze({ USER: "TRAVELER", OPS: "STAFF" });

function normalizeRole(role) {
  const normalized = String(role || "TRAVELER").toUpperCase();
  return ROLE_ALIASES[normalized] || normalized;
}

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

function routeName(req) {
  return req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
}

function authResponse(res, req, status, error, code) {
  return res.status(status).json({ error, code, requestId: req.requestId });
}

function auditDenial(req, reason, database = db) {
  logger.warn("Authorization denied", {
    event: "authorization_denied",
    requestId: req.requestId,
    method: req.method,
    route: routeName(req),
    actorId: req.user?.id || null,
    actorRole: req.user?.role || null,
    reason,
  });
  try {
    recordAuditEvent(database, {
      action: "AUTHORIZATION_DENIED",
      actor: req.user || null,
      resourceType: "API_ROUTE",
      resourceId: routeName(req),
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      outcome: "DENIED",
      metadata: { method: req.method, route: routeName(req), status: req.user ? 403 : 401, reason },
    });
  } catch (error) {
    logger.error("Authorization denial could not be audited", { requestId: req.requestId, error });
  }
}

async function verifySupabaseAccessToken(token, client = supabase) {
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id || !data.user.email) throw new Error("Invalid Supabase session");
  return {
    source: "supabase",
    externalId: data.user.id,
    email: String(data.user.email).trim().toLowerCase(),
    emailVerified: Boolean(data.user.email_confirmed_at || data.user.confirmed_at),
    name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || data.user.email.split("@")[0],
  };
}

function verifyLocalAccessToken(token) {
  if (!LOCAL_JWT_SECRET) throw new Error("Local JWT verification is not configured");
  const decoded = jwt.verify(token, LOCAL_JWT_SECRET, { algorithms: ["HS256"] });
  if (!decoded?.id && !decoded?.email) throw new Error("Invalid local session");
  return {
    source: "local",
    externalId: decoded.id || null,
    email: String(decoded.email || "").trim().toLowerCase(),
    emailVerified: true,
    name: decoded.name || null,
  };
}

export async function verifyAccessToken(token, { supabaseClient = supabase } = {}) {
  const decoded = jwt.decode(token);
  const issuer = String(decoded?.iss || "");
  if (issuer.includes(".supabase.co/auth/v1") || issuer.endsWith("/auth/v1")) {
    return verifySupabaseAccessToken(token, supabaseClient);
  }
  return verifyLocalAccessToken(token);
}

export function resolveDatabasePrincipal(identity, database = db) {
  const email = String(identity.email || "").toLowerCase();
  let user = database.prepare("SELECT id, name, email, role FROM users WHERE id = ? OR LOWER(email) = ? LIMIT 1")
    .get(identity.externalId || "", email);
  const supplierForProvisioning = email && identity.emailVerified
    ? database.prepare("SELECT id, email FROM suppliers WHERE LOWER(email) = ? LIMIT 1").get(email)
    : null;

  if (!user && identity.source === "supabase") {
    const id = identity.externalId;
    const role = supplierForProvisioning ? "SUPPLIER" : "TRAVELER";
    const inaccessiblePassword = hashPassword(randomBytes(32).toString("hex"));
    database.prepare("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)")
      .run(id, String(identity.name || email.split("@")[0] || "Traveler").slice(0, 100), email, inaccessiblePassword, role);
    user = database.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(id);
  }

  if (!user) return null;
  const role = normalizeRole(user.role);
  const supplier = role === "SUPPLIER" && (identity.source !== "supabase" || identity.emailVerified)
    ? database.prepare("SELECT id, email FROM suppliers WHERE LOWER(email) = ? LIMIT 1").get(String(user.email || "").toLowerCase())
    : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    supplier_id: role === "SUPPLIER" ? supplier?.id || null : null,
    auth_source: identity.source,
  };
}

export function createAuthentication({ verifyToken = verifyAccessToken, database = db } = {}) {
  const authenticateRequest = async (req, { optional = false } = {}) => {
    const token = bearerToken(req);
    if (!token) return optional ? null : { error: "Authentication required", code: "AUTH_REQUIRED", status: 401 };
    try {
      const identity = await verifyToken(token);
      const principal = resolveDatabasePrincipal(identity, database);
      if (!principal) return { error: "Account is not recognized", code: "AUTH_REQUIRED", status: 401 };
      return principal;
    } catch (error) {
      logger.warn("Access token rejected", { event: "authentication_failed", requestId: req.requestId, error });
      return optional ? null : { error: "Invalid or expired session", code: "AUTH_REQUIRED", status: 401 };
    }
  };

  return {
    async authenticate(req, res, next) {
      if (req.user) return next();
      const principal = await authenticateRequest(req);
      if (principal?.status) {
        auditDenial(req, principal.code, database);
        return authResponse(res, req, principal.status, principal.error, principal.code);
      }
      req.user = principal;
      return next();
    },
    async optionalAuthenticate(req, _res, next) {
      if (req.user) return next();
      req.user = await authenticateRequest(req, { optional: true });
      return next();
    },
  };
}

const authentication = createAuthentication();
export const authenticate = authentication.authenticate;
export const optionalAuthenticate = authentication.optionalAuthenticate;
export const authMiddleware = authenticate;
export const optionalAuthMiddleware = optionalAuthenticate;
export const authenticateBearer = authenticate;
export const optionalBearer = optionalAuthenticate;

export function requireRoles(...roles) {
  const allowed = new Set(roles.flat().map(normalizeRole));
  return (req, res, next) => {
    if (!req.user) {
      auditDenial(req, "AUTH_REQUIRED");
      return authResponse(res, req, 401, "Authentication required", "AUTH_REQUIRED");
    }
    if (!allowed.has(normalizeRole(req.user.role))) {
      auditDenial(req, "ROLE_FORBIDDEN");
      return authResponse(res, req, 403, "You do not have permission to perform this action", "FORBIDDEN");
    }
    return next();
  };
}

export function requireSupplierSelf(paramName = "id") {
  return (req, res, next) => {
    if (!req.user) {
      auditDenial(req, "AUTH_REQUIRED");
      return authResponse(res, req, 401, "Authentication required", "AUTH_REQUIRED");
    }
    const role = normalizeRole(req.user.role);
    if (["ADMIN", "STAFF"].includes(role)) return next();
    if (role === "SUPPLIER" && req.user.supplier_id && req.user.supplier_id === req.params[paramName]) return next();
    auditDenial(req, "SUPPLIER_SCOPE_FORBIDDEN");
    return authResponse(res, req, 403, "Supplier access is limited to the authenticated account", "FORBIDDEN");
  };
}

export function requireBookingOwner({ paramName = "ref", allowSupplier = false, database = db } = {}) {
  return (req, res, next) => {
    if (!req.user) {
      auditDenial(req, "AUTH_REQUIRED", database);
      return authResponse(res, req, 401, "Authentication required", "AUTH_REQUIRED");
    }
    const reference = req.params?.[paramName]
      || req.body?.bookingId
      || req.body?.bookingRef
      || req.body?.orderId
      || req.query?.order_id;
    const booking = reference
      ? database.prepare("SELECT * FROM bookings WHERE id = ? OR ref = ? OR cashfree_order_id = ? LIMIT 1").get(reference, reference, reference)
      : null;
    if (!booking) return authResponse(res, req, 404, "Booking not found", "NOT_FOUND");

    const role = normalizeRole(req.user.role);
    const privileged = ["ADMIN", "STAFF"].includes(role);
    const supplierOwns = allowSupplier && role === "SUPPLIER" && req.user.supplier_id && req.user.supplier_id === booking.supplier_id;
    const travelerOwns = role === "TRAVELER" && (
      req.user.id === booking.user_id
      || (req.user.email && String(req.user.email).toLowerCase() === String(booking.traveler_email || "").toLowerCase())
    );
    if (!privileged && !supplierOwns && !travelerOwns) {
      auditDenial(req, "BOOKING_SCOPE_FORBIDDEN", database);
      return authResponse(res, req, 403, "You do not have access to this booking", "FORBIDDEN");
    }
    req.authorizedBooking = booking;
    return next();
  };
}

export function requireSchedulerOrRoles(...roles) {
  const roleGuard = requireRoles(...roles);
  return (req, res, next) => {
    const configured = String(process.env.ASSIGNMENT_SCHEDULER_TOKEN || "");
    const supplied = String(req.headers["x-scheduler-token"] || "");
    if (configured && supplied === configured) return next();
    return roleGuard(req, res, next);
  };
}
