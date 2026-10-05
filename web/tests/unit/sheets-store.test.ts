import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SheetsStore, StoreError } from "@/lib/store";

import { LIDL_ITEMS, receipt } from "./fixtures";

/** A tiny fake of the Sheets REST API, enough to exercise SheetsStore without Google. */
function fakeSheets(initialTabs: string[] = []) {
  const tabs = new Map<string, { id: number; rows: unknown[][] }>(initialTabs.map((t, i) => [t, { id: i + 1, rows: [] }]));
  const calls: string[] = [];
  let nextId = 100;

  const request = async ({ url, method, data }: { url: string; method: string; data?: Record<string, unknown> }) => {
    const path = decodeURIComponent(url.replace(/^.*\/spreadsheets\/sheet-1/, ""));
    calls.push(`${method} ${path.split("?")[0]}`);
    if (method === "GET" && path.startsWith("?fields")) {
      return { data: { sheets: [...tabs].map(([title, t]) => ({ properties: { title, sheetId: t.id } })) } };
    }
    if (path === ":batchUpdate") {
      const replies = [];
      type Req = {
        addSheet?: { properties: { title: string } };
        deleteDimension?: { range: { sheetId: number; startIndex: number } };
      };
      for (const req of data!.requests as Req[]) {
        if (req.addSheet) {
          const title = req.addSheet.properties.title;
          tabs.set(title, { id: nextId++, rows: [] });
          replies.push({ addSheet: { properties: { title, sheetId: tabs.get(title)!.id } } });
        }
        if (req.deleteDimension) {
          const { sheetId, startIndex } = req.deleteDimension.range;
          const tab = [...tabs.values()].find((t) => t.id === sheetId)!;
          tab.rows.splice(startIndex, 1);
        }
      }
      return { data: { replies } };
    }
    if (path === "/values:batchUpdate") {
      for (const d of data!.data as { range: string; values: unknown[][] }[]) tabs.get(d.range.split("!")[0])!.rows.unshift(...d.values);
      return { data: {} };
    }
    if (path.startsWith("/values:batchGet")) {
      const ranges = [...path.matchAll(/ranges=([^!&]+)!/g)].map((m) => m[1]);
      return { data: { valueRanges: ranges.map((t) => ({ values: tabs.get(t)!.rows.slice(1) })) } };
    }
    const append = path.match(/^\/values\/([^!]+)!A1:append/);
    if (append) {
      expect(path).toContain("valueInputOption=RAW");
      tabs.get(append[1])!.rows.push(...(data!.values as unknown[][]));
      return { data: {} };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { tabs, calls, request };
}

const KEY = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function storeWith(fake: ReturnType<typeof fakeSheets>) {
  const store = new SheetsStore("sheet-1", "bot@project.iam.gserviceaccount.com", KEY.replace(/\n/g, "\\n"));
  (store as unknown as { client: unknown }).client = { request: fake.request, email: "bot@project.iam.gserviceaccount.com" };
  return store;
}

describe("SheetsStore", () => {
  it("creates both tabs with headers on first use, then saves, lists and deletes", async () => {
    const fake = fakeSheets(["Sheet1"]);
    const store = storeWith(fake);

    const a = await store.save(receipt(LIDL_ITEMS), { issues: [], model: "m", imageName: "a.jpg" });
    const b = await store.save(receipt(LIDL_ITEMS.slice(0, 2), { store_name: "REWE", date: "2026-09-01" }), { issues: ["x"], model: "m", imageName: null });

    expect(fake.tabs.get("Receipts")!.rows[0][0]).toBe("Receipt ID");
    expect(fake.tabs.get("Items")!.rows[0][4]).toBe("Printed text");
    expect(fake.tabs.get("Receipts")!.rows).toHaveLength(3);
    expect(fake.tabs.get("Items")!.rows).toHaveLength(1 + 5 + 2);
    expect(fake.calls.filter((c) => c === "POST :batchUpdate")).toHaveLength(1); // tabs created once

    const listed = await store.list();
    expect(listed.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(listed[0].line_items).toEqual(a.line_items);
    expect(listed[1].needs_review).toBe(true);

    expect(await store.delete(a.id)).toBe(true);
    expect((await store.list()).map((r) => r.id)).toEqual([b.id]);
    expect(fake.tabs.get("Items")!.rows).toHaveLength(1 + 2);
    expect(await store.delete("missing")).toBe(false);
  });

  it("explains how to fix a sharing problem", async () => {
    const store = storeWith({
      ...fakeSheets(),
      request: async () => {
        throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
      },
    });
    await expect(store.list()).rejects.toThrow(StoreError);
    await expect(store.list()).rejects.toThrow(/Share the spreadsheet with bot@project.iam.gserviceaccount.com/);
  });

  it("links to the spreadsheet", () => {
    expect(storeWith(fakeSheets()).sheetUrl()).toBe("https://docs.google.com/spreadsheets/d/sheet-1/edit");
  });
});
