import { Router } from "express";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { hashPassword, passwordMatches } from "../lib/passwords.js";
import { authenticate } from "../middleware/auth.js";
import logger from "../config/logger.js";
import { validateBody } from "../middleware/validation.js";
import { authSchemas } from "../validators/apiSchemas.js";

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
  const phone = normalizeText(req.body.phone) || null;
  if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const id = nanoid(10);
  db.prepare("INSERT INTO users (id,name,email,password,phone) VALUES (?,?,?,?,?)")
    .run(id, name, email, hashPassword(password), phone);

  const token = jwt.sign({ id, email, name, role: "TRAVELER" }, SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id, name, email, phone, role: "TRAVELER" } });
});

router.post("/supplier-signup", validateBody(authSchemas.supplierSignup), (req, res) => {
  const companyName = normalizeText(req.body.companyName);
  const contactName = normalizeText(req.body.contactName);
  const email = normalizeEmail(req.body.email);
  const phone = normalizeText(req.body.phone);
  const requestedCity = normalizeText(req.body.city);
  const requestedState = normalizeText(req.body.state);
  const password = String(req.body.password || "");

  if (!companyName || !contactName || !email || !phone || !requestedCity || !requestedState || !password) {
    return res.status(400).json({ error: "All supplier signup fields are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid work email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "Enter a valid mobile number" });
  }

  const approvedCity = db.prepare(`
    SELECT name, state FROM destinations
    WHERE LOWER(name) = LOWER(?) AND LOWER(state) = LOWER(?) AND COALESCE(is_active, 1) = 1
  `).get(requestedCity, requestedState);
  if (!approvedCity) {
    return res.status(400).json({ error: "Choose an approved metro or tourism city" });
  }
  const city = approvedCity.name;
  const state = approvedCity.state;

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
        `INSERT INTO suppliers (id, supplier_code, company_name, contact_name, email, phone, city, state, kyb_status, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0)`
      ).run(supplierId, supplierId, companyName, contactName, email, phone, city, state);

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

  const supplier = user.role === "SUPPLIER" ? db.prepare("SELECT id FROM suppliers WHERE LOWER(email) = ?").get(user.email.toLowerCase()) : null;
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, supplier_id: supplier?.id || null },
    SECRET,
    { expiresIn: "30d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      supplier_id: supplier?.id || null
    }
  });
});

export default router;
