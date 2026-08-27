import { expect, test } from "@playwright/test";

test("traveler signs up and completes search-to-confirmation booking journey", async ({ page }) => {
  const email = "browser.e2e.traveler@example.test";

  await page.goto("/login?mode=signup");
  await page.getByLabel("Full name").fill("Browser E2E Traveler");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Mobile number").fill("+919876543210");
  await page.getByLabel("Password").fill("BrowserE2E@2026");
  await page.getByRole("button", { name: "Create account with email" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/search?destination=goa&type=DAY_TOUR");
  await expect(page.getByRole("heading", { name: /Experiences in Goa/i })).toBeVisible();
  const firstActivity = page.locator('a[href^="/activity/"]').first();
  await expect(firstActivity).toBeVisible();
  const activityTitle = (await firstActivity.getByRole("heading").textContent())?.trim();
  expect(activityTitle).toBeTruthy();
  await firstActivity.click();

  await expect(page).toHaveURL(/\/activity\//);
  await expect(page.getByRole("heading", { name: activityTitle, exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Check availability" }).click();
  await page.getByText("Select option", { exact: true }).first().click();
  await page.getByRole("button", { name: /Continue to booking/i }).click();

  await expect(page).toHaveURL(/\/checkout\//);
  await expect(page.getByRole("heading", { name: "Review and book." })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Browser E2E Traveler");
  // A persisted local test account may not have a phone from an earlier run.
  await page.getByLabel("WhatsApp / mobile").fill("+919876543210");
  await expect(page.getByLabel("Email for e-ticket")).toHaveValue(email);
  const pickupInput = page.getByRole("combobox", { name: "Pickup address or meeting point" });
  await pickupInput.fill("Calangute");
  await page.getByRole("option", { name: /Calangute, Baga and Candolim Hotels/i }).click();
  await expect(page.getByText("Pickup point confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Demo sandbox payment/i }).click();

  const confirmButton = page.getByRole("button", { name: /Confirm demo booking/i });
  await expect(confirmButton).toBeEnabled();
  const bookingResponsePromise = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/bookings$/.test(response.url())
  ));
  const paymentResponsePromise = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/checkout\/demo-payment$/.test(response.url())
  ));
  await confirmButton.click();

  const bookingResponse = await bookingResponsePromise;
  const bookingBody = await bookingResponse.text();
  expect(bookingResponse.status(), bookingBody).toBe(201);
  const paymentResponse = await paymentResponsePromise;
  const paymentBody = await paymentResponse.text();
  expect(paymentResponse.status(), paymentBody).toBe(200);

  await expect(page).toHaveURL(/\/booking-confirmed\/IH-[^?]+\?demo=1$/);
  const bookingRef = page.url().match(/\/booking-confirmed\/(IH-[^?]+)/)?.[1];
  expect(bookingRef).toBeTruthy();
  await expect(page.getByText("Booking confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("PAID · CONFIRMED", { exact: true })).toBeVisible();
  await expect(page.getByText("Traveler-only pickup code", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Open My Trips/i }).click();
  await expect(page.getByRole("heading", { name: "My Trips & Itineraries" })).toBeVisible();
  await expect(page.getByText(bookingRef, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Request Cancellation|Cancel & Refund/ }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`Modify Trip #${bookingRef}`) })).toBeVisible();
  await expect(page.getByText("Policy Tier:", { exact: true })).toBeVisible();
  const confirmCancellation = page.getByRole("button", { name: "Confirm Cancellation", exact: true });
  await expect(confirmCancellation).toBeEnabled();
  const cancellationResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/bookings\/[^/]+\/self-cancel$/.test(response.url())
  ));
  await confirmCancellation.click();
  const cancellation = await cancellationResponse;
  const cancellationBody = await cancellation.json();
  expect(cancellation.status(), JSON.stringify(cancellationBody)).toBe(200);
  expect(cancellationBody).toMatchObject({ success: true, status: "cancelled", ref: bookingRef });
  await expect(page.getByRole("heading", { name: "Request Completed" })).toBeVisible();
});
