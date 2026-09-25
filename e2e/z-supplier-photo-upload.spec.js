import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, loginThroughUi } from "./helpers/marketplace.js";

// Suppliers can upload product photos instead of pasting links (ADR 021). The
// browser shrinks each photo before upload, so a large one arrives at most
// 1600px on its longest side.

async function makePhoto(page, width, height) {
  const dataUrl = await page.evaluate(([w, h]) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#0e7490");
    gradient.addColorStop(1, "#f59e0b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    return canvas.toDataURL("image/png");
  }, [width, height]);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function naturalSize(page, url) {
  return page.evaluate((src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  }), url);
}

test("supplier uploads a hero photo and gallery photos in the product builder", async ({ page }) => {
  await loginThroughUi(page, E2E_ACCOUNTS.supplier, "/supplier/dashboard");
  await page.goto("/supplier/products/new");
  await page.getByRole("button", { name: /Experience/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const heroInput = page.getByPlaceholder("Upload a photo or paste a link: https://...");
  await expect(heroInput).toBeVisible();

  const big = await makePhoto(page, 3200, 2000);
  await page.getByRole("button", { name: "Upload photo", exact: true })
    .setInputFiles({ name: "beach.png", mimeType: "image/png", buffer: big });
  await expect(heroInput).toHaveValue(/\/uploads\/file_.+\.(webp|jpg)$/);

  const heroUrl = await heroInput.inputValue();
  expect(await naturalSize(page, heroUrl)).toEqual({ width: 1600, height: 1000 });

  const small = await makePhoto(page, 800, 600);
  await page.getByRole("button", { name: "Upload photos", exact: true }).setInputFiles([
    { name: "boat.png", mimeType: "image/png", buffer: small },
    { name: "fort.png", mimeType: "image/png", buffer: small },
  ]);
  const galleryLinks = page.locator('input[placeholder="https://..."]');
  await expect(galleryLinks).toHaveCount(2);
  await expect(galleryLinks.nth(0)).toHaveValue(/\/uploads\/file_.+\.(webp|jpg)$/);
  await expect(galleryLinks.nth(1)).toHaveValue(/\/uploads\/file_.+\.(webp|jpg)$/);
  expect(await naturalSize(page, await galleryLinks.nth(0).inputValue())).toEqual({ width: 800, height: 600 });

  // A pasted link still works alongside uploads.
  await page.getByRole("button", { name: "Add image link" }).click();
  await expect(galleryLinks).toHaveCount(3);
});
