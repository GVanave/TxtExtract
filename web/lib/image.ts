/**
 * Shrink phone photos in the browser before upload. A 12 MP photo is 3–8 MB; Vercel accepts at most 4.5 MB
 * per request, and Gemini reads a receipt just as well at ~2000 px on the long side.
 */

import { laplacianVariance, SHARPNESS_WIDTH, toGray } from "./sharpness";

const MAX_SIDE = 2000;
const QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** `sharpness` is null when it could not be measured (PDF, or a format the browser can't open). */
export type PreparedImage = { blob: Blob; name: string; previewUrl: string | null; sharpness: number | null };

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Dieses PDF ist zu groß (mehr als 4 MB).");
    return { blob: file, name: file.name, previewUrl: null, sharpness: null };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser can't decode it (e.g. HEIC outside Safari): send the original if it is small enough.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Dieses Foto ist zu groß. Bitte mach das Foto direkt in der App.");
    return { blob: file, name: file.name, previewUrl: null, sharpness: null };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Das Foto konnte nicht verarbeitet werden.");
  context.drawImage(bitmap, 0, 0, width, height);
  const sharpness = measureSharpness(bitmap);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Das Foto konnte nicht verarbeitet werden.");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { blob, name, previewUrl: URL.createObjectURL(blob), sharpness };
}

/** Sharpness at a fixed width, so photos of any size are judged the same way. */
function measureSharpness(bitmap: ImageBitmap): number | null {
  const scale = Math.min(1, SHARPNESS_WIDTH / bitmap.width);
  const width = Math.max(3, Math.round(bitmap.width * scale));
  const height = Math.max(3, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return laplacianVariance(toGray(context.getImageData(0, 0, width, height).data), width, height);
}
