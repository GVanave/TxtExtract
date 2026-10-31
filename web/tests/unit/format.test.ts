import { describe, expect, it } from "vitest";

import { differenceInWords, monthLabel, monthName, monthShort } from "@/lib/format";
import { ExtractionError, friendlyExtractionError } from "@/lib/gemini";
import { laplacianVariance, SHARPNESS_THRESHOLD, toGray } from "@/lib/sharpness";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("German wording", () => {
  it("names months in German", () => {
    expect(monthName("2026-03")).toBe("März");
    expect(monthLabel("2026-10")).toBe("Oktober 2026");
    expect(monthShort("2026-12")).toBe("Dez '26");
  });

  it("describes differences as words, not symbols", () => {
    expect(nbsp(differenceInWords(5746))).toBe("57,46 € mehr");
    expect(nbsp(differenceInWords(-1230))).toBe("12,30 € weniger");
    expect(differenceInWords(0)).toBe("genauso viel");
  });

  it("turns technical extraction errors into plain sentences", () => {
    const busy = friendlyExtractionError(new ExtractionError("Gemini API error 503: overloaded", "busy"));
    const setup = friendlyExtractionError(new ExtractionError("GEMINI_API_KEY missing", "setup"));
    const unreadable = friendlyExtractionError(new ExtractionError("invalid JSON"));
    for (const text of [busy, setup, unreadable]) expect(text).not.toMatch(/Gemini|API|JSON|503/);
    expect(busy).toContain("überlastet");
    expect(unreadable).toContain("Foto");
  });
});

describe("photo sharpness", () => {
  const W = 120;
  const H = 120;
  /** Black text-like stripes on white; `blur` softens the edges. */
  function stripes(blur: number): Float32Array {
    const gray = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const phase = (x % 8) / 8;
        const sharp = phase < 0.5 ? 0 : 255;
        const soft = 127.5 - 127.5 * Math.cos(2 * Math.PI * phase);
        gray[y * W + x] = sharp * (1 - blur) + soft * blur;
      }
    }
    return gray;
  }

  it("scores sharp edges high and smooth images low", () => {
    expect(laplacianVariance(stripes(0), W, H)).toBeGreaterThan(SHARPNESS_THRESHOLD);
    expect(laplacianVariance(new Float32Array(W * H).fill(200), W, H)).toBe(0);
    expect(laplacianVariance(stripes(0), W, H)).toBeGreaterThan(laplacianVariance(stripes(1), W, H));
  });

  it("converts RGBA to grey", () => {
    expect(Array.from(toGray([255, 255, 255, 255, 0, 0, 0, 255])).map(Math.round)).toEqual([255, 0]);
  });
});
