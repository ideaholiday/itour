import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

// The activity page defaults its date to tomorrow and does not read one from the
// URL, so the seasonal rate under test has to cover that date to be visible.
const localDate = (offsetDays) => {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

// Covers the supplier extranet additions from docs/RESERVATION_ENGINE_V2_PLAN.md:
// seasonal rates and per-departure calendar control, and that both reach the
// public availability API a traveler reads.
test("supplier sets a seasonal rate and closes one departure from the extranet", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  expect(login.status()).toBe(200);
  const supplierId = account.user.supplier_id;
  const headers = { Authorization: `Bearer ${account.token}` };

  const profile = await request.get(`/api/suppliers/${supplierId}`, { headers });
  const source = (await profile.json()).products.find(p => p.product_type === "DAY_TOUR" && p.group_type === "SHARED");
  expect(source).toBeTruthy();

  const publication = await request.post(`/api/suppliers/${supplierId}/products/v2`, { headers, data: {
    productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Seasonal rates browser check", city: "Goa", state: "Goa",
    priceInr: 1000, shortDesc: "Seasonal rate and calendar verification", heroImage: source.hero_image, status: "PUBLISHED",
  } });
  const published = await publication.json();
  expect(publication.status(), JSON.stringify(published)).toBe(201);
  const productId = published.productId;

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=listings");
  await page.getByPlaceholder("Search by title, city, route…").fill(published.product.title);
  await page.getByRole("button", { name: "Seats and schedule" }).click();
  const editor = page.getByRole("dialog", { name: "Seats and schedule" });
  await expect(editor).toBeVisible();

  // Base schedule, including a senior rate the seasonal rate will not override.
  await editor.getByLabel("Seats per departure").fill("10");
  await editor.getByLabel("Add a time").fill("14:00");
  await editor.getByRole("button", { name: "Add time" }).click();
  await editor.getByLabel("Adult price").fill("1000");
  await editor.getByLabel("Child price").fill("400");
  await editor.getByLabel("Senior (₹)").fill("700");
  await editor.getByLabel("Minimum travelers to run").fill("2");
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved.");

  // Seasonal rate: peak pricing for one week, adult and child only.
  await editor.getByRole("button", { name: "Seasonal rates" }).click();
  await expect(editor.getByRole("heading", { name: "Add a seasonal rate" })).toBeVisible();
  await editor.getByLabel("Name (optional)").fill("Peak week");
  await editor.getByLabel("From", { exact: true }).fill(localDate(1));
  await editor.getByLabel("To", { exact: true }).fill(localDate(7));
  await editor.getByLabel("Adult (₹)").fill("4000");
  await editor.getByLabel("Child (₹)").fill("1800");
  await editor.getByRole("button", { name: "Add seasonal rate" }).click();
  await expect(editor.getByRole("status")).toContainText("Seasonal rate added.");
  await expect(editor.getByText("Peak week")).toBeVisible();

  // Calendar: close only the 09:00 departure on one peak date.
  await editor.getByRole("button", { name: "Calendar" }).click();
  await expect(editor.getByRole("heading", { name: "Close or resize a departure" })).toBeVisible();
  await editor.getByLabel("Date to adjust").fill(localDate(1));
  await editor.getByLabel("Departure to adjust").selectOption("09:00");
  await editor.getByLabel("Close this departure entirely").check();
  await editor.getByLabel("Reason (optional, shown to travelers)").fill("Crew on leave");
  await editor.getByRole("button", { name: "Apply to calendar" }).click();
  await expect(editor.getByRole("status")).toContainText("Calendar updated.");
  await expect(editor.getByText(`${localDate(1)} · 09:00`)).toBeVisible();
  await page.screenshot({ path: "test-results/native-supplier-rates-calendar.png" });

  // Both must reach the public availability API.
  const peak = await request.get(`/api/availability/native/${productId}?date=${localDate(1)}`);
  const slots = (await peak.json()).slots;
  const morning = slots.find(slot => slot.localTime === "09:00");
  const afternoon = slots.find(slot => slot.localTime === "14:00");
  expect(morning.status).toBe("CLOSED");
  expect(morning.supplierNote).toBe("Crew on leave");
  expect(afternoon.status).toBe("AVAILABLE");
  expect(afternoon.adultPrice).toBe(4000);
  expect(afternoon.unitPrices.SENIOR).toBe(700);
  expect(afternoon.minPartySize).toBe(2);

  // A date outside the seasonal range keeps the base price.
  const offPeak = await request.get(`/api/availability/native/${productId}?date=2099-11-10`);
  expect((await offPeak.json()).slots[0].adultPrice).toBe(1000);

  // The traveler picker surfaces the seasonal label, minimum and closure reason.
  await page.goto(`/activity/${productId}`);
  await expect(page.getByRole("heading", { name: "Live departure availability" })).toBeVisible();
  await expect(page.getByText("Peak week pricing applies on this date.")).toBeVisible();
  await expect(page.getByText("minimum of 2 travelers")).toBeVisible();
  await expect(page.getByText("Crew on leave")).toBeVisible();
  await expect(page.getByText("₹4,000 per adult").first()).toBeVisible();

  // The month calendar must price from native inventory, not the product's
  // static price, so peak dates read the same as the departure picker.
  // (Off-peak dates legitimately still show the ₹1,000 base rate.)
  await expect(page.getByText("₹4,000", { exact: true }).first()).toBeVisible();
  const calendar = await request.get(`/api/products/${productId}/price-calendar?month=${localDate(1).slice(0, 7)}`);
  const calendarBody = await calendar.json();
  expect(calendarBody.pricingSource).toBe("NATIVE_INVENTORY");
  const peakDay = calendarBody.days.find(day => day.date === localDate(1));
  expect(peakDay.priceInr).toBe(4000);
  expect(peakDay.tier).toBe("PEAK");
  const offPeakDay = calendarBody.days.find(day => day.date === localDate(12));
  if (offPeakDay) expect(offPeakDay.priceInr).toBe(1000);

  await page.screenshot({ path: "test-results/native-traveler-seasonal-pricing.png", fullPage: true });
});
