import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createPaidBooking, E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

// Playwright runs from the repository root.
const requireFromBackend = createRequire(path.resolve("backend/package.json"));
const Database = requireFromBackend("better-sqlite3");
const E2E_JWT_SECRET = "browser-e2e-jwt-secret-with-at-least-32-characters";

/** The private trip link a driver receives, signed like driverAccessToken() on the server. */
function driverLink(bookingId) {
  const db = new Database(readFileSync(path.resolve("backend/test-results/browser-e2e-database-path.txt"), "utf8").trim(), { readonly: true });
  try {
    const assignment = db.prepare("SELECT id, revision, schedule_key FROM driver_assignments WHERE booking_id = ?").get(bookingId);
    const signature = createHmac("sha256", E2E_JWT_SECRET).update(`driver:${assignment.id}:${assignment.revision}:${assignment.schedule_key}`).digest("hex");
    return `/driver/trip#${assignment.id}.${signature}`;
  } finally {
    db.close();
  }
}

test("a driver must share phone location to go on the way, and operations then see the real position", async ({ browser, request, page }) => {
  const booking = await createPaidBooking(request, "driver-gps");
  const supplierLogin = await (await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier })).json();
  const supplierId = supplierLogin.user.supplier_id;
  const headers = { Authorization: `Bearer ${supplierLogin.token}` };
  expect((await request.post(`/api/suppliers/${supplierId}/bookings/${booking.bookingId}/respond-assignment`, { headers, data: { action: "ACCEPT" } })).status()).toBe(200);
  const assigned = await request.post(`/api/suppliers/${supplierId}/assign-driver`, {
    headers,
    data: {
      bookingId: booking.bookingId, driverName: "Ravi Kumar", driverPhone: "+919812345678", driverEmail: "ravi.gps@example.test",
      seatCapacity: 6, vehicleModel: "Toyota Innova Crysta", vehicleNumber: "GA-03-AB-1234", confirmedByPhone: true, note: "Called Ravi",
    },
  });
  expect(assigned.status(), await assigned.text()).toBe(200);
  const link = driverLink(booking.bookingId);

  // Location blocked: the trip does not move.
  const blocked = await browser.newContext({ permissions: [] });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(link);
  await expect(blockedPage.getByText("Live location is required for this trip.")).toBeVisible();
  await blockedPage.getByRole("button", { name: "Share location and go on the way" }).click();
  await expect(blockedPage.getByText(/Location is blocked for this page/).first()).toBeVisible();
  await expect(blockedPage.getByRole("status").filter({ hasText: "Status:" })).toContainText("ASSIGNED");
  await blocked.close();

  // Location allowed: the first position is sent, then the driver is on the way.
  const allowed = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 15.5449, longitude: 73.755, accuracy: 15 } });
  const driverPage = await allowed.newPage();
  await driverPage.goto(link);
  await driverPage.getByRole("button", { name: "Share location and go on the way" }).click();
  await expect(driverPage.getByRole("status").filter({ hasText: "Status:" })).toContainText("EN ROUTE");
  await expect(driverPage.getByText("● Sharing live location")).toBeVisible();
  await expect(driverPage.getByRole("button", { name: "Arrived at pickup" })).toBeVisible();

  await loginThroughUi(page, E2E_ACCOUNTS.operations, "/ops/live");
  await expect(page.getByText(/LIVE GPS [1-9]\d*\//)).toBeVisible();
  await page.getByRole("button", { name: /Live Map/ }).click();
  if (process.env.E2E_SCREENSHOT_DIR) {
    await expect(page.locator("img.leaflet-tile-loaded").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".custom-driver-pin").filter({ hasText: "🚗" }).first().click();
    await expect(page.getByText("Ravi Kumar (GA-03-AB-1234)")).toBeVisible();
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/ops-live-driver.png` });
    await driverPage.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/driver-page.png`, fullPage: true });
  }

  // The traveler follows the driver live from My Trips.
  const travelerContext = await browser.newContext();
  const travelerPage = await travelerContext.newPage();
  await loginThroughUi(travelerPage, { email: booking.email, password: "BrowserTraveler@2026" }, "/bookings");
  await travelerPage.getByRole("link", { name: "Track live" }).first().click();
  await expect(travelerPage).toHaveURL(new RegExp(`/track/${booking.ref}$`));
  await expect(travelerPage.getByRole("heading", { name: "Ravi Kumar is on the way" })).toBeVisible();
  await expect(travelerPage.getByText("GA-03-AB-1234")).toBeVisible();
  await expect(travelerPage.getByText(/Location updated/)).toBeVisible();
  await expect(travelerPage.getByRole("link", { name: "Call driver" })).toHaveAttribute("href", "tel:+919812345678");
  if (process.env.E2E_SCREENSHOT_DIR) {
    await expect(travelerPage.locator("img.leaflet-tile-loaded").first()).toBeVisible({ timeout: 20_000 });
    await travelerPage.setViewportSize({ width: 412, height: 915 });
    await travelerPage.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/traveler-tracking.png`, fullPage: true });
  }
  await travelerContext.close();
  await allowed.close();
});
