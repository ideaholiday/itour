import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS } from "./helpers/marketplace.js";

test("an administrator adds a staff member who then signs in to Operations", async ({ page, browser }) => {
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@ideaholiday.in").fill(E2E_ACCOUNTS.admin.email);
  await page.locator('input[type="password"]').fill(E2E_ACCOUNTS.admin.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: /Team/ }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(page.getByText("browser.e2e.ops@example.test")).toBeVisible();

  await page.getByRole("button", { name: "Add team member" }).click();
  await page.getByLabel("Full name").fill("Priya Nair");
  await page.getByLabel("Email").fill("priya.nair@example.test");
  await page.getByLabel("WhatsApp number").fill("98450 12345");
  await page.getByRole("button", { name: "Add member" }).click();

  const credentials = page.getByRole("heading", { name: "Temporary password for Priya Nair" });
  await expect(credentials).toBeVisible();
  await expect(page.getByText("WhatsApp +919845012345")).toBeVisible();
  const password = (await page.locator("strong.select-all").textContent()).trim();
  expect(password.length).toBeGreaterThanOrEqual(12);
  if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/admin-team.png`, fullPage: true });

  // The new staff member signs in at the admin portal and lands in Operations.
  const staff = await browser.newPage();
  await staff.goto("/admin/login");
  await staff.getByPlaceholder("admin@ideaholiday.in").fill("priya.nair@example.test");
  await staff.locator('input[type="password"]').fill(password);
  await staff.locator('button[type="submit"]').click();
  await expect(staff).toHaveURL(/\/ops$/);
  await staff.close();
});
