import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";

import { categorizePrompt, EXTRACTION_PROMPT, retryNote } from "./prompt";
import { z } from "zod";

import { categoryBySlug, type CategorySlug } from "./categories";
import { GEMINI_CATEGORIES_SCHEMA, GEMINI_RECEIPT_SCHEMA } from "./gemini-schema";
import { receiptSchema, type Receipt } from "./receipt";
import { validateReceipt } from "./validation";

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Rate limit and Google-side overload ("model is experiencing high demand"): worth retrying. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 5000, 10000];

export class ExtractionError extends Error {}

export type ExtractionResult = {
  receipt: Receipt;
  /** Gemini's answer before any correction, stored with the receipt. */
  raw: unknown;
  issues: string[];
  model: string;
  attempts: number;
};

/** The single Gemini method we use, so tests can pass a fake. */
export type GenerateContent = (request: {
  model: string;
  contents: unknown;
  config: Record<string, unknown>;
}) => Promise<{ text?: string | undefined }>;

export type ExtractorOptions = {
  apiKey?: string;
  model?: string;
  fallbackModels?: string[];
  generate?: GenerateContent;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

const splitModels = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

export function extractorFromEnv(): ReceiptExtractor {
  return new ReceiptExtractor({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    fallbackModels: splitModels(process.env.GEMINI_FALLBACK_MODEL),
  });
}

export class ReceiptExtractor {
  readonly model: string;
  readonly fallbackModels: string[];
  private readonly generate: GenerateContent;
  private readonly retryDelaysMs: number[];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(options: ExtractorOptions) {
    this.model = options.model || DEFAULT_MODEL;
    this.fallbackModels = (options.fallbackModels ?? []).filter((m) => m !== this.model);
    if (options.generate) {
      this.generate = options.generate;
    } else {
      if (!options.apiKey) throw new ExtractionError("No Gemini API key. Set GEMINI_API_KEY in the environment.");
      const ai = new GoogleGenAI({ apiKey: options.apiKey });
      this.generate = (request) => ai.models.generateContent(request as Parameters<typeof ai.models.generateContent>[0]);
    }
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 2;
  }

  /** Read the receipt; if the numbers don't add up, ask once more with the problems listed. */
  async extract(data: Buffer, mimeType: string): Promise<ExtractionResult> {
    if (data.length === 0) throw new ExtractionError("The image is empty.");

    let best: ExtractionResult | null = null;
    let prompt = EXTRACTION_PROMPT;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const { receipt, model, raw } = await this.callModel(data, mimeType, prompt);
      const issues = validateReceipt(receipt);
      const result = { receipt, raw, issues, model, attempts: attempt };
      if (issues.length === 0) return result;
      if (!best || issues.length < best.issues.length) best = result;
      prompt = EXTRACTION_PROMPT + retryNote(issues);
    }
    return { ...best!, attempts: this.maxAttempts };
  }

  private callModel(data: Buffer, mimeType: string, prompt: string): Promise<{ receipt: Receipt; model: string; raw: unknown }> {
    return this.withModels(async (model) => {
      const response = await this.generate({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: data.toString("base64") } }, { text: prompt }] }],
        config: { responseMimeType: "application/json", responseSchema: GEMINI_RECEIPT_SCHEMA, temperature: 0 },
      });
      return { receipt: parseReceipt(response.text), model, raw: JSON.parse(response.text ?? "null") };
    });
  }

  /** Categories for product names (text only, no image), e.g. for receipts imported from the old sheet. */
  async categorize(names: string[]): Promise<(CategorySlug | null)[]> {
    if (!names.length) return [];
    const text = await this.withModels(async (model) => {
      const response = await this.generate({
        model,
        contents: [{ role: "user", parts: [{ text: categorizePrompt(names) }] }],
        config: { responseMimeType: "application/json", responseSchema: GEMINI_CATEGORIES_SCHEMA, temperature: 0 },
      });
      return response.text;
    });
    const answer = z.object({ categories: z.array(z.string().nullable()) }).safeParse(JSON.parse(text ?? "null"));
    if (!answer.success) throw new ExtractionError("Gemini returned an unexpected answer when categorising products.");
    return names.map((_, i) => categoryBySlug(answer.data.categories[i])?.slug ?? null);
  }

  /** Runs one request on the main model, retrying busy errors, then on each fallback model. */
  private async withModels<T>(request: (model: string) => Promise<T>): Promise<T> {
    const busy: string[] = [];
    const unavailable: string[] = [];

    for (const model of [this.model, ...this.fallbackModels]) {
      for (let attempt = 1; attempt <= this.retryDelaysMs.length + 1; attempt++) {
        try {
          return await request(model);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          if (error.status === 404) {
            unavailable.push(`${model}: not available (404). ${error.message}`);
            break;
          }
          if (!TRANSIENT.has(error.status)) {
            throw new ExtractionError(`Gemini API error ${error.status} (${model}): ${error.message}`);
          }
          if (attempt > this.retryDelaysMs.length) {
            busy.push(`${model}: ${error.status} after ${attempt} tries`);
            break;
          }
          await this.sleep(this.retryDelaysMs[attempt - 1]);
        }
      }
    }

    if (unavailable.length > 0 && busy.length === 0) {
      throw new ExtractionError(
        `No usable Gemini model. ${unavailable.join(" ")} Set GEMINI_MODEL / GEMINI_FALLBACK_MODEL to a current model name.`,
      );
    }
    const hint = this.fallbackModels.length
      ? "Try again in a minute."
      : "Try again in a minute, or set GEMINI_FALLBACK_MODEL so a second model is tried automatically.";
    throw new ExtractionError(`Gemini is busy or rate-limited (${[...busy, ...unavailable].join("; ")}). ${hint}`);
  }
}

export function parseReceipt(text: string | undefined): Receipt {
  if (!text) throw new ExtractionError("Gemini returned an empty response.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ExtractionError("Gemini returned invalid JSON.");
  }
  const parsed = receiptSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExtractionError(`Gemini returned JSON that does not match the receipt schema: ${parsed.error.issues[0]?.message}`);
  }
  // Only products carry a category; the category's source is decided later (memory, or the user in review).
  return {
    ...parsed.data,
    line_items: parsed.data.line_items.map((item) =>
      item.line_type === "product"
        ? { ...item, category_source: item.category ? ("model" as const) : null }
        : { ...item, category: null, category_source: null },
    ),
  };
}
