import { expect, test } from "@playwright/test";
import {
  createPaidBooking,
  createRefundDispute,
  E2E_ACCOUNTS,
  loginThroughUi,
} from "./helpers/marketplace.js";

test("supplier accepts a paid assignment in the protected booking workspace", async ({ page, request }) => {
  const booking = await createPaidBooking(request, "supplier-assignment");

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/bookings");
  await expect(page.getByText(booking.ref, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Respond" }).first().click();
  await expect(page.getByRole("button", { name: "Accept & Confirm Trip" })).toBeVisible();

  const assignmentResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && response.url().includes("/respond-assignment")
  ));
  await page.getByRole("button", { name: "Accept & Confirm Trip" }).click();
  const response = await assignmentResponse;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByRole("button", { name: "Accept & Confirm Trip" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Pending Action (0)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Active / In-Progress (1)" })).toBeVisible();
});

test("operations reviews its task queue and approves a controlled refund dispute", async ({ page, request }) => {
  const booking = await createPaidBooking(request, "operations-refund");
  const subject = "Browser E2E controlled refund review";
  const supportCase = await createRefundDispute(request, booking, subject);

  await loginThroughUi(page, E2E_ACCOUNTS.operations, "/ops/tasks");
  await expect(page.getByRole("heading", { name: "Operations Task Queue & Resolution Audit Log" })).toBeVisible();
  await expect(page.getByText("BROWSER_E2E_REVIEW", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser E2E Operations", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Support & Disputes/i }).click();
  await expect(page.getByRole("heading", { name: "Case resolution desk" })).toBeVisible();
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(supportCase.case_ref) }).click();
  await page.getByPlaceholder("Required decision or resolution reason").fill("Approved after deterministic browser policy review.");

  const refundResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && response.url().includes("/refund-decision")
  ));
  await page.getByRole("button", { name: "Approve refund" }).click();
  const response = await refundResponse;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByText(new RegExp(`Refund of ₹[\\d,]+ approved for ${booking.ref}`))).toBeVisible();
  await expect(page.getByText("APPROVED", { exact: true }).last()).toBeVisible();
});
