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

// P2: a shared vehicle linked from the extranet must cap the departure.
test("supplier links a shared vehicle and it caps the departure", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const supplierId = account.user.supplier_id;
  const headers = { Authorization: `Bearer ${account.token}` };

  const publication = await request.post(`/api/suppliers/${supplierId}/products/v2`, { headers, data: {
    productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Shared vehicle browser check", city: "Goa", state: "Goa",
    priceInr: 900, shortDesc: "Shared vehicle verification", status: "PUBLISHED" } });
  const published = await publication.json();
  expect(publication.status(), JSON.stringify(published)).toBe(201);
  const productId = published.productId;

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=listings");
  await page.getByPlaceholder("Search by title, city, route…").fill(published.product.title);
  await page.getByRole("button", { name: "Seats and schedule" }).click();
  const editor = page.getByRole("dialog", { name: "Seats and schedule" });
  await expect(editor).toBeVisible();

  await editor.getByLabel("Seats per departure").fill("12");
  await editor.getByLabel("Adult price").fill("900");
  await editor.getByLabel("Child price").fill("400");
  await editor.getByLabel("Infant (₹)").fill("0");
  await editor.getByLabel("Infant does not use a seat").check();
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved.");

  await editor.getByRole("button", { name: "Shared vehicle" }).click();
  await expect(editor.getByRole("heading", { name: "Add a shared vehicle" })).toBeVisible();
  await editor.getByLabel("Name", { exact: true }).fill("Tempo Traveller GA-09");
  await editor.getByLabel("Total seats").fill("5");
  await editor.getByRole("button", { name: "Add and link to this option" }).click();
  await expect(editor.getByRole("status")).toContainText("Shared vehicle added");
  await expect(editor.getByText("5 seats · shared by 1 option · including this one")).toBeVisible();
  await page.screenshot({ path: "test-results/native-supplier-shared-vehicle.png" });

  // The option sells 12 on its own, but the van caps the departure at 5.
  const optionId = (await (await request.get(`/api/suppliers/${supplierId}/products/${productId}/inventory`, { headers })).json()).options[0].id;
  const slots = await request.get(`/api/availability/native/${productId}?optionId=${optionId}&date=2099-08-14`);
  const slot = (await slots.json()).slots[0];
  expect(slot.capacity).toBe(12);
  expect(slot.vacancies).toBe(5);
  expect(slot.sharedResource.name).toBe("Tempo Traveller GA-09");
  expect(slot.seatlessUnits).toEqual(["INFANT"]);
});

// Promotional rates: supplier runs a discount, traveler sees the reduced price.
test("supplier runs a promotion and the traveler sees the discounted rate", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const supplierId = account.user.supplier_id;
  const headers = { Authorization: `Bearer ${account.token}` };

  const publication = await request.post(`/api/suppliers/${supplierId}/products/v2`, { headers, data: {
    productType: "EXPERIENCE", productSubType: "TICKET_SIC", title: "Promotion browser check", city: "Goa", state: "Goa",
    priceInr: 1000, shortDesc: "Promotional rate verification", status: "PUBLISHED" } });
  const published = await publication.json();
  expect(publication.status(), JSON.stringify(published)).toBe(201);
  const productId = published.productId;

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=listings");
  await page.getByPlaceholder("Search by title, city, route…").fill(published.product.title);
  await page.getByRole("button", { name: "Seats and schedule" }).click();
  const editor = page.getByRole("dialog", { name: "Seats and schedule" });
  await expect(editor).toBeVisible();

  await editor.getByLabel("Seats per departure").fill("10");
  await editor.getByLabel("Adult price").fill("1000");
  await editor.getByLabel("Child price").fill("400");
  await editor.getByRole("button", { name: "Save schedule" }).click();
  await expect(editor.getByRole("status")).toContainText("Saved.");

  // A public 20% promotion — no code, so everyone sees it.
  await editor.getByRole("button", { name: "Promotions" }).click();
  await expect(editor.getByRole("heading", { name: "Add a promotion" })).toBeVisible();
  await editor.getByLabel("Name (optional)").fill("Monsoon sale");
  await editor.getByLabel("Percent (%)").fill("20");
  await editor.getByRole("button", { name: "Add promotion" }).click();
  await expect(editor.getByRole("status")).toContainText("Promotion added.");
  await expect(editor.getByText("shown to everyone")).toBeVisible();
  await expect(editor.getByText("20% off · any booking time")).toBeVisible();
  await page.screenshot({ path: "test-results/native-supplier-promotions.png" });

  const optionId = (await (await request.get(`/api/suppliers/${supplierId}/products/${productId}/inventory`, { headers })).json()).options[0].id;
  const slotFor = async (query = "") => {
    const response = await request.get(`/api/availability/native/${productId}?optionId=${optionId}&date=2099-10-10${query}`);
    return (await response.json()).slots[0];
  };

  const discounted = await slotFor();
  expect(discounted.listAdultPrice).toBe(1000);
  expect(discounted.adultPrice).toBe(800);
  expect(discounted.unitPrices.CHILD).toBe(320);
  expect(discounted.promotion.label).toBe("Monsoon sale");
  expect(discounted.promotion.requiresCode).toBe(false);

  // A coded promotion must stay hidden until the code is supplied.
  const coded = await request.post(`/api/suppliers/${supplierId}/products/${productId}/inventory/${optionId}/promotions`, {
    headers, data: { label: "Insider", code: "INSIDER40", discountType: "PERCENT", discountValue: 40, priority: 9 },
  });
  expect(coded.status(), JSON.stringify(await coded.json())).toBe(201);

  const withoutCode = await slotFor();
  expect(withoutCode.promotion.label).toBe("Monsoon sale");
  expect(withoutCode.adultPrice).toBe(800);

  const withCode = await slotFor("&promoCode=insider40");
  expect(withCode.promotion.label).toBe("Insider");
  expect(withCode.adultPrice).toBe(600);

  // The traveler page shows the discount without needing a code.
  await page.goto(`/activity/${productId}`);
  await expect(page.getByRole("heading", { name: "Live departure availability" })).toBeVisible();
  await expect(page.getByText("Monsoon sale — discount already applied below.")).toBeVisible();
  await expect(page.getByText("Monsoon sale applied").first()).toBeVisible();

  // The month calendar must agree with the picker rather than showing the list price.
  const calendar = await request.get(`/api/products/${productId}/price-calendar?month=2099-10`);
  const calendarBody = await calendar.json();
  expect(calendarBody.pricingSource).toBe("NATIVE_INVENTORY");
  const day = calendarBody.days.find(entry => entry.date === "2099-10-10");
  expect(day.listPriceInr).toBe(1000);
  expect(day.priceInr).toBe(800);
  expect(day.rulesSummary).toContain("Monsoon sale");
  expect(day.priceInr).not.toBe(600); // the coded 40% deal must not leak

  await page.screenshot({ path: "test-results/native-traveler-promotion.png", fullPage: true });
});
