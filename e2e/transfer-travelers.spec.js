import { expect, test } from "@playwright/test";

test("transfer booking panel takes a traveler count and only offers vehicles that seat the group", async ({ page }) => {
  await page.goto("/activity/transfer-goa-mopa-north-goa");
  await expect(page.getByRole("button", { name: /Book Transfer/i })).toBeVisible();

  const addAdult = page.getByRole("button", { name: "Add Adults" });
  await expect(addAdult).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Children" })).toBeVisible();

  const quoteRequest = page.waitForRequest((request) => (
    /\/api\/bookings\/quote/.test(request.url()) && request.postDataJSON()?.adults === 5
  ));
  // Default is 2 adults in a sedan; 5 travelers no longer fit a 4-seat sedan.
  await addAdult.click();
  await addAdult.click();
  await addAdult.click();

  const sedan = page.getByRole("button", { name: /Sedan \(Dzire \/ Etios\)/ });
  await expect(sedan).toBeDisabled();
  await expect(sedan).toContainText("Too small for 5 travelers");

  await quoteRequest;

  await page.getByRole("button", { name: /Book Transfer/i }).click();
  await expect(page).toHaveURL(/\/checkout\//);
  const params = new URL(page.url()).searchParams;
  expect(params.get("adults")).toBe("5");
  expect(params.get("vehicle")).toBe("SUV");
});
