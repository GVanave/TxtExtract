import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";

import { ExtractionError, type GenerateContent, parseReceipt, ReceiptExtractor } from "@/lib/gemini";
import { findDuplicate, MemoryStore, toSaved } from "@/lib/store";

import { LIDL_ITEMS, receipt, saved } from "./fixtures";

const GOOD = receipt(LIDL_ITEMS);
const ok = (r = GOOD) => ({ text: JSON.stringify(r) });
const apiError = (status: number, message = "This model is currently experiencing high demand.") =>
  new ApiError({ status, message });

function scripted(outcomes: (Error | { text: string })[], options: { fallbackModels?: string[] } = {}) {
  const models: string[] = [];
  const sleeps: number[] = [];
  const generate: GenerateContent = async ({ model }) => {
    models.push(model);
    const next = outcomes.shift();
    if (!next) throw new Error("no more scripted outcomes");
    if (next instanceof Error) throw next;
    return next;
  };
  const extractor = new ReceiptExtractor({
    model: "main",
    generate,
    sleep: async (ms) => void sleeps.push(ms),
    ...options,
  });
  return { extractor, models, sleeps };
}

const IMG = Buffer.from("img");

describe("ReceiptExtractor", () => {
  it("extracts a valid receipt in one call", async () => {
    const { extractor, models } = scripted([ok()]);
    const result = await extractor.extract(IMG, "image/jpeg");
    expect(result).toEqual({ receipt: GOOD, issues: [], model: "main", attempts: 1 });
    expect(models).toEqual(["main"]);
  });

  it("asks again when the numbers don't add up, and keeps the better answer", async () => {
    const bad = { ...GOOD, total: 99 };
    const { extractor } = scripted([ok(bad), ok()]);
    const result = await extractor.extract(IMG, "image/jpeg");
    expect(result.issues).toEqual([]);
    expect(result.attempts).toBe(2);
  });

  it("returns the receipt with issues when both readings fail checks", async () => {
    const bad = { ...GOOD, total: 99 };
    const { extractor } = scripted([ok(bad), ok(bad)]);
    const result = await extractor.extract(IMG, "image/jpeg");
    expect(result.issues[0]).toContain("99.00");
  });

  it("retries 503 with backoff, then succeeds", async () => {
    const { extractor, sleeps } = scripted([apiError(503), apiError(503), ok()]);
    const result = await extractor.extract(IMG, "image/jpeg");
    expect(result.model).toBe("main");
    expect(sleeps).toEqual([2000, 5000]);
  });

  it("falls back to the next model when the main one stays busy", async () => {
    const { extractor, models } = scripted([...Array(4).fill(apiError(503)), ok()], { fallbackModels: ["backup"] });
    const result = await extractor.extract(IMG, "image/jpeg");
    expect(models).toEqual(["main", "main", "main", "main", "backup"]);
    expect(result.model).toBe("backup");
  });

  it("skips retired models (404) without retrying", async () => {
    const { extractor, models, sleeps } = scripted([apiError(404, "no longer available"), ok()], { fallbackModels: ["backup"] });
    expect((await extractor.extract(IMG, "image/jpeg")).model).toBe("backup");
    expect(models).toEqual(["main", "backup"]);
    expect(sleeps).toEqual([]);
  });

  it("explains when every model is busy or gone", async () => {
    const { extractor } = scripted([...Array(4).fill(apiError(503)), apiError(404, "gone")], { fallbackModels: ["old"] });
    await expect(extractor.extract(IMG, "image/jpeg")).rejects.toThrow(/main: 503 after 4 tries; old: not available \(404\)\. gone/);
  });

  it("asks for a model name when only retired models are configured", async () => {
    const { extractor } = scripted([apiError(404, "gone")]);
    await expect(extractor.extract(IMG, "image/jpeg")).rejects.toThrow(/No usable Gemini model/);
  });

  it("does not retry permanent errors", async () => {
    const { extractor, models } = scripted([apiError(400, "API key not valid")], { fallbackModels: ["backup"] });
    await expect(extractor.extract(IMG, "image/jpeg")).rejects.toThrow("Gemini API error 400 (main): API key not valid");
    expect(models).toEqual(["main"]);
  });

  it("rejects empty images and missing keys", async () => {
    await expect(scripted([]).extractor.extract(Buffer.alloc(0), "image/jpeg")).rejects.toThrow("empty");
    expect(() => new ReceiptExtractor({})).toThrow(ExtractionError);
  });
});

describe("parseReceipt", () => {
  it("rejects empty, invalid and wrongly shaped answers", () => {
    expect(() => parseReceipt(undefined)).toThrow("empty");
    expect(() => parseReceipt("{")).toThrow("invalid JSON");
    expect(() => parseReceipt('{"store_name": "LIDL"}')).toThrow("does not match");
  });
});

describe("store helpers", () => {
  it("detects duplicates by store, date, time and total", () => {
    const existing = [saved(GOOD)];
    expect(findDuplicate(existing, { ...GOOD, store_name: " lidl " })).not.toBeNull();
    expect(findDuplicate(existing, { ...GOOD, time: "10:00" })).toBeNull();
  });

  it("marks receipts with issues for review", () => {
    const s = toSaved(GOOD, { issues: ["x"], model: "m", imageName: "a.jpg" }, new Date("2026-10-02T10:00:00Z"));
    expect(s).toMatchObject({ needs_review: true, saved_at: "2026-10-02 10:00:00", image_name: "a.jpg" });
  });

  it("memory store saves, lists and deletes", async () => {
    const store = new MemoryStore();
    const a = await store.save(GOOD, { issues: [], model: null, imageName: null });
    expect((await store.list()).map((r) => r.id)).toEqual([a.id]);
    expect(await store.delete(a.id)).toBe(true);
    expect(await store.delete(a.id)).toBe(false);
  });
});
