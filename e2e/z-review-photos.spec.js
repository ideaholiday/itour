import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createPaidBooking, loginThroughUi } from "./helpers/marketplace.js";

// Playwright runs from the repository root.
const requireFromBackend = createRequire(path.resolve("backend/package.json"));
const Database = requireFromBackend("better-sqlite3");

function openDatabase(options) {
  return new Database(readFileSync(path.resolve("backend/test-results/browser-e2e-database-path.txt"), "utf8").trim(), options);
}

// A traveler's review photos are uploaded, shrunk in the browser, and saved
// with the review (they used to upload but never attach).
test("traveler adds a photo to a review of a completed trip", async ({ page, request }) => {
  const booking = await createPaidBooking(request, `review-photo-${Date.now()}`);
  const db = openDatabase();
  try {
    db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(booking.bookingId);
  } finally {
    db.close();
  }

  await loginThroughUi(page, { email: booking.email, password: "BrowserTraveler@2026" }, "/my-bookings");
  await page.getByRole("button", { name: /Past & Completed/ }).click();
  await page.getByRole("button", { name: "Write Review" }).first().click();

  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0e7490";
    ctx.fillRect(0, 0, 2400, 1800);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "sunset.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
  await expect(page.getByAltText("Upload 1")).toBeVisible();
  await expect(page.getByText("1 / 5 photos")).toBeVisible();

  await page.getByPlaceholder(/What went well/).fill("Punctual pickup and a lovely sunset cruise.");
  const created = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/reviews$/.test(response.url()));
  await page.getByRole("button", { name: "Submit verified review" }).click();
  const createdResponse = await created;
  expect(createdResponse.status(), await createdResponse.text()).toBeLessThan(300);

  const check = openDatabase({ readonly: true });
  try {
    const saved = check.prepare(`
      SELECT review_photos.photo_url FROM review_photos
      JOIN reviews ON reviews.id = review_photos.review_id
      WHERE reviews.booking_id = ?
    `).all(booking.bookingId);
    expect(saved).toHaveLength(1);
    expect(saved[0].photo_url).toMatch(/^\/uploads\/file_.+\.(webp|jpg)$/);
  } finally {
    check.close();
  }
});
