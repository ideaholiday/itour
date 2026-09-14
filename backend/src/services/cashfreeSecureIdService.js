import fs from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../config/logger.js";

const DEFAULT_CLIENT_ID = process.env.CASHFREE_SECUREID_CLIENT_ID || process.env.CASHFREE_APP_ID || "";
const DEFAULT_CLIENT_SECRET = process.env.CASHFREE_SECUREID_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || "";
const DEFAULT_ENV = (process.env.CASHFREE_SECUREID_ENV || process.env.CASHFREE_ENV || "TEST").toUpperCase();
const DEFAULT_API_VERSION = process.env.CASHFREE_SECUREID_API_VERSION || "2024-01-01";
const REQUEST_TIMEOUT_MS = Number(process.env.CASHFREE_SECUREID_TIMEOUT_MS) || 30000;

// Cashfree 422 codes that mean "the bank or network hiccuped", not "the account is bad".
const RETRYABLE_ERROR_CODES = new Set([
  "insufficient_balance",
  "verification_already_under_process",
  "npci_unavailable",
  "connection_timeout",
  "benficiary_bank_offline",
]);

/**
 * Retrieve the Cashfree SecureID RSA Public Key for 2FA signature generation
 */
export function getSecureIdPublicKey() {
  if (process.env.CASHFREE_SECUREID_PUBLIC_KEY) {
    const raw = process.env.CASHFREE_SECUREID_PUBLIC_KEY.trim();
    if (raw.includes("BEGIN PUBLIC KEY")) {
      return raw;
    }
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      if (decoded.includes("BEGIN PUBLIC KEY")) {
        return decoded;
      }
    } catch {}
    return raw;
  }

  const keyPathCandidates = [
    process.env.CASHFREE_SECUREID_PUBLIC_KEY_PATH,
    path.resolve(process.cwd(), "accountId_110283_public_key.pem"),
    path.resolve(process.cwd(), "..", "accountId_110283_public_key.pem"),
    path.resolve(process.cwd(), "backend", "accountId_110283_public_key.pem"),
  ].filter(Boolean);

  for (const candidate of keyPathCandidates) {
    try {
      const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf8");
      }
    } catch {}
  }

  return null;
}

/**
 * Generate cryptographic RSA signature for Cashfree 2FA (Public Key authentication)
 */
export function generate2faSignature(clientId, publicKey = getSecureIdPublicKey()) {
  if (!publicKey || !clientId) return null;
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const data = `${clientId}.${timestamp}`;
    return crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(data, "utf8")
    ).toString("base64");
  } catch (err) {
    logger.warn("Failed to generate Cashfree 2FA signature with public key", { error: err.message });
    return null;
  }
}

const ABBREVIATIONS = {
  pvt: "private",
  ltd: "limited",
  pvtltd: "private limited",
  co: "company",
  corp: "corporation",
  inc: "incorporated",
  svc: "services",
  srv: "services",
  ent: "enterprises",
  assoc: "associates",
  tr: "travels",
  trv: "travels",
  tour: "tours",
};

/**
 * Calculate token similarity ratio (0 to 100) between two business or individual names
 */
export function calculateNameMatchScore(str1 = "", str2 = "") {
  const clean = (s) => {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ABBREVIATIONS[w] || w);
  };

  const words1 = clean(str1);
  const words2 = clean(str2);

  if (!words1.length || !words2.length) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  let matches = 0;
  for (const w of set1) {
    if (set2.has(w)) matches++;
  }

  // Dice coefficient (2 * |A ∩ B| / (|A| + |B|)) * 100
  const dice = (2 * matches) / (set1.size + set2.size);
  let score = Math.round(dice * 100);

  // Substring bonus if one name is fully contained in another
  const full1 = words1.join(" ");
  const full2 = words2.join(" ");
  if (full1.includes(full2) || full2.includes(full1)) {
    score = Math.max(score, 85);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Cashfree returns name_match_score as a string ("100.00", or "" when no name
 * match ran), so Number() alone would turn a skipped match into a score of 0.
 */
function resolveNameMatchScore(raw, providedName, officialName) {
  if (!providedName || !officialName) return 100;
  const reported = Number.parseFloat(raw.name_match_score);
  return Number.isFinite(reported) ? reported : calculateNameMatchScore(providedName, officialName);
}

/**
 * Internal helper to send authenticated requests to Cashfree SecureID API
 */
async function secureIdRequest(path, { method = "POST", body, query } = {}) {
  const clientId = process.env.CASHFREE_SECUREID_CLIENT_ID || DEFAULT_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_SECUREID_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
  const env = (process.env.CASHFREE_SECUREID_ENV || DEFAULT_ENV).toUpperCase();
  const proxyUrl = process.env.CASHFREE_SECUREID_PROXY_URL;
  // The fallback returns VALID for PANs and bank accounts nobody checked, so it
  // must never kick in on production traffic — an un-whitelisted IP or a
  // network blip there has to fail loudly, not mark payout details verified.
  // Cloud Run (K_SERVICE) is live traffic even when NODE_ENV was not set.
  const liveRuntime = process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE);
  const allowSimulation = process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK !== "false" && !liveRuntime;

  // Offline mode: never touch the live API at all. Tests and local development
  // must not depend on a real verification wallet having balance — the fallback
  // below only catches network failures, not an API that answers with an error.
  if (process.env.CASHFREE_SECUREID_SIMULATE === "true") {
    // Simulated verification marks PANs and bank accounts good that nobody
    // checked. In production that is a payout-fraud hole, not a convenience.
    if (liveRuntime) {
      throw new Error("CASHFREE_SECUREID_SIMULATE cannot be used in production");
    }
    return { __simulated: true, ...simulateSecureIdResponse(path, body, query) };
  }

  const isProduction = env === "PROD" || env === "PRODUCTION";
  let baseUrl = isProduction
    ? "https://api.cashfree.com/verification"
    : "https://sandbox.cashfree.com/verification";

  // If a dedicated outbound proxy (e.g. TBO VM 35.244.19.17) is configured, route via proxy endpoint
  if (proxyUrl) {
    baseUrl = proxyUrl.replace(/\/$/, "");
  }

  let fullUrl = `${baseUrl}${path}`;
  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams(query);
    fullUrl += `?${params.toString()}`;
  }

  const headers = {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "Content-Type": "application/json",
  };

  const signature = generate2faSignature(clientId);
  if (signature) {
    headers["x-cf-signature"] = signature;
  }

  try {
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await response.json().catch(() => ({}));

    // If IP validation error occurred and simulation fallback is enabled, simulate response
    if (!response.ok && data?.code === "ip_validation_failed") {
      if (allowSimulation) {
        logger.warn("Cashfree SecureID: IP validation failed (pending whitelisting). Utilizing development simulation fallback.", {
          currentIp: data?.message?.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || "Unknown",
        });
        return { __simulated: true, ...simulateSecureIdResponse(path, body, query) };
      }
      throw new Error(`Cashfree IP Whitelist Required: ${data.message}`);
    }

    if (!response.ok) {
      const errorMsg = data?.message || data?.error?.message || `Cashfree Verification failed with status ${response.status}`;
      // Keep Cashfree's error code so callers can tell "wallet empty"
      // (insufficient_balance) or rate limiting (429) apart from a bad account.
      const error = new Error(errorMsg);
      error.status = response.status;
      error.code = data?.code || null;
      error.type = data?.type || null;
      error.retryable = response.status === 429 || response.status >= 500
        || RETRYABLE_ERROR_CODES.has(data?.code);
      throw error;
    }

    return data;
  } catch (err) {
    if (allowSimulation && (err.message?.includes("IP Whitelist") || err.message?.includes("fetch failed") || err.message?.includes("ENOTFOUND") || err.message?.includes("ECONNREFUSED"))) {
      logger.warn("Cashfree SecureID: Network/IP error encountered. Utilizing simulation fallback.", { error: err.message });
      return { __simulated: true, ...simulateSecureIdResponse(path, body, query) };
    }
    throw err;
  }
}

/**
 * Realistic Mock/Simulation Fixture generator for offline tests & dev environments.
 * Field names mirror Cashfree's documented responses so the parsers below are
 * exercised against the same shape production returns.
 */
function simulateSecureIdResponse(path, body = {}, query = {}) {
  const gstinInput = body.GSTIN || body.gstin;
  const panInput = body.pan || (gstinInput ? gstinInput.slice(2, 12) : "AAACB8781B");
  const businessName = body.business_name || body.name || "Idea Holiday Partner Fleet";
  const bankAcc = body.bank_account || query.bank_account || "91827364512";
  const ifsc = (body.ifsc || query.ifsc || "HDFC0000123").toUpperCase();
  const referenceId = Math.floor(10000000 + Math.random() * 90000000);

  if (path.includes("/gstin") && !path.includes("/pan-gstin")) {
    const isValidGstin = typeof gstinInput === "string" && gstinInput.length === 15;
    return {
      reference_id: referenceId,
      GSTIN: gstinInput,
      valid: isValidGstin,
      message: isValidGstin ? "GSTIN Exists" : "GSTIN Doesn't Exist",
      legal_name_of_business: `${businessName} Private Limited`,
      trade_name_of_business: businessName,
      date_of_registration: "2021-04-15",
      taxpayer_type: "Regular",
      gst_in_status: "Active",
      constitution_of_business: "Private Limited Company",
      center_jurisdiction: "Range-IV, Division-II",
      state_jurisdiction: "Ward 12",
      nature_of_business_activities: ["Transport Services", "Tours and Travels"],
      principal_place_address: "Floor 3, Trade Tower, MG Road Commercial Complex, Bengaluru, Karnataka, 560001",
      principal_place_split_address: {
        building_name: "Floor 3, Trade Tower",
        street: "MG Road Commercial Complex",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
      },
    };
  }

  if (path.includes("/pan-gstin")) {
    return {
      reference_id: referenceId,
      verification_id: body.verification_id,
      pan: panInput,
      status: "SUCCESS",
      gstin_list: [
        { gstin: `29${panInput}1Z5`, state: "Karnataka", status: "Active" },
        { gstin: `27${panInput}1Z8`, state: "Maharashtra", status: "Active" },
      ],
    };
  }

  if (path.includes("/pan")) {
    const isValidPan = typeof panInput === "string" && panInput.length === 10;
    const fourthChar = (panInput && panInput[3]) ? panInput[3].toUpperCase() : "C";
    const panType = fourthChar === "C" ? "Company" : fourthChar === "P" ? "Individual" : fourthChar === "F" ? "Firm" : "Business";

    return {
      reference_id: referenceId,
      pan: panInput,
      valid: isValidPan,
      type: panType,
      registered_name: businessName || "Verified Partner Entity",
      name_provided: body.name || "",
      name_match_score: body.name ? "95.00" : "",
      name_match_result: body.name ? "GOOD_PARTIAL_MATCH" : "",
      pan_status: isValidPan ? "E" : "",
      pan_status_desc: isValidPan ? "Existing and Valid" : "",
      message: isValidPan ? "PAN verified successfully" : "Invalid PAN provided",
    };
  }

  if (path.includes("/bank-account")) {
    const isValidIfsc = typeof ifsc === "string" && ifsc.length === 11;
    const bankName = ifsc.startsWith("HDFC") ? "HDFC Bank" : ifsc.startsWith("ICIC") ? "ICICI Bank" : ifsc.startsWith("SBIN") ? "State Bank of India" : "Commercial Bank of India";
    return {
      reference_id: referenceId,
      name_at_bank: businessName || "Idea Holiday Partner",
      bank_name: bankName,
      name_match_score: body.name ? "96.00" : "",
      name_match_result: body.name ? "DIRECT_MATCH" : "",
      account_status: isValidIfsc ? "VALID" : "INVALID",
      account_status_code: isValidIfsc ? "ACCOUNT_IS_VALID" : "INVALID_IFSC_FAIL",
      utr: `UTR${Date.now()}`,
      ifsc_details: { bank: bankName, ifsc },
    };
  }

  return { valid: true, reference_id: referenceId };
}

/**
 * 1. Verify GSTIN (Goods & Services Tax Identification Number)
 * POST /verification/gstin
 */
export async function verifyGstin({ gstin, businessName } = {}) {
  const sanitizedGstin = String(gstin || "").trim().toUpperCase();
  if (!sanitizedGstin || sanitizedGstin.length !== 15) {
    throw new Error("Valid 15-character GSTIN is required");
  }

  const payload = {
    GSTIN: sanitizedGstin,
    business_name: businessName ? String(businessName).trim() : undefined,
  };

  const raw = await secureIdRequest("/gstin", { method: "POST", body: payload });

  // `valid` only says the GSTIN exists — a cancelled or suspended registration
  // still comes back valid: true, so KYB also requires gst_in_status to be Active.
  const exists = raw.valid === true;
  const reportedStatus = raw.gst_in_status || null;
  const isValid = exists && (!reportedStatus || /^active$/i.test(reportedStatus.trim()));

  const legalName = raw.legal_name_of_business || raw.trade_name_of_business || "";
  const tradeName = raw.trade_name_of_business || legalName;

  return {
    success: true,
    valid: isValid,
    gstin: sanitizedGstin,
    legalName,
    tradeName,
    status: reportedStatus || (exists ? "Active" : "Inactive"),
    taxpayerType: raw.taxpayer_type || "Regular",
    constitution: raw.constitution_of_business || null,
    registrationDate: raw.date_of_registration || null,
    address: raw.principal_place_split_address || raw.principal_place_address || null,
    message: raw.message || null,
    raw,
    simulated: Boolean(raw.__simulated),
  };
}

/**
 * 2. Verify PAN (Permanent Account Number)
 * POST /verification/pan
 */
export async function verifyPan({ pan, name } = {}) {
  const sanitizedPan = String(pan || "").trim().toUpperCase();
  if (!sanitizedPan || sanitizedPan.length !== 10) {
    throw new Error("Valid 10-character PAN is required");
  }

  const payload = {
    pan: sanitizedPan,
    name: name ? String(name).trim() : undefined,
  };

  const raw = await secureIdRequest("/pan", { method: "POST", body: payload });
  const isValid = raw.valid === true;
  const registeredName = raw.registered_name || raw.name_pan_card || "";
  const panType = raw.type || (sanitizedPan[3] === "C" ? "Company" : sanitizedPan[3] === "P" ? "Individual" : "Business");

  return {
    success: true,
    valid: isValid,
    pan: sanitizedPan,
    registeredName,
    type: panType,
    nameMatchScore: resolveNameMatchScore(raw, name, registeredName),
    nameMatchResult: raw.name_match_result || null,
    panStatus: raw.pan_status_desc || raw.pan_status || null,
    status: isValid ? "VALID" : "INVALID",
    raw,
    simulated: Boolean(raw.__simulated),
  };
}

/**
 * 3. Verify Bank Account (Instant Penny-Drop Sync)
 * POST /verification/bank-account/sync
 */
export async function verifyBankAccount({ accountNumber, ifsc, name, phone } = {}) {
  const sanitizedAcc = String(accountNumber || "").trim();
  const sanitizedIfsc = String(ifsc || "").trim().toUpperCase();

  if (!sanitizedAcc || !sanitizedIfsc) {
    throw new Error("Account number and IFSC code are required");
  }

  const payload = {
    bank_account: sanitizedAcc,
    ifsc: sanitizedIfsc,
    name: name ? String(name).trim() : undefined,
    phone: phone ? String(phone).trim() : undefined,
  };

  const raw = await secureIdRequest("/bank-account/sync", { method: "POST", body: payload });
  // account_status is "VALID" | "INVALID"; account_status_code carries the reason
  // (ACCOUNT_BLOCKED, INVALID_IFSC_FAIL, NRE_ACCOUNT_FAIL, ...).
  const isValid = raw.account_status === "VALID";
  const accountHolderName = raw.name_at_bank || "";

  return {
    success: true,
    valid: isValid,
    accountNumber: sanitizedAcc,
    ifsc: sanitizedIfsc,
    // null rather than a placeholder, so callers keep a bank name they already had
    bankName: raw.bank_name || raw.ifsc_details?.bank || null,
    accountHolderName,
    nameMatchScore: resolveNameMatchScore(raw, name, accountHolderName),
    nameMatchResult: raw.name_match_result || null,
    accountStatusCode: raw.account_status_code || null,
    status: isValid ? "VALID" : "INVALID",
    raw,
    simulated: Boolean(raw.__simulated),
  };
}

/**
 * 4. Look up GSTINs associated with a PAN
 * POST /verification/pan-gstin — verification_id is required by Cashfree.
 */
export async function verifyPanToGstin({ pan } = {}) {
  const sanitizedPan = String(pan || "").trim().toUpperCase();
  if (!sanitizedPan || sanitizedPan.length !== 10) {
    throw new Error("Valid 10-character PAN is required");
  }

  const payload = {
    pan: sanitizedPan,
    verification_id: `pg_${sanitizedPan}_${Date.now()}`,
  };

  const raw = await secureIdRequest("/pan-gstin", { method: "POST", body: payload });
  return {
    success: true,
    pan: sanitizedPan,
    found: raw.status !== "GSTIN_NOT_FOUND",
    gstinList: raw.gstin_list || [],
    raw,
    simulated: Boolean(raw.__simulated),
  };
}

/**
 * 5. Comprehensive Multi-Point KYB Verification Routine
 * Executes GSTIN, PAN, and Bank Account validation and records audit logs
 */
export async function runComprehensiveSupplierKyb(database, { supplierId, actorId, actorRole } = {}) {
  if (!supplierId) throw new Error("Supplier ID is required");

  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw new Error("Supplier not found");

  let parsedBank = null;
  try {
    parsedBank = typeof supplier.payout_bank_details === "string"
      ? JSON.parse(supplier.payout_bank_details)
      : supplier.payout_bank_details;
  } catch {}

  const results = {
    supplierId,
    gstin: null,
    pan: null,
    bank: null,
    overallVerified: false,
    verifiedAt: new Date().toISOString(),
  };

  const auditStmt = database.prepare(`
    INSERT INTO supplier_kyb_verifications (
      id, supplier_id, verification_type, reference_id, status, input_data, response_data, score, verified_at, actor_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
  `);

  // 1. Verify GSTIN if present
  if (supplier.gstin && supplier.gstin.trim().length >= 10) {
    try {
      const gstinRes = await verifyGstin({
        gstin: supplier.gstin,
        businessName: supplier.company_name,
      });
      results.gstin = gstinRes;

      const verId = `ver_gst_${Date.now()}`;
      auditStmt.run(
        verId,
        supplierId,
        "GSTIN",
        String(gstinRes.raw?.reference_id || verId),
        gstinRes.valid ? "VALID" : "INVALID",
        JSON.stringify({ gstin: supplier.gstin, companyName: supplier.company_name }),
        JSON.stringify(gstinRes),
        gstinRes.valid ? 100 : 0,
        actorId || null,
        actorRole || "SYSTEM"
      );

      database.prepare(`
        UPDATE suppliers
        SET gstin_verified = ?, gstin_verified_name = ?, gstin_verified_status = ?, kyb_last_verified_at = datetime('now')
        WHERE id = ?
      `).run(gstinRes.valid ? 1 : 0, gstinRes.legalName || null, gstinRes.status || null, supplierId);
    } catch (err) {
      logger.error("KYB GSTIN Check failed", { supplierId, error: err.message });
      results.gstin = { valid: false, error: err.message };
    }
  }

  // 2. Verify PAN if present
  if (supplier.pan_number && supplier.pan_number.trim().length >= 10) {
    try {
      const panRes = await verifyPan({
        pan: supplier.pan_number,
        name: supplier.contact_name || supplier.company_name,
      });
      results.pan = panRes;

      const verId = `ver_pan_${Date.now()}`;
      auditStmt.run(
        verId,
        supplierId,
        "PAN",
        String(panRes.raw?.reference_id || verId),
        panRes.valid ? "VALID" : "INVALID",
        JSON.stringify({ pan: supplier.pan_number }),
        JSON.stringify(panRes),
        panRes.nameMatchScore || 100,
        actorId || null,
        actorRole || "SYSTEM"
      );

      database.prepare(`
        UPDATE suppliers
        SET pan_verified = ?, pan_verified_name = ?, pan_type = ?, kyb_last_verified_at = datetime('now')
        WHERE id = ?
      `).run(panRes.valid ? 1 : 0, panRes.registeredName || null, panRes.type || null, supplierId);
    } catch (err) {
      logger.error("KYB PAN Check failed", { supplierId, error: err.message });
      results.pan = { valid: false, error: err.message };
    }
  }

  // 3. Verify Bank Account if present
  if (parsedBank?.account_number && parsedBank?.ifsc) {
    try {
      const bankRes = await verifyBankAccount({
        accountNumber: parsedBank.account_number,
        ifsc: parsedBank.ifsc,
        name: parsedBank.account_holder || supplier.contact_name || supplier.company_name,
      });
      results.bank = bankRes;

      const verId = `ver_bnk_${Date.now()}`;
      auditStmt.run(
        verId,
        supplierId,
        "BANK_ACCOUNT",
        String(bankRes.raw?.reference_id || verId),
        bankRes.valid ? "VALID" : "INVALID",
        JSON.stringify({ accountNumber: parsedBank.account_number, ifsc: parsedBank.ifsc }),
        JSON.stringify(bankRes),
        bankRes.nameMatchScore || 100,
        actorId || null,
        actorRole || "SYSTEM"
      );

      database.prepare(`
        UPDATE suppliers
        SET bank_verified = ?, bank_verified_name = ?, bank_match_score = ?, kyb_last_verified_at = datetime('now')
        WHERE id = ?
      `).run(bankRes.valid ? 1 : 0, bankRes.accountHolderName || null, bankRes.nameMatchScore || null, supplierId);
    } catch (err) {
      logger.error("KYB Bank Account Check failed", { supplierId, error: err.message });
      results.bank = { valid: false, error: err.message };
    }
  }

  // Determine overall readiness
  const isPanValid = results.pan?.valid !== false;
  const isBankValid = results.bank?.valid !== false;
  results.overallVerified = isPanValid && isBankValid;

  results.updatedSupplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  return results;
}
