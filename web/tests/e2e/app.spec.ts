import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

const RECEIPT = path.join(__dirname, "fixtures", "receipt.jpg");

async function scan(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scan a receipt" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(RECEIPT);
  await expect(page.getByText("All checks passed")).toBeVisible({ timeout: 20_000 });
}

async function saveButton(page: Page, name: RegExp) {
  // Desktop shows the inline buttons, phones the sticky bar: click whichever is visible.
  const button = page.getByRole("button", { name }).filter({ visible: true }).first();
  await button.click();
}

test.describe.configure({ mode: "serial" });

test("scan, correct, save, view and delete a receipt", async ({ page }, info) => {
  await scan(page);
  await expect(page.getByTestId("item-row")).toHaveCount(7);
  await expect(page.getByLabel("Line 2 product")).toHaveValue("Bananen");

  // Editing the total breaks the check; fixing it restores it.
  const total = page.getByLabel("Total", { exact: true });
  await total.fill("8,04");
  await expect(page.getByText("Some checks failed")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save for review/ }).filter({ visible: true }).first()).toBeVisible();
  await total.fill("7,04");
  await expect(page.getByText("All checks passed")).toBeVisible();

  // Removing a line and adding it back by hand.
  await page.getByRole("button", { name: "Remove line 7" }).click();
  await expect(page.getByText("Some checks failed")).toBeVisible();
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Line 7 product").fill("Roggenbrot");
  await page.getByLabel("Line 7 total").fill("2,49");
  await expect(page.getByText("All checks passed")).toBeVisible();
  await page.screenshot({ path: info.outputPath("review.png"), fullPage: true });

  await saveButton(page, /Save receipt/);
  await expect(page.getByRole("heading", { name: "Saved to your spreadsheet" })).toBeVisible();
  await expect(page.getByText("7,04 €")).toBeVisible();

  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: "LIDL" })).toBeVisible();
  await expect(page.getByText("Roggenbrot")).toBeVisible();
  await page.screenshot({ path: info.outputPath("detail.png"), fullPage: true });

  await page.getByRole("button", { name: "Delete receipt" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/receipts$/);
  await expect(page.getByText("No receipts yet")).toBeVisible();
});

test("warns about duplicates and can save anyway", async ({ page }) => {
  await scan(page);
  await saveButton(page, /Save receipt/);
  await expect(page.getByRole("heading", { name: "Saved to your spreadsheet" })).toBeVisible();

  await page.getByRole("button", { name: "Scan next receipt" }).click();
  await page.getByTestId("file-input").setInputFiles(RECEIPT);
  await expect(page.getByText("All checks passed")).toBeVisible({ timeout: 20_000 });
  await saveButton(page, /Save receipt/);
  await expect(page.getByText("This receipt looks already saved")).toBeVisible();
  await page.getByRole("button", { name: "Save anyway" }).click();
  await expect(page.getByRole("heading", { name: "Saved to your spreadsheet" })).toBeVisible();
});

test("lists receipts and shows spending", async ({ page }, info) => {
  await page.goto("/receipts");
  await expect(page.getByText("2 saved · 14,08 €")).toBeVisible();
  await expect(page.getByRole("link", { name: /LIDL/ })).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("receipts.png"), fullPage: true });

  await page.goto("/spending");
  await expect(page.getByText("All time")).toBeVisible();
  await expect(page.getByText("14,08 €").first()).toBeVisible();
  await expect(page.getByText("Saved by discounts")).toBeVisible();
  await expect(page.getByText("0,60 €")).toBeVisible();
  await page.screenshot({ path: info.outputPath("spending.png"), fullPage: true });

  // Clean up so the next project starts empty.
  for (let i = 0; i < 2; i++) {
    await page.goto("/receipts");
    await page.getByRole("link", { name: /LIDL/ }).first().click();
    await page.getByRole("button", { name: "Delete receipt" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/receipts$/);
  }
});

test("navigation fits the device", async ({ page, isMobile }) => {
  await page.goto("/");
  const bottomTabs = page.locator("nav.fixed");
  if (isMobile) {
    await expect(bottomTabs).toBeVisible();
    await bottomTabs.getByRole("link", { name: "Spending" }).click();
  } else {
    await expect(bottomTabs).toBeHidden();
    await page.locator("header").getByRole("link", { name: "Spending" }).click();
  }
  await expect(page.getByRole("heading", { name: "Spending" })).toBeVisible();
  await expect(page.getByText("Nothing to show yet")).toBeVisible();
});

test("the API rejects invalid uploads", async ({ request }) => {
  const response = await request.post("/api/extract", { multipart: { image: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") } } });
  expect(response.status()).toBe(415);
  const bad = await request.post("/api/receipts", { data: { receipt: { store_name: "x" } } });
  expect(bad.status()).toBe(400);
});
