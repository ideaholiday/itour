import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

const isoDate = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
// Pickers are searchable comboboxes: type to filter, Enter takes the first match.
const pick = async (page, name, text) => {
  const box = page.getByRole("combobox", { name, exact: true });
  await box.click();
  await box.fill(text);
  await box.press("Enter");
};
// The builder's steps: Agent (or Customer) & dates, Route & hotels, Day by day, Price & send.
const step = (page, name) => page.getByRole("button", { name: new RegExp(name) }).first().click();

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
  await page.getByLabel("Title", { exact: true }).fill(`Agra day trip ${stamp}`);
  await page.getByRole("combobox", { name: "destination" }).fill(`Agra ${stamp}`);
  await page.getByRole("combobox", { name: "customer-name" }).fill("Rahul Verma");

  await step(page, "Day by day");
  await page.getByRole("button", { name: "Add car to day 1" }).click();
  await pick(page, "car-0", `Agra sightseeing ${stamp}`);
  await expect(page.getByLabel("Day 1 title")).toHaveValue("Agra: Taj Mahal and Agra Fort");
  await page.getByRole("button", { name: "Add activity to day 1" }).click();
  await pick(page, "activity-1", `Taj entry ${stamp}`);
  // A second, still-empty day shows at once and is dropped on save, so the price below is unchanged.
  await page.getByLabel("Trip length in days").selectOption("2");
  await expect(page.getByLabel("Day 2 title")).toBeVisible();

  await step(page, "Price & send");
  await page.getByLabel("Markup on your costs (%)").fill("10");
  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  // 2 adults: one Innova ₹3,500 + 2 × ₹1,300 tickets = ₹6,100 cost, +10% = ₹6,710, +5% GST = ₹7,046.
  await expect(page.getByText("₹7,046")).toBeVisible();
  await expect(page.getByText("About ₹3,523 per person")).toBeVisible();

  await page.getByLabel("Start date for the copy").fill(isoDate(30));
  await page.getByRole("button", { name: "Copy to this date" }).click();
  await expect(page.getByText("Copied as a new draft")).toBeVisible();
  await step(page, "Day by day");
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
  await page.getByLabel("Title", { exact: true }).fill(`Jaipur options ${stamp}`);
  await page.getByRole("combobox", { name: "customer-name" }).fill("Kavya Rao");
  await step(page, "Route & hotels");
  await page.getByRole("button", { name: "Add hotel to day 1" }).click();
  await pick(page, "hotel-0", `Pink City Inn ${stamp}`);
  await page.getByRole("combobox", { name: /^Room/ }).selectOption("Deluxe");

  await page.getByRole("button", { name: "Offer another hotel option" }).click();
  await page.getByLabel("Option 1 name").fill("3 Star");
  await page.getByLabel("Option 2 name").fill("4 Star");
  await pick(page, "hotel-1", `Amber Palace ${stamp}`);
  await page.getByRole("combobox", { name: /^Room/ }).nth(1).selectOption("Deluxe");

  await step(page, "Price & send");
  await page.getByLabel("Markup on your costs (%)").fill("10");
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

// ADR 044: a car priced per km (minimum km per day, driver allowance) and a hotel room that sleeps too few.
test("supplier prices an outstation car per km and is warned when rooms sleep too few", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const stamp = Date.now().toString(36);
  const cab = (await (await request.post(`${base}/cab-types`, { headers, data: { name: `Innova km ${stamp}`, seats: 6 } })).json()).cabType;
  const hotel = (await (await request.post(`${base}/hotels`, { headers, data: { name: `Tiny Inn ${stamp}`, city: "Jaipur" } })).json()).hotel;
  const room = await request.post(`${base}/hotels/${hotel.id}/rates`, { headers, data: { roomType: "Single", mealPlan: "CP", validFrom: isoDate(-2), validTo: isoDate(400), netPerNightInr: 2000, maxGuests: 1 } });
  expect(room.status()).toBe(201);

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: "Cars & activities" }).click();
  const name = `Delhi to Jaipur ${stamp}`;
  await page.getByLabel("Kind").selectOption("TRANSFER");
  await page.getByLabel("Service name").fill(name);
  await page.getByLabel("Car pricing").selectOption("PER_KM");
  await page.getByLabel("Usual distance in km").fill("280");
  await page.getByRole("button", { name: "Add service" }).click();
  const card = page.locator("div.rounded-2xl").filter({ hasText: name }).filter({ has: page.getByLabel("Price per km") });
  await expect(card).toContainText("usually 280 km");
  await card.getByLabel("Cab type").selectOption(cab.id);
  await card.getByLabel("Season from").fill(isoDate(-2));
  await card.getByLabel("Season to").fill(isoDate(400));
  await card.getByLabel("Price per km").fill("14");
  await card.getByLabel("Minimum km per day").fill("250");
  await card.getByLabel("Driver allowance per day").fill("300");
  await card.getByRole("button", { name: "Add season" }).click();
  await expect(card).toContainText("₹14/km · 250 km · ₹300");

  await page.getByRole("button", { name: "Quotations" }).click();
  await page.getByRole("button", { name: "New quotation" }).click();
  await page.getByLabel("Title", { exact: true }).fill(`Rajasthan drive ${stamp}`);
  await page.getByRole("combobox", { name: "customer-name" }).fill("Arjun Mehta");
  await step(page, "Route & hotels");
  await page.getByRole("button", { name: "Add hotel to day 1" }).click();
  await pick(page, "hotel-0", `Tiny Inn ${stamp}`);
  await page.getByRole("combobox", { name: /^Room/ }).selectOption("Single");
  await step(page, "Day by day");
  await page.getByRole("button", { name: "Add car to day 1" }).click();
  await pick(page, "car-1", name);
  await pick(page, "cab-1", `Innova km ${stamp}`);
  await page.getByLabel("Km", { exact: true }).fill("600");
  await page.getByLabel("Car days").fill("3");

  await step(page, "Price & send");
  await page.getByLabel("Markup on your costs (%)").fill("0");
  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  // Car: max(600, 3 × 250) × ₹14 + 3 × ₹300 = ₹11,400. Hotel ₹2,000. +5% GST = ₹14,070.
  await expect(page.getByText("₹11,400").first()).toBeVisible();
  await expect(page.getByText("₹14,070")).toBeVisible();
  await expect(page.getByText(`Tiny Inn ${stamp}: 1 Single room sleeps 1, but 2 are travelling.`)).toBeVisible();
});

// ADR 045: after acceptance the operator confirms each item, gives the car a driver,
// pays the hotel and sends the final itinerary; the car shows on the bookings page.
test("supplier runs an accepted trip: confirmations, a driver, a vendor payment and the final itinerary", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const post = async (path, data) => {
    const response = await request.post(`${base}${path}`, { headers, data });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    return body;
  };
  const stamp = Date.now().toString(36);
  const digits = String(Date.now()).slice(-8);
  const start = isoDate(2);

  const hotel = (await post("/hotels", { name: `Trip Inn ${stamp}`, city: "Jaipur", email: "reservations@trip-inn.example" })).hotel;
  await post(`/hotels/${hotel.id}/rates`, { roomType: "Deluxe", mealPlan: "CP", validFrom: isoDate(-2), validTo: isoDate(60), netPerNightInr: 3000 });
  const cab = (await post("/cab-types", { name: `Innova trip ${stamp}`, seats: 6 })).cabType;
  const tour = (await post("/services", { kind: "SIGHTSEEING", name: `City tour ${stamp}`, startTime: "09:30" })).service;
  await post(`/services/${tour.id}/rates`, { cabTypeId: cab.id, validFrom: isoDate(-2), validTo: isoDate(60), vehicleInr: 2500 });
  const driverName = `Suresh ${stamp}`;
  const { driverId } = await post("/drivers", { driverName, driverPhone: `+9198${digits}`, vehicleNumber: `RJ14TR${digits.slice(-4)}`, vehicleModel: "Toyota Innova", seatCapacity: 6 });
  const quotation = (await post("/quotations", {
    title: `Trip ${stamp}`, customerName: "Kavya Rao", customerPhone: "+919800000002", startDate: start, adults: 2, children: 0, markupPct: 10,
    lines: [
      { kind: "HOTEL", dayNumber: 1, title: "Stay", hotelId: hotel.id, roomType: "Deluxe", mealPlan: "CP", checkIn: start, nights: 1, rooms: 1 },
      { kind: "TRANSPORT", dayNumber: 1, serviceId: tour.id, cabTypeId: cab.id, date: start },
    ],
  })).quotation;
  await post(`/quotations/${quotation.id}/send`, { email: false });
  await post(`/quotations/${quotation.id}/status`, { status: "ACCEPTED" });

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: new RegExp(`Trip ${stamp}`) }).click();
  const tripFile = page.getByRole("region", { name: "Trip file" });
  await expect(tripFile).toContainText("0 of 2 confirmed");

  const stay = tripFile.getByRole("listitem", { name: `Trip item Trip Inn ${stamp}` });
  await stay.getByLabel("Status").selectOption("CONFIRMED");
  await stay.getByLabel("Confirmation no.").fill("TI-4410");
  await stay.getByRole("button", { name: "Save" }).click();
  await expect(tripFile).toContainText("1 of 2 confirmed");
  await stay.getByLabel(`Pay vendor for Trip Inn ${stamp}`).fill("1000");
  await stay.getByRole("button", { name: "Record payment" }).click();
  await expect(stay).toContainText("Paid ₹1,000 of ₹3,000");

  const car = tripFile.getByRole("listitem", { name: `Trip item City tour ${stamp}` });
  await car.getByRole("combobox", { name: /^Driver/ }).selectOption(driverId);
  await car.getByLabel("Status").selectOption("CONFIRMED");
  await car.getByRole("button", { name: "Save" }).click();
  await expect(tripFile).toContainText("2 of 2 confirmed");

  await tripFile.getByRole("button", { name: "Send final itinerary" }).click();
  await expect(tripFile).toContainText("/api/quotations/itinerary/");

  await page.goto("/supplier/bookings");
  const scheduled = page.getByRole("listitem", { name: `Car City tour ${stamp} ${quotation.ref}` });
  await expect(scheduled).toBeVisible();
  await expect(scheduled.getByRole("combobox").first()).toHaveValue(driverId);
});

// A multi-city trip from its route: Lucknow 2N → Ayodhya 2N lays out 5 days and one
// hotel stay per city on its check-in day; a car picked for a day replaces the route's
// day title with the service's, and the trip title comes from the route.
test("supplier builds a two-city package step by step from its route", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const post = async (path, data) => {
    const response = await request.post(`${base}${path}`, { headers, data });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    return body;
  };
  const stamp = Date.now().toString(36);
  for (const [name, city] of [[`Lucknow Inn ${stamp}`, "Lucknow"], [`Saryu Stay ${stamp}`, "Ayodhya"]]) {
    const hotel = (await post("/hotels", { name, city })).hotel;
    await post(`/hotels/${hotel.id}/rates`, { roomType: "Deluxe", mealPlan: "CP", validFrom: isoDate(-2), validTo: isoDate(400), netPerNightInr: 2000 });
  }
  const cab = (await post("/cab-types", { name: `Sedan ${stamp}`, seats: 4 })).cabType;
  const darshan = (await post("/services", { kind: "SIGHTSEEING", name: `Ayodhya darshan ${stamp}`, city: "Ayodhya", dayTitle: "Ayodhya darshan with a guide" })).service;
  await post(`/services/${darshan.id}/rates`, { cabTypeId: cab.id, validFrom: isoDate(-2), validTo: isoDate(400), vehicleInr: 2500 });

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: "New quotation" }).click();
  await page.getByRole("combobox", { name: "customer-name" }).fill("Ajay Pal Singh");

  await step(page, "Route & hotels");
  await page.getByRole("button", { name: "Add first city" }).click();
  await page.getByRole("combobox", { name: "leg-0-city" }).fill("Lucknow");
  await page.getByLabel("Leg 1 nights").fill("2");
  await page.getByRole("button", { name: "Add city" }).click();
  await page.getByRole("combobox", { name: "leg-1-city" }).fill("Ayodhya");
  await page.getByLabel("Leg 2 nights").fill("2");
  await page.getByRole("button", { name: "Lay out days and hotels from the route" }).click();
  await expect(page.getByText("5 days, one hotel stay per city.")).toBeVisible();
  await pick(page, "hotel-0", `Lucknow Inn ${stamp}`);
  await page.getByRole("combobox", { name: /^Room/ }).first().selectOption("Deluxe");
  await pick(page, "hotel-1", `Saryu Stay ${stamp}`);
  await page.getByRole("combobox", { name: /^Room/ }).nth(1).selectOption("Deluxe");

  await step(page, "Day by day");
  await expect(page.getByLabel("Day 3 title")).toHaveValue("Lucknow to Ayodhya");
  await expect(page.getByText(`Check in Saryu Stay ${stamp}`)).toBeVisible();
  // A day spent in a city takes the city library's text (ADR 048); a car picked for it replaces that.
  await expect(page.getByLabel("Day 4 title")).toHaveValue("Ayodhya: Ram Mandir darshan");
  await page.getByRole("button", { name: "Add car to day 4" }).click();
  await pick(page, "car-2", `Ayodhya darshan ${stamp}`);
  await expect(page.getByLabel("Day 4 title")).toHaveValue("Ayodhya darshan with a guide");

  await step(page, "Price & send");
  // Inclusions read off the trip; exclusions saved once as the standard list for every new quotation.
  await page.getByRole("button", { name: "Add from this trip" }).click();
  await expect(page.getByLabel("What's included")).toHaveValue(/^4 nights' stay in Lucknow, Ayodhya\nDaily breakfast\nPrivate Sedan/);
  await page.getByLabel("Not included").fill(`Airfare\nMonument entry tickets ${stamp}`);
  await page.getByRole("button", { name: "Save as my standard lists" }).click();
  await expect(page.getByText("Saved as your standard lists.")).toBeVisible();
  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  await step(page, "Agent & dates|Customer & dates");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Lucknow & Ayodhya 4N/5D");

  await page.getByRole("button", { name: "All quotations" }).click();
  await page.getByRole("button", { name: "New quotation" }).click();
  await step(page, "Price & send");
  await expect(page.getByLabel("Not included")).toHaveValue(`Airfare\nMonument entry tickets ${stamp}`);
});

// ADR 048: B2B first. The operator adds an agent from the builder, starts from the
// Lucknow – Ayodhya – Varanasi route, picks a hotel per city, sees the agent's net and
// margin, saves the trip as its own route and finds the quotation under the agent.
test("supplier quotes an agent from the Lucknow – Ayodhya – Varanasi route", async ({ page, request }) => {
  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const base = `/api/suppliers/${account.user.supplier_id}`;
  const headers = { Authorization: `Bearer ${account.token}` };
  const post = async (path, data) => {
    const response = await request.post(`${base}${path}`, { headers, data });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    return body;
  };
  const stamp = Date.now().toString(36);
  for (const city of ["Lucknow", "Ayodhya", "Varanasi"]) {
    const hotel = (await post("/hotels", { name: `${city} Grand ${stamp}`, city })).hotel;
    await post(`/hotels/${hotel.id}/rates`, { roomType: "Deluxe", mealPlan: "CP", validFrom: isoDate(-2), validTo: isoDate(400), netPerNightInr: 2500 });
  }

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/dashboard?panel=packages");
  await page.getByRole("button", { name: "New quotation" }).click();
  await expect(page.getByRole("radio", { name: /For a travel agent/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "+ New agent" }).click();
  await page.getByLabel("New agent name").fill(`Awadh Travels ${stamp}`);
  await page.getByLabel("New agent markup").fill("5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Agent added and picked.")).toBeVisible();
  await expect(page.getByText("the agent's markup is 5%")).toBeVisible();
  await page.getByRole("combobox", { name: "customer-name" }).fill("Ajay Pal Singh");

  await step(page, "Route & hotels");
  await pick(page, "route", "Lucknow – Ayodhya – Varanasi 6N/7D");
  await expect(page.getByText("Lucknow 2N → Ayodhya 2N → Varanasi 2N")).toBeVisible();
  await page.getByRole("button", { name: "Use this route" }).click();
  await expect(page.getByText("Lucknow – Ayodhya – Varanasi 6N/7D laid out: 7 days.")).toBeVisible();
  const addMissing = page.getByRole("button", { name: "Add them at example prices" });
  if (await addMissing.isVisible()) {
    await addMissing.click();
    await expect(page.getByText("Added to your rate sheet at the library's example prices")).toBeVisible();
  }
  for (const [index, city] of ["Lucknow", "Ayodhya", "Varanasi"].entries()) {
    await pick(page, `hotel-${index}`, `${city} Grand ${stamp}`);
    await page.getByRole("combobox", { name: /^Room/ }).nth(index).selectOption("Deluxe");
  }

  await step(page, "Day by day");
  await expect(page.getByLabel("Day 4 title")).toHaveValue("Ayodhya: Ram Mandir darshan");
  await expect(page.getByLabel("Day 7 title")).toHaveValue("Depart from Varanasi");
  await expect(page.getByRole("combobox", { name: /^car-/ }).first()).toBeVisible();

  await step(page, "Price & send");
  await expect(page.getByLabel("What's included")).toHaveValue(/Ganga Aarti boat ride in Varanasi/);
  await page.getByRole("button", { name: "Save and price" }).click();
  await expect(page.getByText("Saved and priced.")).toBeVisible();
  const agentPrice = page.getByRole("group", { name: "Agent's price" });
  await expect(agentPrice).toContainText(`Awadh Travels ${stamp} pays you, at 5% markup`);
  await expect(agentPrice).toContainText("Agent's margin");
  await expect(page.getByRole("button", { name: "Send to agent" })).toBeVisible();

  await page.getByRole("button", { name: "Save as my route" }).click();
  await expect(page.getByText("Saved to your routes.")).toBeVisible();

  await page.getByRole("button", { name: "All quotations" }).click();
  await page.getByRole("button", { name: `Awadh Travels ${stamp}`, exact: true }).click();
  await expect(page.getByRole("button", { name: /Lucknow – Ayodhya – Varanasi 6N\/7D/ }).first()).toBeVisible();
});

// ADR 048: the admin writes a shared route with day text and a library car; suppliers see it.
test("admin adds a shared route that suppliers can start quotations from", async ({ page, request }) => {
  const stamp = Date.now().toString(36);
  await loginThroughUi(page, E2E_ACCOUNTS.admin, "/admin/package-library");
  await page.getByRole("tab", { name: "Routes & cities" }).click();
  await expect(page.getByText("Lucknow – Ayodhya – Varanasi 6N/7D")).toBeVisible();
  await page.getByRole("button", { name: "New route" }).click();
  await page.getByLabel("Route name").fill(`Kashi and Sangam ${stamp}`);
  await page.getByLabel("Cities and nights").fill("Varanasi 2, Prayagraj 1");
  await page.getByLabel("Route day 1 title").fill("Arrive in Varanasi");
  await page.getByLabel("Add a car or activity to day 1").selectOption({ label: "Varanasi Airport to Hotel (Varanasi)" });
  await expect(page.getByRole("button", { name: "Remove Varanasi Airport to Hotel" })).toBeVisible();
  await page.getByRole("button", { name: "Save route" }).click();
  await expect(page.getByText(`Kashi and Sangam ${stamp} saved.`)).toBeVisible();

  const login = await request.post("/api/auth/login", { data: E2E_ACCOUNTS.supplier });
  const account = await login.json();
  const library = await (await request.get(`/api/suppliers/${account.user.supplier_id}/route-library`, { headers: { Authorization: `Bearer ${account.token}` } })).json();
  const route = library.routes.find((row) => row.name === `Kashi and Sangam ${stamp}`);
  expect(route.legs).toEqual([{ city: "Varanasi", nights: 2 }, { city: "Prayagraj", nights: 1 }]);
  expect(route.days[0]).toMatchObject({ dayNumber: 1, title: "Arrive in Varanasi", itemIds: ["plib_up_06"] });
});
