import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  calculateNameMatchScore,
  getSecureIdPublicKey,
  generate2faSignature,
  verifyGstin,
  verifyPan,
  verifyBankAccount,
  verifyPanToGstin,
  runComprehensiveSupplierKyb,
} from "../src/services/cashfreeSecureIdService.js";

test("generate2faSignature creates valid base64 RSA OAEP encrypted signature", () => {
  const sampleKey = getSecureIdPublicKey();
  assert.ok(sampleKey, "Public key should be resolved");
  assert.match(sampleKey, /BEGIN PUBLIC KEY/);

  const sig = generate2faSignature("CF1377250DA5VATC6A0HC738FOE30", sampleKey);
  assert.ok(sig, "Signature should be generated");
  assert.equal(typeof sig, "string");
  assert.equal(sig.length > 50, true);

  // When invalid inputs are provided
  assert.equal(generate2faSignature("", sampleKey), null);
  assert.equal(generate2faSignature("CF123", null), null);
});

test("calculateNameMatchScore accurately scores string token similarity", () => {
  assert.equal(calculateNameMatchScore("Idea Holiday Travels Pvt Ltd", "Idea Holiday Travels Private Limited") > 70, true);
  assert.equal(calculateNameMatchScore("Sharma Tour & Travels", "Sharma Tour And Travels") > 80, true);
  assert.equal(calculateNameMatchScore("Sharma Tour", "Completely Different Agency") < 30, true);
  assert.equal(calculateNameMatchScore("", "Sharma Tour"), 0);
});

test("verifyGstin validates and parses GSTIN verification response", async () => {
  process.env.CASHFREE_SECUREID_CLIENT_ID = "CF_TEST_CLIENT_ID";
  process.env.CASHFREE_SECUREID_CLIENT_SECRET = "cf_test_mock_secret_key_123";
  process.env.CASHFREE_SECUREID_ENV = "TEST";
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /verification\/gstin/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-client-id"], "CF_TEST_CLIENT_ID");
    assert.equal(options.headers["x-client-secret"], "cf_test_mock_secret_key_123");

    const body = JSON.parse(options.body);
    assert.equal(body.GSTIN, "29AAACB8781B1ZO");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference_id: 12345,
        GSTIN: "29AAACB8781B1ZO",
        valid: true,
        message: "GSTIN Exists",
        legal_name_of_business: "Idea Holiday Travels Private Limited",
        trade_name_of_business: "Idea Holiday",
        taxpayer_type: "Regular",
        gst_in_status: "Active",
        date_of_registration: "2022-01-10",
        principal_place_split_address: {
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560001",
        },
      }),
    };
  };

  try {
    const result = await verifyGstin({
      gstin: "29AAACB8781B1ZO",
      businessName: "Idea Holiday",
    });

    assert.equal(result.success, true);
    assert.equal(result.valid, true);
    assert.equal(result.gstin, "29AAACB8781B1ZO");
    assert.equal(result.legalName, "Idea Holiday Travels Private Limited");
    assert.equal(result.status, "Active");
    assert.equal(result.taxpayerType, "Regular");
    assert.equal(result.tradeName, "Idea Holiday");
    assert.equal(result.registrationDate, "2022-01-10");
    assert.equal(result.address.city, "Bengaluru");
  } finally {
    global.fetch = originalFetch;
  }
});

test("verifyPan validates PAN and calculates name match score", async () => {
  process.env.CASHFREE_SECUREID_CLIENT_ID = "CF_TEST_CLIENT_ID";
  process.env.CASHFREE_SECUREID_CLIENT_SECRET = "cf_test_mock_secret_key_123";
  process.env.CASHFREE_SECUREID_ENV = "TEST";
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /verification\/pan/);
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.pan, "AAACB8781B");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference_id: 999,
        pan: "AAACB8781B",
        valid: true,
        registered_name: "Idea Holiday Travels Private Limited",
        type: "Company",
        name_match_score: "95.00",
        name_match_result: "GOOD_PARTIAL_MATCH",
      }),
    };
  };

  try {
    const result = await verifyPan({
      pan: "AAACB8781B",
      name: "Idea Holiday Travels",
    });

    assert.equal(result.success, true);
    assert.equal(result.valid, true);
    assert.equal(result.pan, "AAACB8781B");
    assert.equal(result.registeredName, "Idea Holiday Travels Private Limited");
    assert.equal(result.type, "Company");
    assert.equal(result.nameMatchScore, 95);
    assert.equal(result.nameMatchResult, "GOOD_PARTIAL_MATCH");
  } finally {
    global.fetch = originalFetch;
  }
});

test("verifyBankAccount verifies bank account via penny-drop sync", async () => {
  process.env.CASHFREE_SECUREID_CLIENT_ID = "CF_TEST_CLIENT_ID";
  process.env.CASHFREE_SECUREID_CLIENT_SECRET = "cf_test_mock_secret_key_123";

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /verification\/bank-account\/sync/);
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    assert.equal(body.bank_account, "91827364512");
    assert.equal(body.ifsc, "HDFC0000123");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        reference_id: 34,
        name_at_bank: "Idea Holiday Partner",
        bank_name: "HDFC Bank",
        name_match_score: "98.00",
        name_match_result: "DIRECT_MATCH",
        account_status: "VALID",
        account_status_code: "ACCOUNT_IS_VALID",
        utr: "1697548170718",
      }),
    };
  };

  try {
    const result = await verifyBankAccount({
      accountNumber: "91827364512",
      ifsc: "HDFC0000123",
      name: "Idea Holiday Partner",
    });

    assert.equal(result.success, true);
    assert.equal(result.valid, true);
    assert.equal(result.accountNumber, "91827364512");
    assert.equal(result.ifsc, "HDFC0000123");
    assert.equal(result.bankName, "HDFC Bank");
    assert.equal(result.accountHolderName, "Idea Holiday Partner");
    assert.equal(result.nameMatchScore, 98);
    assert.equal(result.accountStatusCode, "ACCOUNT_IS_VALID");
  } finally {
    global.fetch = originalFetch;
  }
});

test("runComprehensiveSupplierKyb performs full multi-point audit and persists records", async () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE suppliers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      pan_number TEXT,
      payout_bank_details TEXT,
      gstin_verified INTEGER DEFAULT 0,
      gstin_verified_name TEXT,
      gstin_verified_status TEXT,
      pan_verified INTEGER DEFAULT 0,
      pan_verified_name TEXT,
      pan_type TEXT,
      bank_verified INTEGER DEFAULT 0,
      bank_verified_name TEXT,
      bank_match_score REAL,
      kyb_last_verified_at TEXT
    );

    CREATE TABLE supplier_kyb_verifications (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      verification_type TEXT NOT NULL,
      reference_id TEXT,
      status TEXT NOT NULL,
      input_data TEXT,
      response_data TEXT,
      score REAL,
      verified_at TEXT,
      actor_id TEXT,
      actor_role TEXT,
      created_at TEXT
    );
  `);

  const supplierId = "sup_test_kyb_1";
  db.prepare(`
    INSERT INTO suppliers (
      id, company_name, contact_name, phone, email, gstin, pan_number, payout_bank_details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplierId,
    "Goa Royal Chauffeurs",
    "Rajesh Naik",
    "9822114455",
    "rajesh@goaroyal.in",
    "30AAACB8781B1ZO",
    "AAACB8781B",
    JSON.stringify({
      account_number: "50200012345678",
      ifsc: "HDFC0000123",
      bank_name: "HDFC Bank",
      account_holder: "Goa Royal Chauffeurs",
    })
  );

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes("/gstin")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          GSTIN: "30AAACB8781B1ZO",
          valid: true,
          legal_name_of_business: "Goa Royal Chauffeurs Pvt Ltd",
          gst_in_status: "Active",
          taxpayer_type: "Regular",
        }),
      };
    }
    if (url.includes("/pan")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pan: "AAACB8781B",
          valid: true,
          registered_name: "Goa Royal Chauffeurs Pvt Ltd",
          type: "Company",
          name_match_score: "95.00",
        }),
      };
    }
    if (url.includes("/bank-account")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          account_status: "VALID",
          account_status_code: "ACCOUNT_IS_VALID",
          bank_name: "HDFC Bank",
          name_at_bank: "Goa Royal Chauffeurs",
          name_match_score: "100.00",
        }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ valid: true }) };
  };

  try {
    const report = await runComprehensiveSupplierKyb(db, {
      supplierId,
      actorId: "admin_tester",
      actorRole: "ADMIN",
    });

    assert.equal(report.supplierId, supplierId);
    assert.equal(report.gstin?.valid, true);
    assert.equal(report.pan?.valid, true);
    assert.equal(report.bank?.valid, true);
    assert.equal(report.overallVerified, true);

    const verifications = db.prepare("SELECT * FROM supplier_kyb_verifications WHERE supplier_id = ?").all(supplierId);
    assert.equal(verifications.length >= 3, true);

    const updatedSupplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId);
    assert.equal(updatedSupplier.gstin_verified, 1);
    assert.equal(updatedSupplier.pan_verified, 1);
    assert.equal(updatedSupplier.bank_verified, 1);
    assert.notEqual(updatedSupplier.kyb_last_verified_at, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("verifyPanToGstin resolves GSTINs registered under PAN", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(url, /verification\/pan-gstin/);
    const body = JSON.parse(options.body);
    assert.equal(body.pan, "AAACB8781B");
    assert.match(body.verification_id, /^[A-Za-z0-9._-]{1,50}$/, "Cashfree requires verification_id");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: "SUCCESS",
        pan: "AAACB8781B",
        gstin_list: [
          { gstin: "29AAACB8781B1ZO", state: "Karnataka", status: "Active" },
          { gstin: "27AAACB8781B1Z2", state: "Maharashtra", status: "Active" },
        ],
      }),
    };
  };

  try {
    const result = await verifyPanToGstin({ pan: "AAACB8781B" });
    assert.equal(result.success, true);
    assert.equal(result.gstinList.length, 2);
    assert.equal(result.found, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("verifyGstin and verifyPan handle API error status safely", async () => {
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "false";
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      message: "GSTIN record not found in central registry",
      code: "gstin_not_found",
    }),
  });

  try {
    await assert.rejects(
      async () => {
        await verifyGstin({ gstin: "29AAACB8781B1ZO" });
      },
      { message: "GSTIN record not found in central registry" }
    );

    await assert.rejects(
      async () => {
        await verifyPan({ pan: "AAACB8781B" });
      },
      { message: "GSTIN record not found in central registry" }
    );
  } finally {
    global.fetch = originalFetch;
    process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";
  }
});

function mockFetchOnce(payload, { ok = true, status = 200 } = {}) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok, status, json: async () => payload });
  return () => { global.fetch = originalFetch; };
}

test("verifyBankAccount reports INVALID when Cashfree says account_status INVALID", async () => {
  const restore = mockFetchOnce({
    reference_id: 35,
    name_at_bank: "",
    account_status: "INVALID",
    account_status_code: "ACCOUNT_BLOCKED",
  });
  try {
    const result = await verifyBankAccount({ accountNumber: "50200012345678", ifsc: "HDFC0000123" });
    assert.equal(result.valid, false);
    assert.equal(result.status, "INVALID");
    assert.equal(result.accountStatusCode, "ACCOUNT_BLOCKED");
    assert.equal(result.bankName, null, "no placeholder bank name that would overwrite a stored one");
  } finally {
    restore();
  }
});

test("verifyGstin does not pass a cancelled GSTIN even though it exists", async () => {
  const restore = mockFetchOnce({
    GSTIN: "29AAACB8781B1ZO",
    valid: true,
    message: "GSTIN Exists",
    legal_name_of_business: "Old Travels Pvt Ltd",
    gst_in_status: "Cancelled",
  });
  try {
    const result = await verifyGstin({ gstin: "29AAACB8781B1ZO" });
    assert.equal(result.valid, false);
    assert.equal(result.status, "Cancelled");
    assert.equal(result.legalName, "Old Travels Pvt Ltd");
  } finally {
    restore();
  }
});

test("an empty name_match_score falls back to local matching instead of scoring 0", async () => {
  const restore = mockFetchOnce({
    pan: "AAACB8781B",
    valid: true,
    registered_name: "Idea Holiday Travels Private Limited",
    name_match_score: "",
  });
  try {
    const result = await verifyPan({ pan: "AAACB8781B", name: "Idea Holiday Travels Pvt Ltd" });
    assert.equal(result.nameMatchScore > 70, true);
  } finally {
    restore();
  }
});

test("API errors keep Cashfree's status and code so callers can tell them apart", async () => {
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "false";
  const restore = mockFetchOnce(
    { type: "validation_error", code: "insufficient_balance", message: "Insufficient balance to process this request." },
    { ok: false, status: 422 }
  );
  try {
    await assert.rejects(
      () => verifyBankAccount({ accountNumber: "50200012345678", ifsc: "HDFC0000123" }),
      (err) => err.status === 422 && err.code === "insufficient_balance" && err.retryable === true
    );
  } finally {
    restore();
    process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";
  }
});

test("simulation fallback never fakes a result in production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";
  const restore = mockFetchOnce(
    { type: "authentication_error", code: "ip_validation_failed", message: "IP not whitelisted: 1.2.3.4" },
    { ok: false, status: 403 }
  );
  const originalFetch = global.fetch;
  try {
    await assert.rejects(() => verifyBankAccount({ accountNumber: "50200012345678", ifsc: "HDFC0000123" }), /IP Whitelist Required/);

    global.fetch = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(() => verifyPan({ pan: "AAACB8781B" }), /fetch failed/);
  } finally {
    global.fetch = originalFetch;
    restore();
    process.env.NODE_ENV = originalNodeEnv;
  }
});
