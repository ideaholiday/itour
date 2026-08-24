import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import db from "../src/db.js";
import {
  createSettlementBatch,
  processSettlementBatch,
  reconcileSettlementBatch,
  getSupplierPayoutLedger,
  autoCreateAllSettlementBatches,
} from "../src/services/financeService.js";
import {
  initiateCashfreeTransfer,
  verifyCashfreeBeneficiary,
} from "../src/services/cashfreeService.js";

describe("Supplier Automated Payouts & Cashfree Ledger", () => {
  const testSupplierId = "sup_payout_test_01";
  const testBookingId1 = "bk_payout_test_01";
  const testBookingId2 = "bk_payout_test_02";
  const testPayoutId1 = "pay_test_01";
  const testPayoutId2 = "pay_test_02";

  before(() => {
    // Clean prior test data in safe foreign-key order
    db.prepare("DELETE FROM financial_ledger WHERE supplier_id = ? OR payout_id IN (?, ?) OR booking_id IN (?, ?)").run(testSupplierId, testPayoutId1, testPayoutId2, testBookingId1, testBookingId2);
    db.prepare("DELETE FROM payout_batch_items WHERE payout_id IN (?, ?) OR batch_id IN (SELECT id FROM payout_batches WHERE supplier_id = ?)").run(testPayoutId1, testPayoutId2, testSupplierId);
    db.prepare("DELETE FROM payout_batches WHERE supplier_id = ?").run(testSupplierId);
    db.prepare("DELETE FROM payouts WHERE id IN (?, ?) OR supplier_id = ?").run(testPayoutId1, testPayoutId2, testSupplierId);
    db.prepare("DELETE FROM bookings WHERE id IN (?, ?) OR supplier_id = ?").run(testBookingId1, testBookingId2, testSupplierId);
    db.prepare("DELETE FROM suppliers WHERE id = ?").run(testSupplierId);

    // Insert test supplier with valid bank details & approved KYB
    db.prepare(`
      INSERT INTO suppliers (
        id, company_name, contact_name, email, phone, city, state, kyb_status,
        commission_rate, payout_bank_details, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', 18, ?, datetime('now'))
    `).run(
      testSupplierId,
      "Apex Holiday Voyages",
      "Vikram Malhotra",
      "finance@apexvoyages.com",
      "9876543210",
      "Jaipur",
      "Rajasthan",
      JSON.stringify({
        account_holder: "Apex Holiday Voyages LLP",
        bank_name: "HDFC Bank",
        account_number: "50200012345678",
        ifsc: "HDFC0001234",
        account_type: "CURRENT",
        upi_id: "apexvoyages@hdfcbank",
      }),
    );

    // Insert test bookings
    db.prepare(`
      INSERT INTO bookings (
        id, ref, supplier_id, traveler_name, traveler_email, traveler_phone,
        product_type, activity_date, pickup_location, amount_inr, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookingId1, "IH-PAY-01", testSupplierId, "Rohan Sharma", "rohan@test.com", "9123456789",
      "DAY_TOUR", "2026-09-01", "Hotel Rajputana, Jaipur", 5000, "completed", "PAID"
    );

    db.prepare(`
      INSERT INTO bookings (
        id, ref, supplier_id, traveler_name, traveler_email, traveler_phone,
        product_type, activity_date, pickup_location, amount_inr, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testBookingId2, "IH-PAY-02", testSupplierId, "Ananya Verma", "ananya@test.com", "9123456780",
      "TRANSFER", "2026-09-02", "Jaipur Airport T2", 2000, "completed", "PAID"
    );

    // Insert scheduled payouts (Gross 5000, Comm 900, Net 4100) & (Gross 2000, Comm 360, Net 1640)
    db.prepare(`
      INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', datetime('now'))
    `).run(testPayoutId1, testSupplierId, testBookingId1, 5000, 900, 4100);

    db.prepare(`
      INSERT INTO payouts (id, supplier_id, booking_id, gross_amount, commission_amount, net_payout, payout_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', datetime('now'))
    `).run(testPayoutId2, testSupplierId, testBookingId2, 2000, 360, 1640);
  });

  it("validates beneficiary bank details format and detects bank name", async () => {
    const verified = await verifyCashfreeBeneficiary({
      bankAccount: "50200012345678",
      ifsc: "HDFC0001234",
      name: "Apex Holiday Voyages LLP",
    });

    assert.equal(verified.valid, true);
    assert.equal(verified.bankName, "HDFC Bank");
    assert.equal(verified.accountNumber, "50200012345678");
    assert.equal(verified.ifsc, "HDFC0001234");

    // Invalid IFSC check
    await assert.rejects(
      async () => verifyCashfreeBeneficiary({ bankAccount: "123456789", ifsc: "INVALID" }),
      /Invalid Indian Financial System Code/
    );
  });

  it("initiates automated Cashfree transfer simulation with realistic UTR", async () => {
    const transfer = await initiateCashfreeTransfer({
      transferId: "tx_test_payout_01",
      amount: 5740,
      beneficiaryDetails: {
        account_number: "50200012345678",
        ifsc: "HDFC0001234",
        name: "Apex Holiday Voyages LLP",
      },
    });

    assert.equal(transfer.success, true);
    assert.equal(transfer.status, "PROCESSED");
    assert.equal(transfer.amount, 5740);
    assert.match(transfer.utr, /^UTR-CF-\d{8}-\d+/);
  });

  it("computes comprehensive supplier payout ledger summary and line items", () => {
    const ledger = getSupplierPayoutLedger(db, testSupplierId);

    assert.equal(ledger.supplier.id, testSupplierId);
    assert.equal(ledger.supplier.companyName, "Apex Holiday Voyages");
    assert.equal(ledger.summary.totalGmv, 7000);
    assert.equal(ledger.summary.totalCommission, 1260);
    assert.equal(ledger.summary.totalEarned, 5740);
    assert.equal(ledger.summary.pendingScheduled, 5740);
    assert.equal(ledger.summary.totalSettled, 0);
    assert.equal(ledger.transactions.length, 2);

    const firstTx = ledger.transactions.find((t) => t.payout_id === testPayoutId1);
    assert.equal(firstTx.gross_amount, 5000);
    assert.equal(firstTx.commission_amount, 900);
    assert.equal(firstTx.net_payout, 4100);
    assert.equal(firstTx.commission_rate_percent, 18);
  });

  it("auto-creates settlement batches for all eligible suppliers with scheduled payouts", () => {
    const batches = autoCreateAllSettlementBatches(db, "admin_user_01");
    assert.ok(batches.length >= 1);

    const supplierBatch = batches.find((b) => b.supplier_id === testSupplierId);
    assert.ok(supplierBatch);
    assert.equal(supplierBatch.gross_amount, 7000);
    assert.equal(supplierBatch.commission_amount, 1260);
    assert.equal(supplierBatch.net_amount, 5740);
    assert.equal(supplierBatch.payout_count, 2);
    assert.equal(supplierBatch.status, "READY");

    // Verify payouts transitioned to BATCHED
    const p1 = db.prepare("SELECT payout_status, settlement_batch_id FROM payouts WHERE id = ?").get(testPayoutId1);
    assert.equal(p1.payout_status, "BATCHED");
    assert.equal(p1.settlement_batch_id, supplierBatch.id);
  });

  it("processes settlement batch via Cashfree and records UTR in ledger", () => {
    const batch = db.prepare("SELECT * FROM payout_batches WHERE supplier_id = ? AND status = 'READY'").get(testSupplierId);
    assert.ok(batch);

    const utrNumber = "UTR-CF-20260824-998877665544";
    const result = processSettlementBatch(db, {
      batchId: batch.id,
      provider: "CASHFREE",
      providerReference: utrNumber,
      actorId: "admin_user_01",
    });

    assert.equal(result.batch.status, "PROCESSED");
    assert.equal(result.batch.provider_batch_id, utrNumber);

    // Verify ledger reflects settled state and UTR
    const ledger = getSupplierPayoutLedger(db, testSupplierId);
    assert.equal(ledger.summary.totalSettled, 5740);
    assert.equal(ledger.summary.pendingScheduled, 0);

    const tx = ledger.transactions[0];
    assert.equal(tx.payout_status, "PROCESSED");
    assert.equal(tx.transfer_id, utrNumber);
    assert.equal(tx.batch_ref, batch.batch_ref);
  });

  it("reconciles processed settlement batch with audit note", () => {
    const batch = db.prepare("SELECT * FROM payout_batches WHERE supplier_id = ? AND status = 'PROCESSED'").get(testSupplierId);
    assert.ok(batch);

    const reconciled = reconcileSettlementBatch(db, {
      batchId: batch.id,
      note: "Bank statement verified against Cashfree UTR",
    });

    assert.equal(reconciled.status, "RECONCILED");
    assert.equal(reconciled.notes, "Bank statement verified against Cashfree UTR");
  });
});
