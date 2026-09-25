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
