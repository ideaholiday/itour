import { hasKybFile } from "./kybFileService.js";
import { calculateNameMatchScore } from "./cashfreeSecureIdService.js";
import { resolveCommissionRate } from "./financeService.js";

const ALLOWED_ACTIONS = new Set(["APPROVED", "REJECTED", "SUSPENDED"]);

export const KYB_APPROVAL_SOURCES = Object.freeze({
  ADMIN: "ADMIN",
  CASHFREE_SECUREID: "CASHFREE_SECUREID",
});

// Documents a supplier must upload before an admin can approve them by hand.
export const REQUIRED_KYB_DOCUMENTS = Object.freeze([
  { docType: "COMMERCIAL_TRANSPORT_LICENSE", label: "Commercial Transport License / Permit", acceptedTypes: ["COMMERCIAL_TRANSPORT_LICENSE", "COMMERCIAL_PERMIT"] },
  { docType: "PAN", label: "PAN Card", acceptedTypes: ["PAN"] },
]);

/**
 * KYB documents by the country of the supplier's base city (ADR 022, ADR 023).
 * `required` blocks manual approval until uploaded; `transfersOnly` applies once
 * the supplier lists a transfer. `documentTypes` is what the upload form offers.
 * Only India has Cashfree SecureID checks and automatic approval.
 */
export const KYB_COUNTRY_RULES = Object.freeze({
  India: Object.freeze({
    cashfree: true,
    required: REQUIRED_KYB_DOCUMENTS,
    documentTypes: Object.freeze([
      { docType: "COMMERCIAL_TRANSPORT_LICENSE", label: "Commercial Transport License / Permit" },
      { docType: "GSTIN", label: "GSTIN Certificate" },
      { docType: "PAN", label: "PAN Card (Business / Proprietor)" },
      { docType: "BANK_CANCELLED_CHEQUE", label: "Cancelled Cheque / Bank Passbook" },
      { docType: "TOURISM_LICENSE", label: "Tourism Department Registration" },
      { docType: "CIN", label: "Certificate of Incorporation (CIN), optional" },
      { docType: "OTHER", label: "Other Identity / Trade Document" },
    ]),
  }),
  Thailand: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Company registration certificate (DBD affidavit)", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "TAT tour operator licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Passport or Thai ID of the authorised director", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "Commercial vehicle registration or public transport permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Company registration certificate (DBD affidavit)" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "TAT tour operator licence" },
      { docType: "DIRECTOR_ID", label: "Passport or Thai ID of the authorised director" },
      { docType: "VEHICLE_REGISTRATION", label: "Commercial vehicle registration or public transport permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand; the manager's ID is optional.
  "United Arab Emirates": Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "TRADE_LICENSE", label: "Trade licence", acceptedTypes: ["TRADE_LICENSE"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "DTCM tour operator licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "OWNER_ID", label: "Owner's passport or Emirates ID", acceptedTypes: ["OWNER_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "RTA vehicle permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "TRADE_LICENSE", label: "Trade licence" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "DTCM tour operator licence" },
      { docType: "OWNER_ID", label: "Owner's passport or Emirates ID" },
      { docType: "MANAGER_ID", label: "Manager's passport or Emirates ID (optional)" },
      { docType: "VEHICLE_REGISTRATION", label: "RTA vehicle permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Singapore: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "ACRA BizFile company profile", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "STB travel agent licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Director's passport or NRIC", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "LTA vehicle licence or permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "ACRA BizFile company profile" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "STB travel agent licence" },
      { docType: "DIRECTOR_ID", label: "Director's passport or NRIC" },
      { docType: "VEHICLE_REGISTRATION", label: "LTA vehicle licence or permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Indonesia: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "NIB business registration", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Tourism business licence (TDUP)", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Director's passport or KTP", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "Vehicle registration (STNK) or transport permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "NIB business registration" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Tourism business licence (TDUP)" },
      { docType: "DIRECTOR_ID", label: "Director's passport or KTP" },
      { docType: "VEHICLE_REGISTRATION", label: "Vehicle registration (STNK) or transport permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Maldives: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Business registration certificate", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Ministry of Tourism tour operator or travel agency licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Director's passport or Maldivian ID", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "Vessel or vehicle registration (Transport Authority)", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Business registration certificate" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Ministry of Tourism tour operator or travel agency licence" },
      { docType: "DIRECTOR_ID", label: "Director's passport or Maldivian ID" },
      { docType: "VEHICLE_REGISTRATION", label: "Vessel or vehicle registration (Transport Authority)" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Bhutan: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "TOUR_OPERATOR_LICENSE", label: "Department of Tourism licensed tour operator certificate", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "TRADE_LICENSE", label: "Trade licence", acceptedTypes: ["TRADE_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Director's CID or passport", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "RSTA vehicle registration or permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "TOUR_OPERATOR_LICENSE", label: "Department of Tourism licensed tour operator certificate" },
      { docType: "TRADE_LICENSE", label: "Trade licence" },
      { docType: "DIRECTOR_ID", label: "Director's CID or passport" },
      { docType: "VEHICLE_REGISTRATION", label: "RSTA vehicle registration or permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand. My Number is never asked for.
  Japan: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Certificate of company registration (tōki)", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Travel Agency Registration certificate", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Representative director's passport or residence card", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "Passenger transport business permit (green plate)", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Certificate of company registration (tōki)" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Travel Agency Registration certificate" },
      { docType: "DIRECTOR_ID", label: "Representative director's passport or residence card" },
      { docType: "VEHICLE_REGISTRATION", label: "Passenger transport business permit (green plate)" },
      { docType: "OTHER", label: "Other business document (never My Number)" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Vietnam: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Enterprise Registration Certificate", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "International Travel Service Business Licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "DIRECTOR_ID", label: "Legal representative's passport or CCCD", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "Road transport business licence", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Enterprise Registration Certificate" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "International Travel Service Business Licence" },
      { docType: "DIRECTOR_ID", label: "Legal representative's passport or CCCD" },
      { docType: "VEHICLE_REGISTRATION", label: "Road transport business licence" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
  // ADR 024: approved by an admin by hand.
  Nepal: Object.freeze({
    cashfree: false,
    required: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Company registration certificate (OCR)", acceptedTypes: ["COMPANY_REGISTRATION"] },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Department of Tourism travel or trekking agency licence", acceptedTypes: ["TOUR_OPERATOR_LICENSE"] },
      { docType: "TAX_REGISTRATION", label: "Nepal PAN/VAT registration certificate", acceptedTypes: ["TAX_REGISTRATION"] },
      { docType: "DIRECTOR_ID", label: "Director's citizenship certificate or passport", acceptedTypes: ["DIRECTOR_ID"] },
      { docType: "VEHICLE_REGISTRATION", label: "DoTM vehicle route permit", acceptedTypes: ["VEHICLE_REGISTRATION", "COMMERCIAL_PERMIT"], transfersOnly: true },
    ]),
    documentTypes: Object.freeze([
      { docType: "COMPANY_REGISTRATION", label: "Company registration certificate (OCR)" },
      { docType: "TOUR_OPERATOR_LICENSE", label: "Department of Tourism travel or trekking agency licence" },
      { docType: "TAX_REGISTRATION", label: "Nepal PAN/VAT registration certificate" },
      { docType: "DIRECTOR_ID", label: "Director's citizenship certificate or passport" },
      { docType: "VEHICLE_REGISTRATION", label: "DoTM vehicle route permit" },
      { docType: "OTHER", label: "Other business document" },
    ]),
  }),
});

// A country whose document list isn't set yet: an admin reviews
// whatever the supplier uploaded, but never approves with nothing on file.
const UNLISTED_COUNTRY_RULES = Object.freeze({
  cashfree: false,
  required: Object.freeze([]),
  documentTypes: Object.freeze([
    { docType: "COMPANY_REGISTRATION", label: "Company registration document" },
    { docType: "DIRECTOR_ID", label: "Passport of the authorised director" },
    { docType: "OTHER", label: "Other business document" },
  ]),
});

export const SUPPLIER_KINDS = Object.freeze(["BUSINESS", "INDIVIDUAL_OWNER"]);

/**
 * An individual in India with one or more vehicles and no GSTIN (ADR 024, C1).
 * Aadhaar is uploaded masked: only the last 4 digits may be visible.
 * Admins approve by hand until the Cashfree checks (C3) and auto-approval (C4) land.
 */
export const INDIVIDUAL_OWNER_RULES = Object.freeze({
  cashfree: false,
  required: Object.freeze([
    { docType: "PAN", label: "PAN card", acceptedTypes: ["PAN"] },
    { docType: "AADHAAR_MASKED", label: "Masked Aadhaar (only the last 4 digits visible)", acceptedTypes: ["AADHAAR_MASKED"] },
    { docType: "DRIVING_LICENSE", label: "Commercial driving licence", acceptedTypes: ["DRIVING_LICENSE"] },
    { docType: "VEHICLE_REGISTRATION", label: "Vehicle registration certificate (RC)", acceptedTypes: ["VEHICLE_REGISTRATION"] },
    { docType: "COMMERCIAL_PERMIT", label: "Commercial vehicle permit", acceptedTypes: ["COMMERCIAL_PERMIT", "COMMERCIAL_TRANSPORT_LICENSE"] },
    { docType: "VEHICLE_INSURANCE", label: "Vehicle insurance", acceptedTypes: ["VEHICLE_INSURANCE"] },
    { docType: "BANK_CANCELLED_CHEQUE", label: "Cancelled cheque or bank passbook", acceptedTypes: ["BANK_CANCELLED_CHEQUE"] },
  ]),
  documentTypes: Object.freeze([
    { docType: "PAN", label: "PAN card" },
    { docType: "AADHAAR_MASKED", label: "Masked Aadhaar (only the last 4 digits visible)" },
    { docType: "DRIVING_LICENSE", label: "Commercial driving licence" },
    { docType: "VEHICLE_REGISTRATION", label: "Vehicle registration certificate (RC)" },
    { docType: "COMMERCIAL_PERMIT", label: "Commercial vehicle permit" },
    { docType: "VEHICLE_INSURANCE", label: "Vehicle insurance" },
    { docType: "VEHICLE_FITNESS", label: "Vehicle fitness certificate" },
    { docType: "BANK_CANCELLED_CHEQUE", label: "Cancelled cheque or bank passbook" },
    { docType: "OTHER", label: "Other document" },
  ]),
});

export function isIndividualOwner(supplier) {
  return String(supplier?.supplier_kind || "").toUpperCase() === "INDIVIDUAL_OWNER";
}

/** The KYB rules for this supplier in a country (their own by default): individual owners in India get their own list. */
export function supplierKybRules(database, supplier, country = supplierCountry(database, supplier)) {
  if (country === "India" && isIndividualOwner(supplier)) return INDIVIDUAL_OWNER_RULES;
  return kybRulesFor(country);
}

/** The country of a supplier's base city; India when the city isn't in the catalogue. */
export function supplierCountry(database, supplier) {
  if (!supplier?.city) return "India";
  try {
    return database.prepare("SELECT country FROM destinations WHERE LOWER(name) = LOWER(?) LIMIT 1").get(String(supplier.city).trim())?.country || "India";
  } catch {
    return "India";
  }
}

export function kybRulesFor(country) {
  return KYB_COUNTRY_RULES[country] || UNLISTED_COUNTRY_RULES;
}

/**
 * The vehicle document a supplier must upload before a transfer can go live,
 * or null when none is needed or it is on file. Checked at publication too, so a
 * supplier approved as a tour operator can't sell a transfer without it (ADR 023).
 * The supplier's own country decides: an Indian supplier's transfer abroad needs
 * no foreign vehicle document (owner decision 2026-09-22, ADR 024).
 */
export function missingTransferDocument(database, supplier) {
  const country = supplierCountry(database, supplier);
  const required = supplierKybRules(database, supplier, country).required.find((doc) => doc.transfersOnly);
  if (!required) return null;
  const documents = database.prepare("SELECT doc_type, doc_url FROM kyb_documents WHERE supplier_id = ?").all(supplier.id);
  const uploaded = documents.some((doc) => required.acceptedTypes.includes(normalizeId(doc.doc_type)) && hasKybFile(doc));
  return uploaded ? null : required.label;
}

export function transferDocumentError(label) {
  return `Upload your ${label} in Compliance before publishing a transfer.`;
}

function listsTransfers(database, supplierId) {
  return Boolean(database.prepare("SELECT 1 FROM products WHERE supplier_id = ? AND UPPER(COALESCE(product_type, '')) = 'TRANSFER' LIMIT 1").get(supplierId));
}

export const UPDATE_SUPPLIER_VERIFICATION_SQL = `
  UPDATE suppliers
  SET kyb_status = ?,
      is_verified = ?,
      commission_rate = ?,
      commission_override_rate = COALESCE(?, commission_override_rate),
      kyb_approval_source = COALESCE(?, kyb_approval_source),
      kyb_approved_at = COALESCE(?, kyb_approved_at)
  WHERE id = ?
`;

function verificationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function sqlTimestamp(date = new Date()) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

const normalizeId = (value) => String(value || "").trim().toUpperCase();

// Simulated SecureID answers mark anything valid. They are already refused in
// production by the Cashfree client; this keeps them from approving anyone there.
const simulatedResultsCount = () => process.env.NODE_ENV !== "production";

// The newest Cashfree check of this exact number, so a check of an old GSTIN
// or PAN never vouches for the one on file now.
function latestCheck(database, supplierId, type, inputKey, number) {
  if (!number) return null;
  const rows = database.prepare(`
    SELECT status, input_data, response_data, created_at
    FROM supplier_kyb_verifications
    WHERE supplier_id = ? AND verification_type = ?
    ORDER BY created_at DESC
    LIMIT 25
  `).all(supplierId, type);
  const row = rows.find((candidate) => normalizeId(parseJson(candidate.input_data)[inputKey]) === number);
  if (!row) return null;
  const response = parseJson(row.response_data);
  return {
    valid: String(row.status).toUpperCase() === "VALID" && response.valid !== false,
    simulated: Boolean(response.simulated),
    name: response.legalName || response.registeredName || null,
    checkedAt: row.created_at,
  };
}

/**
 * Whether Cashfree SecureID has verified this supplier's current GSTIN and PAN,
 * and the GSTIN is registered to that PAN (characters 3–12 of a GSTIN are the PAN).
 */
export function getCashfreeIdentityStatus(database, supplier) {
  const gstinNumber = normalizeId(supplier?.gstin);
  const panNumber = normalizeId(supplier?.pan_number);
  const gstin = latestCheck(database, supplier.id, "GSTIN", "gstin", gstinNumber);
  const pan = latestCheck(database, supplier.id, "PAN", "pan", panNumber);
  const allowSimulated = simulatedResultsCount();

  const reasons = [];
  if (!gstinNumber) reasons.push("No GSTIN on file");
  else if (!gstin) reasons.push("GSTIN has not been checked with Cashfree SecureID");
  else if (!gstin.valid) reasons.push("Cashfree SecureID could not verify the GSTIN as active");
  else if (gstin.simulated && !allowSimulated) reasons.push("GSTIN check was simulated, not a real Cashfree result");

  if (!panNumber) reasons.push("No PAN on file");
  else if (!pan) reasons.push("PAN has not been checked with Cashfree SecureID");
  else if (!pan.valid) reasons.push("Cashfree SecureID could not verify the PAN");
  else if (pan.simulated && !allowSimulated) reasons.push("PAN check was simulated, not a real Cashfree result");

  const panMatchesGstin = Boolean(gstinNumber && panNumber && gstinNumber.slice(2, 12) === panNumber);
  if (gstinNumber && panNumber && !panMatchesGstin) reasons.push("The GSTIN is not registered to this PAN");

  return {
    verified: reasons.length === 0,
    gstin: { number: gstinNumber || null, verified: Boolean(gstin?.valid), legalName: gstin?.name || null, checkedAt: gstin?.checkedAt || null, simulated: Boolean(gstin?.simulated) },
    pan: { number: panNumber || null, verified: Boolean(pan?.valid), registeredName: pan?.name || null, checkedAt: pan?.checkedAt || null, simulated: Boolean(pan?.simulated) },
    panMatchesGstin,
    reasons,
  };
}

// Names on the PAN, licence and RC count as the same person at this score or above:
// what one name fully inside the other scores ("Ramesh Kumar" / "RAMESH K").
export const OWNER_NAME_MATCH_MIN = 85;

// The newest valid Cashfree check of a type, with the name it reported.
function latestValidCheck(database, supplierId, type, nameOf) {
  const row = database.prepare(`
    SELECT response_data FROM supplier_kyb_verifications
    WHERE supplier_id = ? AND verification_type = ? AND status = 'VALID'
    ORDER BY created_at DESC LIMIT 1
  `).get(supplierId, type);
  if (!row) return null;
  const response = parseJson(row.response_data);
  return { name: nameOf(response) || null, simulated: Boolean(response.simulated) };
}

/**
 * Whether an individual owner passes every automatic check (ADR 024 C4): Cashfree
 * verified their current PAN, a driving licence and a vehicle RC, the three names
 * are the same person, and every required document is uploaded. Anything failed
 * or missing leaves them for an admin to approve by hand.
 */
export function getOwnerIdentityStatus(database, supplier) {
  const reasons = [];
  const panNumber = normalizeId(supplier?.pan_number);
  const panCheck = latestCheck(database, supplier.id, "PAN", "pan", panNumber);
  const pan = panCheck?.valid ? { name: panCheck.name, simulated: panCheck.simulated } : null;
  const licence = latestValidCheck(database, supplier.id, "DRIVING_LICENSE", (r) => r.name);
  const vehicle = latestValidCheck(database, supplier.id, "VEHICLE_RC", (r) => r.owner);
  const allowSimulated = simulatedResultsCount();
  for (const [label, check] of [["PAN", pan], ["Driving licence", licence], ["Vehicle RC", vehicle]]) {
    if (!check) reasons.push(`${label} has not been verified with Cashfree SecureID`);
    else if (check.simulated && !allowSimulated) reasons.push(`${label} check was simulated, not a real Cashfree result`);
  }
  const names = [pan?.name, licence?.name, vehicle?.name];
  if (pan && licence && vehicle) {
    if (names.some((name) => !name)) reasons.push("Cashfree did not return a name for every check");
    else if (calculateNameMatchScore(names[0], names[1]) < OWNER_NAME_MATCH_MIN || calculateNameMatchScore(names[0], names[2]) < OWNER_NAME_MATCH_MIN) {
      reasons.push("The names on the PAN, driving licence and vehicle RC don't match");
    }
  }
  const documents = database.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ?").all(supplier.id).filter((doc) => hasKybFile(doc));
  for (const required of INDIVIDUAL_OWNER_RULES.required) {
    if (!documents.some((doc) => required.acceptedTypes.includes(normalizeId(doc.doc_type)))) reasons.push(`${required.label} is not uploaded`);
  }
  return { verified: reasons.length === 0, names: { pan: names[0], licence: names[1], vehicle: names[2] }, reasons };
}

/**
 * What an admin needs to decide on a supplier: which of their country's required
 * documents have a real uploaded file and, for Indian suppliers, whether Cashfree
 * has verified their GSTIN and PAN. An admin may approve once either is complete.
 */
export function getKybApprovalReadiness(database, supplier) {
  const country = supplierCountry(database, supplier);
  const rules = supplierKybRules(database, supplier, country);
  const documents = database.prepare("SELECT * FROM kyb_documents WHERE supplier_id = ?").all(supplier.id);
  const withFile = documents.filter((doc) => hasKybFile(doc));
  const transfers = rules.required.some((required) => required.transfersOnly) && listsTransfers(database, supplier.id);
  const requiredDocuments = rules.required.filter((required) => !required.transfersOnly || transfers).map((required) => {
    const uploaded = withFile.find((doc) => required.acceptedTypes.includes(normalizeId(doc.doc_type)));
    return { docType: required.docType, label: required.label, uploaded: Boolean(uploaded), documentId: uploaded?.id || null };
  });
  const missingDocuments = requiredDocuments.filter((doc) => !doc.uploaded).map((doc) => doc.label);
  if (!rules.required.length && !withFile.length) missingDocuments.push(`At least one business document from ${country}`);
  const identity = rules.cashfree ? getCashfreeIdentityStatus(database, supplier) : null;
  return {
    country,
    supplierKind: isIndividualOwner(supplier) ? "INDIVIDUAL_OWNER" : "BUSINESS",
    cashfree: rules.cashfree,
    documentTypes: rules.documentTypes,
    requiredDocuments,
    missingDocuments,
    identity,
    canApprove: missingDocuments.length === 0 || Boolean(identity?.verified),
  };
}

export function saveSupplierVerification(database, {
  supplierId,
  action: requestedAction,
  reason: requestedReason,
  commissionRate,
}) {
  const action = String(requestedAction || "").trim().toUpperCase();
  const reason = String(requestedReason || "").trim();

  if (!ALLOWED_ACTIONS.has(action)) {
    throw verificationError("Action must be APPROVED, REJECTED, or SUSPENDED");
  }
  if (action === "REJECTED" && reason.length < 5) {
    throw verificationError("A specific rejection reason is required");
  }

  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) throw verificationError("Supplier not found", 404);

  if (action === "APPROVED") {
    const readiness = getKybApprovalReadiness(database, supplier);
    if (!readiness.canApprove) {
      throw verificationError(
        `This supplier cannot be approved yet. Missing: ${readiness.missingDocuments.join(", ")}. `
        + (readiness.cashfree ? "Ask them to upload these, or to verify their GSTIN and PAN with Cashfree SecureID." : "Ask them to upload these."),
        409,
      );
    }
  }

  const hasCommissionOverride = commissionRate !== undefined
    && commissionRate !== null
    && String(commissionRate).trim() !== "";
  const resolvedCommission = hasCommissionOverride
    ? Number(commissionRate)
    : Number(supplier.commission_rate ?? 15);

  if (!Number.isFinite(resolvedCommission) || resolvedCommission < 0 || resolvedCommission > 50) {
    throw verificationError("Commission rate must be between 0% and 50%");
  }

  const persistVerification = database.transaction(() => {
    database.prepare(UPDATE_SUPPLIER_VERIFICATION_SQL).run(
      action,
      action === "APPROVED" ? 1 : 0,
      resolvedCommission,
      hasCommissionOverride ? resolvedCommission : null,
      action === "APPROVED" ? KYB_APPROVAL_SOURCES.ADMIN : null,
      action === "APPROVED" ? sqlTimestamp() : null,
      supplierId,
    );

    database.prepare(`
      UPDATE kyb_documents
      SET status = ?, rejection_reason = ?, verified_at = datetime('now')
      WHERE supplier_id = ?
    `).run(
      action === "APPROVED" ? "APPROVED" : "REJECTED",
      action === "APPROVED" ? null : reason || null,
      supplierId,
    );
  });

  persistVerification();

  return {
    supplier: database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId),
    action,
    reason,
    // What the supplier actually pays, which the approval notice quotes.
    commissionRate: resolveCommissionRate(database, supplierId),
  };
}

export const OWNER_AUTO_APPROVAL_REASON = "Your PAN, driving licence and vehicle were verified with Cashfree SecureID. Your published listings can now be booked.";
export const AUTO_APPROVAL_REASON = "Your GSTIN and PAN were verified with Cashfree SecureID. Your published listings can now be booked.";

/**
 * Approves a pending supplier on its own once Cashfree SecureID has verified
 * their GSTIN and PAN. A supplier an admin rejected or suspended is left alone:
 * only an admin can reverse that decision.
 *
 * `notify` receives the same payload as a manual approval notification.
 */
export function autoApproveSupplierKyb(database, supplierId, { notify } = {}) {
  const supplier = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) return { approved: false, supplier: null, identity: null };

  const status = normalizeId(supplier.kyb_status) || "PENDING";
  if (status !== "PENDING") return { approved: false, supplier, identity: null };
  // Individual owners in India pass on PAN, licence, RC and matching names (ADR 024);
  // suppliers abroad are approved by an admin from their documents (ADR 023).
  const owner = isIndividualOwner(supplier) && supplierCountry(database, supplier) === "India";
  if (!owner && !supplierKybRules(database, supplier).cashfree) return { approved: false, supplier, identity: null };

  const identity = owner ? getOwnerIdentityStatus(database, supplier) : getCashfreeIdentityStatus(database, supplier);
  if (!identity.verified) return { approved: false, supplier, identity };

  // The status condition keeps two checks finishing together from approving twice.
  const result = database.prepare(`
    UPDATE suppliers
    SET kyb_status = 'APPROVED', is_verified = 1, kyb_approval_source = ?, kyb_approved_at = ?
    WHERE id = ? AND UPPER(COALESCE(kyb_status, 'PENDING')) IN ('PENDING', '')
  `).run(KYB_APPROVAL_SOURCES.CASHFREE_SECUREID, sqlTimestamp(), supplierId);

  const updated = database.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
  const approved = Number(result.changes) > 0;
  if (approved && notify) {
    notify({ supplier: updated, action: "APPROVED", reason: owner ? OWNER_AUTO_APPROVAL_REASON : AUTO_APPROVAL_REASON, commissionRate: updated.commission_rate });
  }
  return { approved, supplier: updated, identity };
}
