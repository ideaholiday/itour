import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("planner opens an isolated trip-plan print preview", async ({ page }) => {
  await page.goto("/circuit-planner");
  await page.getByRole("heading", { name: "Goa Coastal Sun, Sea & Island Adventure" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print Trip Plan PDF", exact: true }).click();
  const preview = await popupPromise;
  await preview.waitForLoadState("domcontentloaded");
  await expect(preview.getByText("Multi-Day Circuit Trip Plan", { exact: true })).toBeVisible();
  await expect(preview.getByText("Planning estimate - not booked", { exact: true })).toBeVisible();
  await expect(preview.getByText("This is a trip plan, not a booking voucher.", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Print / Save as PDF" })).toBeVisible();
  await expect(preview.getByRole("navigation")).toHaveCount(0);
});

test("traveler reserves and confirms a complete circuit with one grouped payment", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await page.getByLabel("Full name").fill("Circuit Quote Traveler");
  await page.getByLabel("Email address").fill("browser.e2e.circuit@example.test");
  await page.getByLabel("Mobile number").fill("+919876543212");
  await page.getByLabel("Password").fill("CircuitQuote@2026");
  await page.getByRole("button", { name: "Create account with email" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/circuit-planner");
  await page.getByRole("heading", { name: "Goa Coastal Sun, Sea & Island Adventure" }).click();
  await page.getByText("Travel Date", { exact: true }).locator("xpath=../..").locator("input[type=date]").fill(futureDate(30));
  await page.getByRole("button", { name: /Day 2 2 acts/ }).click();
  const customItem = page.getByText("Anjuna & Vagator Cliffside Sunset Lounge & Beach Shack Dinner", { exact: true });
  await customItem.locator("xpath=ancestor::div[contains(@class,'justify-between')][1]").getByTitle("Remove from circuit").click();
  const quoteButton = page.getByRole("button", { name: "Get Live Circuit Quote" });
  await expect(quoteButton).toBeVisible();

  const saveResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/itineraries$/.test(response.url())
  ));
  const quoteResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/itineraries\/[^/]+\/quote$/.test(response.url())
  ));
  await quoteButton.click();

  expect((await saveResponse).status()).toBe(201);
  const quoteHttpResponse = await quoteResponse;
  const quoteBody = await quoteHttpResponse.json();
  expect(quoteHttpResponse.status(), JSON.stringify(quoteBody)).toBe(201);
  expect(quoteBody.quote.lineItems.length, JSON.stringify(quoteBody)).toBeGreaterThan(1);
  expect(quoteBody.quote.quoteId).toMatch(/^cq_/);

  await expect(page.getByRole("heading", { name: "Your live circuit quote" })).toBeVisible();
  await expect(page.getByText(/itinerary items priced from live marketplace data/)).toBeVisible();
  await expect(page).toHaveURL(/\/circuit-planner\?id=itin_/);
  await expect(page).not.toHaveURL(/\/checkout\//);

  const orderResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/circuit-orders$/.test(response.url())
  ));
  await page.getByRole("button", { name: "Reserve circuit & continue" }).click();
  const orderHttpResponse = await orderResponse;
  const orderBody = await orderHttpResponse.json();
  expect(orderHttpResponse.status(), JSON.stringify(orderBody)).toBe(201);
  expect(orderBody.order.items.length).toBeGreaterThan(1);

  await expect(page).toHaveURL(/\/circuit-checkout\/co_/);
  await expect(page.getByRole("heading", { name: "One payment. Your whole circuit." })).toBeVisible();
  await expect(page.getByText(/BOOKINGS · ONE CHARGE/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "One payment. Your whole circuit." })).toBeVisible();

  await page.getByRole("button", { name: /Demo sandbox payment/ }).click();
  const paymentResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/circuit-orders\/[^/]+\/demo-payment$/.test(response.url())
  ));
  await page.getByRole("button", { name: "Confirm demo circuit · ₹0 charged" }).click();
  const paymentHttpResponse = await paymentResponse;
  const paymentBody = await paymentHttpResponse.json();
  expect(paymentHttpResponse.status(), JSON.stringify(paymentBody)).toBe(200);
  expect(paymentBody.order.status).toBe("CONFIRMED");
  expect(paymentBody.order.items.every((item) => item.paymentStatus === "PAID")).toBe(true);

  await expect(page).toHaveURL(/\/circuit-confirmed\/IHC-/);
  await expect(page.getByRole("heading", { name: "Your whole circuit is confirmed." })).toBeVisible();
  await expect(page.getByText(/One verified payment confirmed all/)).toBeVisible();
  await expect(page.getByText("PAID ONCE · ALL CONFIRMED")).toBeVisible();

  await page.getByRole("link", { name: "Manage complete circuit" }).click();
  await expect(page.getByRole("heading", { name: "Manage your complete circuit" })).toBeVisible();
  await page.getByRole("button", { name: /Cancel complete circuit/ }).click();
  await expect(page.getByText("Policy refund", { exact: true })).toBeVisible();
  await page.getByLabel("Circuit cancellation reason").fill("Browser test requests one grouped cancellation and refund");
  const managementResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/circuit-orders\/[^/]+\/management-requests$/.test(response.url())
  ));
  await page.getByRole("button", { name: "Request grouped cancellation" }).click();
  const managementHttpResponse = await managementResponse;
  const managementBody = await managementHttpResponse.json();
  expect(managementHttpResponse.status(), JSON.stringify(managementBody)).toBe(201);
  expect(managementBody.request.status).toBe("PENDING");
  await expect(page.getByRole("heading", { name: "Grouped cancellation pending" })).toBeVisible();

  await page.evaluate(() => {
    localStorage.removeItem("wi_token");
    localStorage.removeItem("wi_user");
  });
  await page.reload();
  await loginThroughUi(page, E2E_ACCOUNTS.operations, "/ops/circuits");
  await expect(page.getByRole("heading", { name: "Circuit changes & refunds" })).toBeVisible();
  await page.getByText(managementBody.request.requestRef, { exact: true }).click();
  await page.getByLabel("Operations resolution").fill("Policy and demo parent payment verified for atomic cancellation");
  const reviewResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/circuit-orders\/management\/requests\/[^/]+\/review$/.test(response.url())
  ));
  await page.getByRole("button", { name: "Approve complete circuit" }).click();
  const reviewHttpResponse = await reviewResponse;
  const reviewBody = await reviewHttpResponse.json();
  expect(reviewHttpResponse.status(), JSON.stringify(reviewBody)).toBe(200);
  expect(reviewBody.order.status).toBe("CANCELLED");
  expect(reviewBody.order.items.every((item) => item.bookingStatus === "cancelled")).toBe(true);
  expect(reviewBody.order.items.every((item) => item.status === "CANCELLED")).toBe(true);
  await expect(page.getByText(/approved\. Every child booking was updated together/)).toBeVisible();
});
