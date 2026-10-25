import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { itemsToRows, receiptToRow } from "@/lib/legacy/sheet-rows";
import { SheetsReader } from "@/lib/legacy/sheets-reader";

import { LIDL_ITEMS, legacySaved, receipt } from "./fixtures";

const KEY = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function readerWith(request: (options: { url: string }) => Promise<{ data: unknown }>) {
  const reader = new SheetsReader("sheet-1", "bot@project.iam.gserviceaccount.com", KEY.replace(/\n/g, "\\n"));
  (reader as unknown as { client: unknown }).client = { request, email: "bot@project.iam.gserviceaccount.com" };
  return reader;
}

describe("SheetsReader", () => {
  it("reads both tabs and joins items to receipts", async () => {
    const a = legacySaved(receipt(LIDL_ITEMS), { id: "A" });
    let url = "";
    const reader = readerWith(async (options) => {
      url = decodeURIComponent(options.url);
      return { data: { valueRanges: [{ values: [receiptToRow(a)] }, { values: itemsToRows(a) }] } };
    });
    expect(await reader.list()).toEqual([a]);
    expect(url).toContain("ranges=Receipts!A2:N&ranges=Items!A2:L");
  });

  it("reads an empty sheet", async () => {
    expect(await readerWith(async () => ({ data: { valueRanges: [{}, {}] } })).list()).toEqual([]);
  });

  it("explains a sharing problem", async () => {
    const reader = readerWith(async () => {
      throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
    });
    await expect(reader.list()).rejects.toThrow(/shared with bot@project.iam.gserviceaccount.com/);
  });
});
