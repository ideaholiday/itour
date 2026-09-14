import { expect, test } from "@playwright/test";
import { createPaidBooking, E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

test("operations staff see who is signed in, an honest live map, and can sign out", async ({ page, request }) => {
  await createPaidBooking(request, "ops-dashboard");
  await loginThroughUi(page, E2E_ACCOUNTS.operations, "/ops/live");

  await expect(page.getByText("Browser E2E Operations")).toBeVisible();
  await expect(page.getByText("Operations staff")).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin panel" })).toHaveCount(0);

  // The board reports how many drivers really share location (none unless another journey shared one).
  await expect(page.getByText(/^(NO LIVE GPS YET|LIVE GPS \d+\/\d+)$/)).toBeVisible();
  await expect(page.getByText("LIVE GPS ACTIVE")).toHaveCount(0);
  await page.getByRole("button", { name: /Live Map/ }).click();
  await expect(page.getByText(/Live GPS \d+\/\d+/)).toBeVisible();
  if (process.env.E2E_SCREENSHOT_DIR) {
    // Map tiles come from the internet, so only wait for them when capturing a screenshot.
    await expect(page.locator("img.leaflet-tile-loaded").first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/ops-map.png` });
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/ops/live");
  await expect(page.getByText("Browser E2E Operations")).toHaveCount(0);
});
