import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

test("supplier sets seat inventory and traveler sees a live ten-minute checkout hold", async ({ page, request, browser }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json(); expect(login.status()).toBe(200);
  const supplierId = account.user.supplier_id;
  const headers = { Authorization: `Bearer ${account.token}` };
  const profile = await request.get(`/api/suppliers/${supplierId}`, { headers });
  const data = await profile.json();
  const source = data.products.find(p => p.product_type === "DAY_TOUR" && p.group_type === "SHARED");
  expect(source).toBeTruthy();
  const publication = await request.post(`/api/suppliers/${supplierId}/products/v2`, { headers, data: {
    productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Native browser experience", city: "Goa", state: "Goa",
    priceInr: 1000, shortDesc: "Seat inventory browser verification", heroImage: source.hero_image, status: "PUBLISHED",
  } });
  const published = await publication.json(); expect(publication.status(), JSON.stringify(published)).toBe(201);
  const copy = { clonedProductId: published.productId, title: published.product.title };
  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=listings");
  await page.getByPlaceholder("Search by title, city, route…").fill(copy.title);
  await page.getByRole("button", { name: "Seats and schedule" }).click();
  const editor = page.getByRole("dialog", { name: "Seats and schedule" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Seats per departure").fill("3");
  await editor.getByLabel("Departure times").fill("09:00,14:00");
  await editor.getByLabel("Adult price").fill("1000");
  await editor.getByLabel("Child price").fill("400");
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved.");
  await page.screenshot({ path: "test-results/native-supplier-inventory.png" });
  const signup = await request.post("/api/auth/signup", { data: { name: "Native Seat Traveler", email: "native.browser@example.test", password: "BrowserNative@2026", phone: "+919876543210" } });
  expect(signup.status()).toBe(200);
  const context = await browser.newContext();
  const traveler = await context.newPage();
  try {
    await loginThroughUi(traveler, { email: "native.browser@example.test", password: "BrowserNative@2026" }, "/");
    const date = new Date(Date.now() + 21 * 86400000).toISOString().slice(0,10);
    await traveler.goto(`/activity/${copy.clonedProductId}`);
    await expect(traveler.getByRole("heading", { name: "Live departure availability" })).toBeVisible();
    await expect(traveler).toHaveURL(new RegExp(`/activity/Native-browser-experience/${copy.clonedProductId}$`));
    const inventory = await request.get(`/api/suppliers/${supplierId}/products/${copy.clonedProductId}/inventory`, { headers });
    const option = (await inventory.json()).options[0];
    await traveler.goto(`/checkout/${copy.clonedProductId}?date=${date}&adults=2&children=1&time=09:00&option=${option.id}&vehicle=SHARED_SEAT`);
    await expect(traveler.getByText(/Seats reserved for/)).toBeVisible();
    await traveler.screenshot({ path: "test-results/native-traveler-hold.png", fullPage: true });
    const availability = await request.get(`/api/availability/native/${copy.clonedProductId}?date=${date}`);
    expect((await availability.json()).slots[0].vacancies).toBe(0);
    await traveler.reload();
    await expect(traveler.getByText(/Seats reserved for/)).toBeVisible();
    const pickup = traveler.getByRole("combobox", { name: "Pickup address or meeting point" });
    await pickup.fill("Calangute");
    await traveler.getByRole("option", { name: /Calangute, Baga and Candolim Hotels/i }).click();
    await traveler.getByRole("button", { name: /Demo sandbox payment/i }).click();
    await traveler.getByRole("button", { name: /Confirm demo booking/i }).click();
    await expect(traveler).toHaveURL(/booking-confirmed/);
    await expect(traveler.getByText("Booking Confirmed & Guaranteed", { exact: true })).toBeVisible();
  } finally { await context.close(); }
});
