import { expect } from "@playwright/test";

export const E2E_ACCOUNTS = Object.freeze({
  supplier: {
    email: "multisolution33@gmail.com",
    password: "Idea@2026",
  },
  operations: {
    email: "browser.e2e.ops@example.test",
    password: "BrowserOps@2026",
  },
});

function futureDate(days = 14) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function sendJson(request, method, path, { token, headers, data } = {}) {
  const response = await request.fetch(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    data,
  });
  const body = await response.json();
  return { response, body };
}

export async function loginThroughUi(page, account, from) {
  await page.goto(`/login?from=${encodeURIComponent(from)}`);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  const loginResponse = page.waitForResponse((response) => (
    response.request().method() === "POST" && /\/api\/auth\/login$/.test(response.url())
  ));
  await page.getByRole("button", { name: "Log in with email" }).click();
  const response = await loginResponse;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${from.replaceAll("/", "\\/")}$`));
}

export async function createPaidBooking(request, suffix) {
  const email = `browser.e2e.${suffix}@example.test`;
  const signup = await sendJson(request, "POST", "/api/auth/signup", {
    data: {
      name: `Browser E2E ${suffix}`,
      email,
      password: "BrowserTraveler@2026",
      phone: "+919876543210",
    },
  });
  expect(signup.response.status(), JSON.stringify(signup.body)).toBe(200);

  const activitiesResponse = await request.get("/api/activities?destination=Goa&type=DAY_TOUR");
  const activities = await activitiesResponse.json();
  expect(activitiesResponse.status(), JSON.stringify(activities)).toBe(200);
  const activity = activities.find((item) => item.groupType === "SHARED") || activities[0];
  expect(activity?.id).toBeTruthy();

  const bookingInput = {
    product_id: activity.id,
    activity_date: futureDate(),
    adults: 2,
    children: 0,
    luggage_bags: 0,
    pickup_time: "09:00",
    pickup_location: "Calangute, Goa",
    traveler_name: signup.body.user.name,
    traveler_email: email,
    traveler_phone: "+919876543210",
    payment_method: "DEMO",
  };
  const created = await sendJson(request, "POST", "/api/bookings", {
    token: signup.body.token,
    headers: { "Idempotency-Key": `browser-e2e-${suffix}` },
    data: bookingInput,
  });
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);

  const paid = await sendJson(request, "POST", "/api/checkout/demo-payment", {
    token: signup.body.token,
    data: { bookingId: created.body.bookingId },
  });
  expect(paid.response.status(), JSON.stringify(paid.body)).toBe(200);

  return {
    ...created.body,
    email,
    token: signup.body.token,
    user: signup.body.user,
  };
}

export async function createRefundDispute(request, booking, subject) {
  const created = await sendJson(request, "POST", "/api/support/cases", {
    token: booking.token,
    data: {
      bookingId: booking.bookingId,
      caseType: "REFUND_DISPUTE",
      category: "REFUND_AMOUNT",
      subject,
      description: "Please review the policy refund amount for this browser test booking.",
      requestedRefundPercentage: 100,
    },
  });
  expect(created.response.status(), JSON.stringify(created.body)).toBe(201);
  return created.body.case;
}
