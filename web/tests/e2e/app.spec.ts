import path from "node:path";

import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import ExcelJS from "exceljs";

const RECEIPT = path.join(__dirname, "fixtures", "receipt.jpg");

async function scan(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scan a receipt" })).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(RECEIPT);
  await expect(page.getByText("All checks passed")).toBeVisible({ timeout: 20_000 });
}

async function clickVisible(page: Page, name: RegExp) {
  // Desktop shows the inline buttons, phones the sticky bar: click whichever is visible.
  await page.getByRole("button", { name }).filter({ visible: true }).first().click();
}

/** Both projects (desktop, phone) share one dev server and database: start every project from empty. */
async function deleteEverything(request: APIRequestContext) {
  const { receipts } = await (await request.get("/api/receipts")).json();
  for (const r of receipts) expect((await request.delete(`/api/receipts/${r.id}`)).status()).toBe(204);
}

const line = (raw_text: string, total_price: number, extra: Record<string, unknown> = {}) => ({
  raw_text,
  name: raw_text,
  line_type: "product",
  quantity: null,
  unit: null,
  unit_price: null,
  total_price,
  vat_code: "B",
  category: null,
  ...extra,
});

async function seed(request: APIRequestContext, store_name: string, date: string, items: ReturnType<typeof line>[]) {
  const total = Math.round(items.reduce((s, i) => s + (i.total_price as number), 0) * 100) / 100;
  const receipt = { store_name, store_address: null, date, time: "12:00", currency: "EUR", line_items: items, total, payment_method: null, vat_summary: [] };
  const response = await request.post("/api/receipts", { data: { receipt, model: "seed", allowDuplicate: true } });
  expect(response.status()).toBe(201);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => deleteEverything(request));

test("scan, pick categories, save, view, re-categorise and delete", async ({ page }, info) => {
  await scan(page);
  await expect(page.getByTestId("item-row")).toHaveCount(7);
  await expect(page.getByLabel("Line 1 category")).toHaveValue("dairy"); // Gemini's guess
  await expect(page.getByLabel("Line 4 category")).toHaveCount(0); // Pfand has no category

  // Editing the total breaks the check; fixing it restores it.
  const total = page.getByLabel("Total", { exact: true });
  await total.fill("8,04");
  await expect(page.getByText("Some checks failed")).toBeVisible();
  await total.fill("7,04");
  await expect(page.getByText("All checks passed")).toBeVisible();

  await page.getByLabel("Line 7 category").selectOption("snacks");
  await page.screenshot({ path: info.outputPath("review.png"), fullPage: true });
  await clickVisible(page, /Save receipt/);
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();

  await page.getByRole("link", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: "LIDL" })).toBeVisible();
  await expect(page.getByLabel("Line 7 category")).toHaveValue("snacks");
  await expect(page.getByLabel("Line 6 category")).toHaveCount(0); // the discount follows its product
  const saved = page.waitForResponse((r) => r.url().includes("/api/items/") && r.request().method() === "PATCH");
  await page.getByLabel("Line 2 category").selectOption("other");
  expect((await saved).status()).toBe(204);
  await page.reload();
  await expect(page.getByLabel("Line 2 category")).toHaveValue("other");

  // The next scan of the same products remembers both corrections.
  await scan(page);
  await expect(page.getByLabel("Line 7 category")).toHaveValue("snacks");
  await expect(page.getByLabel("Line 2 category")).toHaveValue("other");
  await expect(page.getByText("remembered").first()).toBeVisible();
  await clickVisible(page, /Discard/);

  await page.goto("/receipts");
  await page.getByRole("link", { name: /LIDL/ }).first().click();
  await page.getByRole("button", { name: "Delete receipt" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/receipts$/);
  await expect(page.getByText("No receipts yet")).toBeVisible();
});

test("warns about duplicates and can save anyway", async ({ page, request }) => {
  await scan(page);
  await clickVisible(page, /Save receipt/);
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Scan next receipt" }).click();
  await page.getByTestId("file-input").setInputFiles(RECEIPT);
  await expect(page.getByText("All checks passed")).toBeVisible({ timeout: 20_000 });
  await clickVisible(page, /Save receipt/);
  await expect(page.getByText("This receipt looks already saved")).toBeVisible();
  await page.getByRole("button", { name: "Save anyway" }).click();
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await deleteEverything(request);
});

test("spending: 5-month chart, tap a month, open a category", async ({ page, request }, info) => {
  // Six months of receipts; the chart shows the last five.
  for (const [month, extra] of [["05", 1], ["06", 2], ["07", 3], ["08", 4], ["09", 5], ["10", 6]] as const) {
    await seed(request, "LIDL", `2026-${month}-03`, [
      line("BIO VOLLM.", 1.19 * extra, { category: "dairy" }),
      line("SCHOKOLADE", 1.29, { category: "snacks" }),
      line("RABATT SCHOKO", -0.39, { line_type: "discount" }),
      line("PFAND", 0.25, { line_type: "deposit" }),
    ]);
  }
  await seed(request, "Rewe Markt GmbH", "2026-09-20", [line("CHIPS", 1.79, { category: "snacks" }), line("BROT", 2.49)]);

  await page.goto("/spending");
  const bars = page.locator('a[href^="/spending?month="][aria-label]');
  await expect(bars).toHaveCount(5);
  await expect(bars.first()).toHaveAttribute("href", "/spending?month=2026-06");
  await expect(page.getByText("so far").first()).toBeVisible(); // October is still running

  await page.getByRole("link", { name: /^September 2026: / }).click();
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(page.getByRole("heading", { name: "September 2026", exact: true })).toBeVisible();
  await expect(page.getByText("2 trips")).toBeVisible();
  await expect(page.getByText("Receipts in September 2026")).toBeVisible();

  await page.getByRole("link", { name: /Snacks & Süßes/ }).click();
  await expect(page).toHaveURL(/category=snacks/);
  const products = page.getByRole("list", { name: "Products" });
  await expect(products.getByText("Schokolade")).toBeVisible();
  await expect(products.getByText("incl. −0,39 € discount")).toBeVisible();
  await expect(products.getByText("Chips")).toBeVisible();
  await expect(page.getByText("Nicht zugeordnet")).toBeVisible(); // BROT had no category
  await page.screenshot({ path: info.outputPath("spending.png"), fullPage: true });

  // Excel export of that month.
  const response = await request.get("/api/export?month=2026-09");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await response.body()) as unknown as ArrayBuffer);
  expect(book.getWorksheet("Receipts")!.rowCount).toBe(3);
  expect(book.getWorksheet("Items")!.rowCount).toBe(7);

  await page.goto("/receipts");
  await expect(page.getByText("7 saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export to Excel" })).toBeVisible();
  await deleteEverything(request);
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

test("the API rejects invalid input", async ({ request }) => {
  const upload = await request.post("/api/extract", { multipart: { image: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") } } });
  expect(upload.status()).toBe(415);
  expect((await request.post("/api/receipts", { data: { receipt: { store_name: "x" } } })).status()).toBe(400);
  const noDate = { store_name: "LIDL", store_address: null, date: null, time: null, currency: "EUR", line_items: [], total: 0, payment_method: null, vat_summary: [] };
  expect((await request.post("/api/receipts", { data: { receipt: noDate } })).status()).toBe(400);
  expect((await request.patch("/api/items/not-a-uuid", { data: { category: "snacks" } })).status()).toBe(404);
  expect((await request.patch("/api/items/00000000-0000-4000-8000-000000000000", { data: { category: "made-up" } })).status()).toBe(400);
  expect((await request.get("/api/export?month=2026-13")).status()).toBe(400);
});
