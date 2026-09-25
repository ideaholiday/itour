import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

// ADR 042: an operator builds a package from its private rate sheet for cars and
// activities: choosing a service fills the day's title, the server prices it with
// the markup, and the quotation can be copied to a new date.
test("supplier builds a package from cars and activities on the private rate sheet", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  expect(login.status()).toBe(200);
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const post = async (path, data) => {
    const response = await request.post(`${base}${path}`, { headers, data });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(201);
    return body;
  };

  const stamp = Date.now().toString(36);
  const cab = (await post("/cab-types", { name: `Innova ${stamp}`, seats: 6 })).cabType;
  const sightseeing = (await post("/services", { kind: "SIGHTSEEING", name: `Agra sightseeing ${stamp}`, city: "Agra", dayTitle: "Agra: Taj Mahal and Agra Fort" })).service;
  await post(`/services/${sightseeing.id}/rates`, { cabTypeId: cab.id, validFrom: isoDate(-2), validTo: isoDate(400), vehicleInr: 3500 });
  const ticket = (await post("/services", { kind: "ACTIVITY", name: `Taj entry ${stamp}`, city: "Agra" })).service;
  await post(`/services/${ticket.id}/rates`, { validFrom: isoDate(-2), validTo: isoDate(400), adultInr: 1300, childInr: 650 });

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: "Cars & activities" }).click();
  await expect(page.getByText(`Agra sightseeing ${stamp}`)).toBeVisible();

  await page.getByRole("button", { name: "Quotations" }).click();
  await page.getByRole("button", { name: "New quotation" }).click();
  await page.getByLabel("Title").fill(`Agra day trip ${stamp}`);
  await page.getByLabel("Destination").fill(`Agra ${stamp}`);
  await page.getByLabel("Customer name").fill("Rahul Verma");
  await page.getByLabel("Markup on your costs (%)").fill("10");

  await page.getByRole("button", { name: "Transfer / sightseeing" }).click();
  await page.getByLabel("Car service").selectOption(sightseeing.id);
  await expect(page.getByLabel("Day 1 title")).toHaveValue("Agra: Taj Mahal and Agra Fort");
  await page.getByRole("button", { name: "Activity / ticket" }).click();
  await page.getByLabel("Activity").selectOption(ticket.id);

  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  // 2 adults: one Innova ₹3,500 + 2 × ₹1,300 tickets = ₹6,100 cost, +10% = ₹6,710, +5% GST = ₹7,046.
  await expect(page.getByText("₹7,046")).toBeVisible();
  await expect(page.getByText("About ₹3,523 per person")).toBeVisible();

  await page.getByLabel("Start date for the copy").fill(isoDate(30));
  await page.getByRole("button", { name: "Copy to this date" }).click();
  await expect(page.getByText("Copied as a new draft")).toBeVisible();
  await expect(page.getByLabel("Day 1 title")).toHaveValue("Agra: Taj Mahal and Agra Fort");
});

// ADR 043: one quotation offers two hotel options; the customer's choice sets the price.
test("supplier offers 3 Star and 4 Star hotel options and records the customer's choice", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const stamp = Date.now().toString(36);
  const hotelWithRate = async (name, net) => {
    const hotel = (await (await request.post(`${base}/hotels`, { headers, data: { name, city: "Jaipur" } })).json()).hotel;
    const rate = await request.post(`${base}/hotels/${hotel.id}/rates`, { headers, data: { roomType: "Deluxe", mealPlan: "CP", validFrom: isoDate(-2), validTo: isoDate(400), netPerNightInr: net } });
    expect(rate.status()).toBe(201);
    return hotel;
  };
  const three = await hotelWithRate(`Pink City Inn ${stamp}`, 3000);
  const four = await hotelWithRate(`Amber Palace ${stamp}`, 5000);

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: "New quotation" }).click();
  await page.getByLabel("Title").fill(`Jaipur options ${stamp}`);
  await page.getByLabel("Customer name").fill("Kavya Rao");
  await page.getByLabel("Markup on your costs (%)").fill("10");
  await page.getByRole("button", { name: "Hotel nights" }).click();
  await page.getByRole("combobox", { name: /^Hotel/ }).selectOption(three.id);
  await page.getByRole("combobox", { name: /^Room/ }).selectOption("Deluxe");

  await page.getByRole("button", { name: "Offer another hotel option" }).click();
  await page.getByLabel("Option 1 name").fill("3 Star");
  await page.getByLabel("Option 2 name").fill("4 Star");
  await page.getByRole("combobox", { name: /^Hotel/ }).nth(1).selectOption(four.id);
  await page.getByRole("combobox", { name: /^Room/ }).nth(1).selectOption("Deluxe");

  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  // 3 Star: ₹3,000 + 10% + 5% GST = ₹3,465. 4 Star: ₹5,000 → ₹5,775.
  await expect(page.getByRole("row", { name: /3 Star/ })).toContainText("₹3,465");
  await expect(page.getByRole("row", { name: /4 Star/ })).toContainText("₹5,775");

  await page.getByRole("button", { name: "Send to customer" }).click();
  await page.getByLabel("Option the customer chose").selectOption({ label: "4 Star" });
  await page.getByRole("button", { name: "Customer accepted" }).click();
  await expect(page.getByText("Customer chose 4 Star")).toBeVisible();
  await expect(page.getByText("₹5,775").first()).toBeVisible();
});
