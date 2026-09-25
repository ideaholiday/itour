import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

// Runs last (zz-): it changes the giveaway cap and one product's commission.
test("an administrator sets the giveaway cap and a product's commission, each with a reason", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@ideaholiday.in").fill(E2E_ACCOUNTS.admin.email);
  await page.locator('input[type="password"]').fill(E2E_ACCOUNTS.admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: /Programs/ }).click();
  await expect(page.getByRole("heading", { name: "Programs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Platform commission" })).toBeVisible();
  await expect(page.getByLabel("Default commission (%)")).toHaveValue("30");

  const giveaway = page.locator("form").filter({ has: page.getByRole("heading", { name: "Giveaway cap" }) });
  await expect(giveaway.getByLabel("Share of booking value (%)")).toHaveValue("10");
  await giveaway.getByLabel("Share of booking value (%)").fill("8");
  await expect(giveaway.getByText("₹800")).toBeVisible();
  await giveaway.getByLabel("Reason for the change").fill("Launch budget");
  await giveaway.getByRole("button", { name: "Save giveaway cap" }).click();
  await expect(page.getByText("Giveaway cap is now 8% for new bookings.")).toBeVisible();
  await expect(page.getByText("“Launch budget”")).toBeVisible();

  // Share & Earn rates are a share of commission and must fit the giveaway cap (8% now).
  const referral = page.locator("form").filter({ has: page.getByRole("heading", { name: "Share & Earn" }) });
  await referral.getByLabel("Friend's first-trip discount (% of commission)").fill("20");
  await referral.getByLabel("Reason for the change").fill("Referral push");
  await referral.getByRole("button", { name: "Save Share & Earn" }).click();
  await expect(page.getByText(/over the 8% giveaway cap/)).toBeVisible();
  await referral.getByLabel("Friend's first-trip discount (% of commission)").fill("15");
  await referral.getByRole("button", { name: "Save Share & Earn" }).click();
  await expect(page.getByText("Share & Earn settings saved for new rewards.")).toBeVisible();

  // Creator tiers ship over the cap; an admin brings one within it.
  const tiers = page.locator("section").filter({ has: page.getByRole("heading", { name: "Creator tiers" }) });
  await expect(tiers.getByText("Over the 8% cap").first()).toBeVisible();
  await tiers.locator("li").filter({ hasText: "Starter" }).getByRole("button", { name: "Edit" }).click();
  await tiers.getByLabel("Commission (% of booking)").fill("5");
  await tiers.getByLabel("Audience discount (%)").fill("3");
  await tiers.getByLabel("Reason").fill("Fit the cap");
  await tiers.getByRole("button", { name: "Save tier" }).click();
  await expect(page.getByText(/Starter tier saved\./)).toBeVisible();
  await expect(tiers.locator("li").filter({ hasText: "Starter" }).getByText("Over the 8% cap")).toHaveCount(0);

  // New suppliers sell under the launch offer; an admin can waive one individually.
  await expect(page.getByRole("heading", { name: "Supplier subscriptions" })).toBeVisible();
  await expect(page.getByLabel("Launch offer on for new suppliers")).toBeChecked();
  await expect(page.getByText(/Launch offer, with no end date/).first()).toBeVisible();
  await page.getByRole("button", { name: "Waive", exact: true }).first().click();
  await page.getByLabel("Free until (empty = no end date)").fill("2099-12-31");
  await page.getByLabel("Reason", { exact: true }).fill("Founding partner");
  await page.getByRole("button", { name: "Waive", exact: true }).first().click();
  await expect(page.getByText(/can take bookings until 2099-12-31/)).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/admin-programs.png`, fullPage: true });

  await page.getByRole("link", { name: /Listings/ }).click();
  await page.getByRole("button", { name: /Commission Overrides/ }).click();
  await expect(page.getByRole("heading", { name: /Platform commission: 30%/ })).toBeVisible();

  // Product rates are listed before supplier rates; each shows the rate it pays.
  const firstProductRate = page.getByRole("button", { name: "30%", exact: true }).first();
  await firstProductRate.click();
  await page.getByLabel(/Rate \(%\)/).fill("25");
  await page.getByLabel("Reason").fill("Partner contract");
  await page.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByText(/25% commission on new bookings/)).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/admin-commission.png`, fullPage: true });
});

test("an administrator creates a coupon, edits it and switches it off", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@ideaholiday.in").fill(E2E_ACCOUNTS.admin.email);
  await page.locator('input[type="password"]').fill(E2E_ACCOUNTS.admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: /Coupons/ }).click();
  await expect(page.getByRole("heading", { name: "Coupons" })).toBeVisible();
  await page.getByRole("button", { name: "New coupon" }).click();
  await page.getByLabel("Code").fill("monsoon15");
  await page.getByLabel("Discount (%)").fill("15");
  await page.getByLabel("Most off per booking (₹, optional)").fill("750");
  await page.getByLabel("Uses per traveler (empty = no limit)").fill("1");
  await page.getByLabel("TOUR").check();
  await page.getByRole("button", { name: "Create coupon" }).click();
  await expect(page.getByText("MONSOON15 created.")).toBeVisible();
  await expect(page.getByText(/15% off up to ₹750 · 1× per traveler · TOUR/)).toBeVisible();

  const row = page.locator("li").filter({ hasText: "MONSOON15" });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Discount (%)").fill("12");
  await page.getByRole("button", { name: "Save coupon" }).click();
  await expect(page.getByText("MONSOON15 saved.")).toBeVisible();
  await expect(row.getByText(/12% off up to ₹750/)).toBeVisible();

  await row.getByRole("button", { name: "Switch off" }).click();
  await expect(row.getByText("Off", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Uses" }).click();
  await expect(page.getByText("Not used yet.")).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/admin-coupons.png`, fullPage: true });
});

test("a new supplier sees their subscription cover and that it isn't on sale yet", async ({ page }) => {
  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.getByRole("link", { name: /^Plans/ }).first().click();
  await expect(page.getByRole("heading", { name: "Subscription & plans" })).toBeVisible();
  await expect(page.getByText(/Subscription waived by Idea Holiday|Free launch offer/)).toBeVisible();
  await expect(page.getByText(/isn't on sale yet/)).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/supplier-subscription.png`, fullPage: true });
});

test("a supplier opens their share kit: QR codes load and the standee prints from its own page", async ({ page, context }) => {
  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.getByRole("link", { name: /^Share kit/ }).first().click();
  await expect(page.getByRole("heading", { name: "Share kit", exact: true })).toBeVisible();
  const qr = page.getByRole("img", { name: "QR code for your public profile" });
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel("Widget embed code")).toHaveValue(/<iframe src=".*\/api\/share\/s\/.*\/widget"/);

  const [standee] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "A5 standee" }).first().click(),
  ]);
  await standee.waitForLoadState();
  await expect(standee.getByRole("heading", { name: "Find us on Idea Holiday" })).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/supplier-share-kit.png`, fullPage: true });
    await standee.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/supplier-standee.png` });
  }
});

test("a supplier gets a Spotlight and a Verified check with a plan coupon; an admin rejects the check", async ({ page, browser, request }) => {
  const adminLogin = await request.post("/api/auth/login", { data: { ...E2E_ACCOUNTS.admin, portal: "admin" } });
  const adminToken = (await adminLogin.json()).token;
  const coupon = await request.post("/api/admin/coupons", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { code: "E2EPLANS100", audience: "SUPPLIER_PLANS", discountType: "PERCENTAGE", discountValue: 100 },
  });
  expect(coupon.status(), await coupon.text()).toBe(201);

  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.getByRole("link", { name: /^Plans/ }).first().click();
  await expect(page.getByRole("heading", { name: "Profile plans" })).toBeVisible();

  await page.getByRole("button", { name: /^Spotlight/ }).click();
  const listing = page.getByLabel("Listing to put on your profile");
  const firstListing = await listing.locator("option").nth(1).textContent();
  await listing.selectOption({ index: 1 });
  await page.getByLabel("Plan coupon code").fill("E2EPLANS100");
  await page.getByRole("button", { name: "See price" }).last().click();
  await expect(page.getByText(/Spotlight: .* − .* coupon .* = ₹0/)).toBeVisible();
  await page.getByRole("button", { name: "Get it with coupon" }).click();
  await expect(page.getByText("Your coupon covers the whole price. It's done.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Spotlights" })).toBeVisible();
  await expect(page.getByText(firstListing.trim(), { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Yearly business check for the Verified badge/ }).click();
  await page.getByLabel("Plan coupon code").fill("E2EPLANS100");
  await page.getByRole("button", { name: "See price" }).last().click();
  await page.getByRole("button", { name: "Get it with coupon" }).click();
  await expect(page.getByText(/Your Verified check is with our team/)).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/supplier-plans.png`, fullPage: true });

  const admin = await browser.newPage();
  await admin.goto("/admin/login");
  await admin.getByPlaceholder("admin@ideaholiday.in").fill(E2E_ACCOUNTS.admin.email);
  await admin.locator('input[type="password"]').fill(E2E_ACCOUNTS.admin.password);
  await admin.locator('button[type="submit"]').click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto("/admin/verifications");
  await expect(admin.getByRole("heading", { name: "Verified checks" })).toBeVisible();
  await admin.getByRole("button", { name: "Reject" }).first().click();
  await admin.getByLabel("Reason the checks did not pass").fill("Owner call not completed");
  await admin.getByRole("button", { name: "Reject and refund" }).click();
  await expect(admin.getByText(/check rejected\. Nothing was paid, so nothing to refund\./)).toBeVisible();
  await admin.close();
});
