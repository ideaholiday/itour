import { Router } from "express";
import { ensureLaunchWaiver } from "../services/supplierSubscriptionService.js";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { hashPassword, passwordMatches } from "../lib/passwords.js";
import { supplierAccessForUser } from "../services/supplierStaffService.js";
import { authenticate } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { toE164 } from "../lib/phone.js";
import { validateBody } from "../middleware/validation.js";
import { authSchemas } from "../validators/apiSchemas.js";
import { establishReferralRelationship } from "../services/referralService.js";
import { ensurePublicSlug } from "../services/supplierProfileService.js";

const router = Router();
const SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === "production" ? null : "dev-secret-change-me");
if (!SECRET) {
  throw new Error("JWT_SECRET must be configured when NODE_ENV=production");
}

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeText = (value) => String(value || "").trim();

router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post("/signup", validateBody(authSchemas.signup), (req, res) => {
  const name = normalizeText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const phone = toE164(req.body.phone) || null;
  const referralCode = normalizeText(req.body.referralCode || req.body.ref);
  const visitorId = normalizeText(req.body.visitorId) || null;

  if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const id = nanoid(10);
  db.prepare("INSERT INTO users (id,name,email,password,phone) VALUES (?,?,?,?,?)")
    .run(id, name, email, hashPassword(password), phone);

  let referral = null;
  try {
    if (visitorId) db.prepare("UPDATE users SET signup_visitor_id = ? WHERE id = ?").run(visitorId.slice(0, 120), id);
    // A typed code wins; with none, the referral link this browser opened is used.
    if (referralCode || visitorId) {
      const result = establishReferralRelationship(db, { referredUserId: id, referralCode: referralCode || null, visitorId, source: "SIGNUP_LINK" });
      referral = result.established ? { referred: true } : null;
    }
  } catch (refErr) {
    logger.warn("Referral tracking error on signup", { error: refErr.message, referralCode });
  }

  const token = jwt.sign({ id, email, name, role: "TRAVELER" }, SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id, name, email, phone, role: "TRAVELER" }, referral });
});

router.post("/supplier-signup", validateBody(authSchemas.supplierSignup), (req, res) => {
  const companyName = normalizeText(req.body.companyName);
  const contactName = normalizeText(req.body.contactName);
  const email = normalizeEmail(req.body.email);
  const phone = toE164(req.body.phone);
  const requestedCity = normalizeText(req.body.city);
  const requestedState = normalizeText(req.body.state);
  const password = String(req.body.password || "");
  const supplierKind = req.body.supplierKind === "INDIVIDUAL_OWNER" ? "INDIVIDUAL_OWNER" : "BUSINESS";

  if (!companyName || !contactName || !email || !phone || !requestedCity || !requestedState || !password) {
    return res.status(400).json({ error: "All supplier signup fields are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid work email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const approvedCity = db.prepare(`
    SELECT name, state, country FROM destinations
    WHERE LOWER(name) = LOWER(?) AND LOWER(state) = LOWER(?) AND COALESCE(is_active, 1) = 1
  `).get(requestedCity, requestedState);
  if (!approvedCity) {
    return res.status(400).json({ error: "Choose an approved metro or tourism city" });
  }
  const city = approvedCity.name;
  const state = approvedCity.state;
  // Individual vehicle owners register in India only (ADR 024).
  if (supplierKind === "INDIVIDUAL_OWNER" && (approvedCity.country || "India") !== "India") {
    return res.status(400).json({ error: "Individual vehicle owners can register in India only. Businesses abroad sign up as a company." });
  }

  const existingUser = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email);
  const existingSupplier = db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(email);
  if (existingUser || existingSupplier) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const userId = `user_${nanoid(12)}`;
  const supplierId = `sup_${nanoid(12)}`;

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, kyb_status, is_verified, supplier_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)`
      ).run(supplierId, supplierId, companyName, contactName, email, phone, city, state, supplierKind);
      ensurePublicSlug(db, { id: supplierId, company_name: companyName, city });
      // A supplier signing up now needs a subscription; the launch waiver covers it for free (ADR 017).
      ensureLaunchWaiver(db, supplierId);

      db.prepare(
        "INSERT INTO users (id, name, email, password, phone, role) VALUES (?, ?, ?, ?, ?, 'SUPPLIER')"
      ).run(userId, contactName, email, hashPassword(password), phone);
    })();

    const token = jwt.sign(
      { id: userId, email, name: contactName, role: "SUPPLIER", supplier_id: supplierId },
      SECRET,
      { expiresIn: "30d" }
    );
    return res.status(201).json({
      token,
      user: {
        id: userId,
        name: contactName,
        email,
        phone,
        role: "SUPPLIER",
        supplier_id: supplierId
      },
      supplier: {
        id: supplierId,
        company_name: companyName,
        kyb_status: "PENDING"
      }
    });
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    logger.error("Supplier signup failed", { requestId: req.requestId, error });
    return res.status(500).json({ error: "Supplier account could not be created" });
  }
});

router.post("/login", validateBody(authSchemas.login), (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Case-insensitive lookup
  const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email);

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isPasswordValid = passwordMatches(password, user.password);

  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (!String(user.password || "").startsWith("scrypt$")) {
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashPassword(password), user.id);
  }

  const portal = String(req.body.portal || req.headers["x-portal-type"] || req.query.portal || "").trim().toLowerCase();

  // Enforce portal-specific role access when specified
  if (portal === "admin" && user.role !== "ADMIN" && user.role !== "STAFF") {
    return res.status(403).json({ error: "Access denied. Admin portal is restricted to platform administrators." });
  }

  if (portal === "supplier" && user.role !== "SUPPLIER") {
    return res.status(403).json({ error: "Access restricted to registered suppliers. Please sign in with your supplier credentials or register on supply.ideaholiday.in." });
  }

  // The owner is linked by email; staff by supplier_members (ADR 036).
  const supplierAccess = user.role === "SUPPLIER" ? supplierAccessForUser(db, user) : null;
  const supplier = supplierAccess ? db.prepare("SELECT id, company_name, kyb_status, is_verified FROM suppliers WHERE id = ?").get(supplierAccess.supplierId) : null;
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, supplier_id: supplier?.id || null },
    SECRET,
    { expiresIn: "30d" }
  );

  let portalRedirect = "/";
  if (user.role === "SUPPLIER") {
    portalRedirect = "/supplier";
  } else if (user.role === "ADMIN") {
    portalRedirect = "/admin";
  } else if (user.role === "STAFF") {
    // Staff work in operations; the admin panel is ADMIN-only.
    portalRedirect = "/ops";
  }

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      supplier_id: supplier?.id || null,
      supplier_role: supplier ? supplierAccess.role : null
    },
    supplier: supplier || null,
    portalRedirect
  });
});

export default router;
