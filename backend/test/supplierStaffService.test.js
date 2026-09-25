import assert from "node:assert/strict";
import { test } from "node:test";
import { supplierMay, supplierRoleAllows } from "../src/services/supplierStaffService.js";

// Supplier staff roles (ADR 036). Paths are relative to /api/suppliers/:id.

test("owner-only areas are closed to every staff role", () => {
  for (const role of ["MANAGER", "FRONT_DESK", "GUIDE"]) {
    for (const [method, path] of [["GET", "/kyb/verifications"], ["PATCH", "/payout"], ["GET", "/payout-ledger"], ["GET", "/subscription"], ["POST", "/plans/checkout"], ["POST", "/spotlights/x/swap"], ["GET", "/staff"], ["PATCH", "/profile"]]) {
      assert.equal(supplierRoleAllows(role, method, path), false, `${role} ${method} ${path}`);
      assert.equal(supplierRoleAllows("OWNER", method, path), true);
    }
  }
});

test("a manager does day-to-day work, including endpoints added later", () => {
  for (const [method, path] of [["PATCH", "/products/p1/price"], ["POST", "/bookings/b1/cancel"], ["GET", "/dashboard-stats"], ["PATCH", "/public-profile"], ["GET", "/some-new-report"]]) {
    assert.equal(supplierRoleAllows("MANAGER", method, path), true, `${method} ${path}`);
  }
});

test("front desk books and collects; a guide only runs the departure", () => {
  const desk = [["GET", "/"], ["GET", "/availability"], ["POST", "/bookings/quote"], ["POST", "/bookings"], ["POST", "/bookings/b1/payments"], ["POST", "/bookings/b1/notifications/resend"], ["GET", "/manifest"], ["POST", "/check-in"], ["PATCH", "/bookings/b1/attendance"]];
  for (const [method, path] of desk) assert.equal(supplierRoleAllows("FRONT_DESK", method, path), true, `${method} ${path}`);
  for (const [method, path] of [["POST", "/bookings/b1/cancel"], ["PATCH", "/products/p1/price"], ["GET", "/bookings"], ["DELETE", "/bookings/b1/payments"], ["GET", "/some-new-report"]]) {
    assert.equal(supplierRoleAllows("FRONT_DESK", method, path), false, `${method} ${path}`);
  }
  for (const [method, path] of [["GET", "/"], ["GET", "/manifest"], ["POST", "/check-in"], ["PATCH", "/bookings/b1/attendance"]]) {
    assert.equal(supplierRoleAllows("GUIDE", method, path), true, `${method} ${path}`);
  }
  for (const [method, path] of [["POST", "/bookings"], ["GET", "/availability"], ["GET", "/notifications"]]) {
    assert.equal(supplierRoleAllows("GUIDE", method, path), false, `${method} ${path}`);
  }
  assert.equal(supplierRoleAllows("SOMETHING_ELSE", "GET", "/"), false);
});

test("capabilities outside the supplier routes", () => {
  assert.equal(supplierMay({ supplier_id: "s1", supplier_role: "OWNER" }, "owner"), true);
  assert.equal(supplierMay({ supplier_id: "s1", supplier_role: "MANAGER" }, "manage"), true);
  assert.equal(supplierMay({ supplier_id: "s1", supplier_role: "MANAGER" }, "owner"), false);
  assert.equal(supplierMay({ supplier_id: "s1", supplier_role: "FRONT_DESK" }, "manage"), false);
  assert.equal(supplierMay({ supplier_id: null, supplier_role: null }, "manage"), false);
});
