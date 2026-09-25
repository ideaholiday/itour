import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  calculateNameMatchScore,
  secureIdDate,
  verifyDrivingLicence,
  verifyVehicleRc,
  getSecureIdPublicKey,
  generate2faSignature,
  verifyGstin,
  verifyPan,
  verifyBankAccount,
  verifyPanToGstin,
  runComprehensiveSupplierKyb,
} from "../src/services/cashfreeSecureIdService.js";
import { migratedDb } from "./helpers/migratedDb.js";

test("generate2faSignature creates valid base64 RSA OAEP encrypted signature", (t) => {
  // The real Cashfree key file is git-ignored, so use a generated key: the test
  // must pass on a fresh clone and in CI.
  const previousKey = process.env.CASHFREE_SECUREID_PUBLIC_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.CASHFREE_SECUREID_PUBLIC_KEY;
    else process.env.CASHFREE_SECUREID_PUBLIC_KEY = previousKey;
  });
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.CASHFREE_SECUREID_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });

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

test("simulation fallback is off on Cloud Run even when NODE_ENV is unset", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalService = process.env.K_SERVICE;
  delete process.env.NODE_ENV;
  process.env.K_SERVICE = "idea-holiday-marketplace";
  process.env.CASHFREE_SECUREID_SIMULATION_FALLBACK = "true";
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => { throw new TypeError("fetch failed"); };
    await assert.rejects(() => verifyPan({ pan: "AAACB8781B" }), /fetch failed/);
  } finally {
    global.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalService === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = originalService;
  }
});

// Sets env vars for one test body (undefined deletes), then restores them.
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  const apply = (values) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(saved);
  }
}

// Replaces fetch for one test body, recording each call; restores it afterwards.
async function withFetch(handler, fn) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: options?.body ? JSON.parse(options.body) : undefined });
    return handler(url, options);
  };
  try {
    await fn(calls);
  } finally {
    global.fetch = originalFetch;
  }
}

const respond = (payload, { ok = true, status = 200 } = {}) => async () => ({ ok, status, json: async () => payload });
const DEV = { NODE_ENV: "test", K_SERVICE: undefined, CASHFREE_SECUREID_SIMULATE: undefined, CASHFREE_SECUREID_PROXY_URL: undefined, CASHFREE_SECUREID_ENV: "TEST" };
const LIVE_ONLY = { ...DEV, CASHFREE_SECUREID_SIMULATION_FALLBACK: "false" };

test("the public key is read as PEM, as base64 PEM, raw, or from a key file", async () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" });
  await withEnv({ CASHFREE_SECUREID_PUBLIC_KEY: Buffer.from(pem).toString("base64") }, () => {
    assert.equal(getSecureIdPublicKey(), pem);
  });
  await withEnv({ CASHFREE_SECUREID_PUBLIC_KEY: "  not-a-key  " }, () => {
    assert.equal(getSecureIdPublicKey(), "not-a-key");
    assert.equal(generate2faSignature("CF123", "not-a-key"), null);
  });
  const keyFile = path.join(mkdtempSync(path.join(tmpdir(), "cf-key-")), "public.pem");
  writeFileSync(keyFile, pem);
  await withEnv({ CASHFREE_SECUREID_PUBLIC_KEY: undefined, CASHFREE_SECUREID_PUBLIC_KEY_PATH: keyFile }, () => {
    assert.equal(getSecureIdPublicKey(), pem);
  });
});

test("Cashfree dates are read as ISO or day-first, and anything else is null", () => {
  assert.equal(secureIdDate("2031-01-09T00:00:00Z"), "2031-01-09");
  assert.equal(secureIdDate(" 23/12/2036 "), "2036-12-23");
  assert.equal(secureIdDate("23-12-2036"), "2036-12-23");
  assert.equal(secureIdDate("12/2036"), null);
  assert.equal(secureIdDate(null), null);
});

test("a driving licence check refuses short numbers and bad birth dates before calling Cashfree", async () => {
  await withFetch(() => { throw new Error("must not be called"); }, async (calls) => {
    await assert.rejects(() => verifyDrivingLicence({ licenseNumber: "DL-12 3", dob: "1990-01-09" }), /full driving licence number/);
    await assert.rejects(() => verifyDrivingLicence({ licenseNumber: "MH1220180012345", dob: "09-01-1990" }), /YYYY-MM-DD/);
    await assert.rejects(() => verifyDrivingLicence(), /full driving licence number/);
    await assert.rejects(() => verifyVehicleRc({ registrationNumber: "MH 12" }), /full vehicle registration number/);
    assert.equal(calls.length, 0);
  });
});

test("a driving licence is read from either of Cashfree's response shapes", async () => {
  await withEnv(LIVE_ONLY, async () => {
    const current = { status: "VALID", details_of_driving_licence: { name: "Ramesh K" }, dl_validity: { transport: { to: "09/01/2031" }, non_transport: { to: "2038-01-09" } } };
    await withFetch(respond(current), async (calls) => {
      const result = await verifyDrivingLicence({ licenseNumber: "mh 12-2018 0012345", dob: "1990-01-09" });
      assert.deepEqual([result.valid, result.licenseNumber, result.name, result.validUntil, result.simulated], [true, "MH1220180012345", "Ramesh K", "2031-01-09", false]);
      assert.match(calls[0].url, /\/driving-license$/);
      assert.equal(calls[0].body.dl_number, "MH1220180012345");
      assert.equal(calls[0].body.dob, "1990-01-09");
      assert.match(calls[0].body.verification_id, /^dl_/);
    });
    const older = { verification_status: "SUCCESS", license_details: { name: "Asha", validity_date: "15-03-2030" } };
    await withFetch(respond(older), async () => {
      const result = await verifyDrivingLicence({ licenseNumber: "KA0120150001234", dob: "1985-05-05" });
      assert.deepEqual([result.valid, result.name, result.validUntil], [true, "Asha", "2030-03-15"]);
    });
    await withFetch(respond({ status: "VALID", name: "Top Level", dl_validity: { non_transport: { to: "2038-01-09" } } }), async () => {
      const result = await verifyDrivingLicence({ licenseNumber: "KA0120150001234", dob: "1985-05-05" });
      assert.deepEqual([result.name, result.validUntil], ["Top Level", "2038-01-09"]);
    });
    await withFetch(respond({ status: "INVALID", expiry_date: "2020-01-01" }), async () => {
      const result = await verifyDrivingLicence({ licenseNumber: "KA0120150001234", dob: "1985-05-05" });
      assert.deepEqual([result.valid, result.name, result.validUntil], [false, null, "2020-01-01"]);
    });
  });
});

test("a vehicle RC is valid only when Cashfree says so and the RC is active", async () => {
  await withEnv(LIVE_ONLY, async () => {
    await withFetch(respond({ status: "VALID", rc_status: "SUSPENDED", owner: "RAMESH K" }), async (calls) => {
      const result = await verifyVehicleRc({ registrationNumber: "mh-12 ab 1234" });
      assert.equal(result.valid, false);
      assert.equal(result.registrationNumber, "MH12AB1234");
      assert.equal(calls[0].body.vehicle_number, "MH12AB1234");
    });
    const older = {
      verification_status: "success", owner_details: { name: "Asha" }, vehicle_details: { seating_capacity: "7" },
      registration_details: { validity_date: "2036-12-23" }, national_permit_upto: "31/03/2028"
    };
    await withFetch(respond(older), async () => {
      const result = await verifyVehicleRc({ registrationNumber: "KA01AB1234" });
      assert.deepEqual(
        [result.valid, result.owner, result.seats, result.commercial, result.rcValidUntil, result.insuranceValidUntil, result.permitValidUntil],
        [true, "Asha", 7, null, "2036-12-23", null, "2028-03-31"]
      );
    });
    await withFetch(respond({ status: "PENDING", rc_status: "ACTIVE" }), async () => {
      const result = await verifyVehicleRc({ registrationNumber: "KA01AB1234" });
      assert.deepEqual([result.valid, result.owner, result.seats], [false, null, null]);
    });
  });
});

test("offline simulation answers every check without calling Cashfree, and is refused in production", async () => {
  await withEnv({ ...DEV, CASHFREE_SECUREID_SIMULATE: "true" }, async () => {
    await withFetch(() => { throw new Error("must not be called"); }, async (calls) => {
      const gstin = await verifyGstin({ gstin: "29AAACB8781B1Z5", businessName: "Goa Trails" });
      assert.deepEqual([gstin.valid, gstin.simulated, gstin.tradeName, gstin.address.city], [true, true, "Goa Trails", "Bengaluru"]);

      const lookup = await verifyPanToGstin({ pan: "aaacb8781b" });
      assert.equal(lookup.found, true);
      assert.deepEqual(lookup.gstinList.map((row) => row.gstin), ["29AAACB8781B1Z5", "27AAACB8781B1Z8"]);

      const pan = await verifyPan({ pan: "ABCPK1234L", name: "Ramesh K" });
      assert.deepEqual([pan.valid, pan.type, pan.nameMatchScore], [true, "Individual", 95]);

      const bank = await verifyBankAccount({ accountNumber: "123456789", ifsc: "icic0000123" });
      assert.deepEqual([bank.valid, bank.bankName], [true, "ICICI Bank"]);

      const licence = await verifyDrivingLicence({ licenseNumber: "MH1220180012345", dob: "1990-01-09" });
      assert.deepEqual([licence.valid, licence.validUntil, licence.simulated], [true, "2031-01-09", true]);
      assert.equal((await verifyDrivingLicence({ licenseNumber: "MH1220180000", dob: "1990-01-09" })).valid, false);

      const rc = await verifyVehicleRc({ registrationNumber: "MH12AB1234" });
      assert.deepEqual(
        [rc.valid, rc.seats, rc.rcValidUntil, rc.insuranceValidUntil, rc.permitValidUntil],
        [true, 5, "2036-12-23", "2027-12-14", "2028-03-31"]
      );
      assert.equal((await verifyVehicleRc({ registrationNumber: "MH12AB0000" })).valid, false);
      assert.equal(calls.length, 0);
    });
  });
  await withEnv({ ...DEV, NODE_ENV: "production", CASHFREE_SECUREID_SIMULATE: "true" }, async () => {
    await assert.rejects(() => verifyPan({ pan: "ABCPK1234L" }), /cannot be used in production/);
  });
});

test("requests go to the sandbox, production or a configured proxy", async () => {
  await withFetch(respond({ valid: true }), async (calls) => {
    await withEnv(LIVE_ONLY, () => verifyPan({ pan: "ABCPK1234L" }));
    await withEnv({ ...LIVE_ONLY, CASHFREE_SECUREID_ENV: "production" }, () => verifyPan({ pan: "ABCPK1234L" }));
    await withEnv({ ...LIVE_ONLY, CASHFREE_SECUREID_PROXY_URL: "https://proxy.example.test/cf/" }, () => verifyPan({ pan: "ABCPK1234L" }));
    assert.deepEqual(calls.map((call) => call.url), [
      "https://sandbox.cashfree.com/verification/pan",
      "https://api.cashfree.com/verification/pan",
      "https://proxy.example.test/cf/pan",
    ]);
  });
});

test("outside production an unlisted IP or unreachable network falls back to simulation; other failures don't", async () => {
  await withEnv({ ...DEV, CASHFREE_SECUREID_SIMULATION_FALLBACK: "true" }, async () => {
    await withFetch(respond({ code: "ip_validation_failed", message: "IP not whitelisted: 1.2.3.4" }, { ok: false, status: 403 }), async () => {
      assert.equal((await verifyPan({ pan: "ABCPK1234L" })).simulated, true);
    });
    await withFetch(() => { throw new Error("connect ECONNREFUSED 127.0.0.1:443"); }, async () => {
      assert.equal((await verifyPan({ pan: "ABCPK1234L" })).simulated, true);
    });
    await withFetch(() => { throw new Error("socket hang up"); }, async () => {
      await assert.rejects(() => verifyPan({ pan: "ABCPK1234L" }), /socket hang up/);
    });
  });
  await withEnv({ ...LIVE_ONLY }, async () => {
    await withFetch(respond({ code: "ip_validation_failed", message: "IP not whitelisted" }, { ok: false, status: 403 }), async () => {
      await assert.rejects(() => verifyPan({ pan: "ABCPK1234L" }), /IP Whitelist Required/);
    });
  });
});

test("an API error without a body still says its status, and only server errors are retryable", async () => {
  await withEnv(LIVE_ONLY, async () => {
    const noBody = async () => ({ ok: false, status: 503, json: async () => { throw new SyntaxError("Unexpected end of JSON"); } });
    await withFetch(noBody, async () => {
      await assert.rejects(() => verifyPan({ pan: "ABCPK1234L" }), (err) =>
        err.message === "Cashfree Verification failed with status 503" && err.code === null && err.retryable === true);
    });
    await withFetch(respond({ error: { message: "pan is malformed" }, type: "validation_error" }, { ok: false, status: 400 }), async () => {
      await assert.rejects(() => verifyPan({ pan: "ABCPK1234L" }), (err) =>
        err.message === "pan is malformed" && err.type === "validation_error" && err.retryable === false);
    });
  });
});

test("each check refuses malformed input before calling Cashfree", async () => {
  await withFetch(() => { throw new Error("must not be called"); }, async (calls) => {
    await assert.rejects(() => verifyGstin({ gstin: "29AAACB8781" }), /15-character GSTIN/);
    await assert.rejects(() => verifyGstin(), /15-character GSTIN/);
    await assert.rejects(() => verifyPan({ pan: "ABCPK" }), /10-character PAN/);
    await assert.rejects(() => verifyPanToGstin({ pan: "" }), /10-character PAN/);
    await assert.rejects(() => verifyBankAccount({ accountNumber: "123456789" }), /IFSC code are required/);
    assert.equal(calls.length, 0);
  });
});

test("a full KYB audit records each failed check as an error without marking anything verified", async (t) => {
  const db = migratedDb(t);
  await assert.rejects(() => runComprehensiveSupplierKyb(db, {}), /Supplier ID is required/);
  await assert.rejects(() => runComprehensiveSupplierKyb(db, { supplierId: "sup_missing" }), /Supplier not found/);

  db.prepare(`INSERT INTO suppliers (id, company_name, contact_name, email, phone, city, state, gstin, pan_number, payout_bank_details)
    VALUES ('sup_kyb_fail', 'Goa Trails', 'Asha', 'kyb@example.test', '+919000000002', 'Goa', 'Goa', '30AAACB8781B1Z5', 'AAACB8781B', ?)`)
    .run(JSON.stringify({ account_number: "50200012345678", ifsc: "HDFC0000123" }));
  await withEnv(LIVE_ONLY, async () => {
    await withFetch(() => { throw new Error("upstream down"); }, async (calls) => {
      const report = await runComprehensiveSupplierKyb(db, { supplierId: "sup_kyb_fail" });
      assert.equal(calls.length, 3);
      for (const check of ["gstin", "pan", "bank"]) assert.deepEqual(report[check], { valid: false, error: "upstream down" });
      assert.equal(report.overallVerified, false);
    });
  });
  const supplier = db.prepare("SELECT gstin_verified, pan_verified, bank_verified FROM suppliers WHERE id = 'sup_kyb_fail'").get();
  assert.deepEqual([supplier.gstin_verified, supplier.pan_verified, supplier.bank_verified].map(Number), [0, 0, 0]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM supplier_kyb_verifications WHERE supplier_id = 'sup_kyb_fail'").get().n, 0);

  // Unreadable bank details and a too-short GSTIN are skipped, not sent.
  db.prepare("UPDATE suppliers SET gstin = '30AAA', payout_bank_details = '{oops' WHERE id = 'sup_kyb_fail'").run();
  await withEnv({ ...DEV, CASHFREE_SECUREID_SIMULATE: "true" }, async () => {
    const report = await runComprehensiveSupplierKyb(db, { supplierId: "sup_kyb_fail" });
    assert.deepEqual([report.gstin, report.bank, report.pan.valid], [null, null, true]);
  });
});
