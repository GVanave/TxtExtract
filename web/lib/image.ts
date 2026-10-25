/**
 * Shrink phone photos in the browser before upload. A 12 MP photo is 3–8 MB; Vercel accepts at most 4.5 MB
 * per request, and Gemini reads a receipt just as well at ~2000 px on the long side.
 */

const MAX_SIDE = 2000;
const QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type PreparedImage = { blob: Blob; name: string; previewUrl: string | null };

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("This PDF is larger than 4 MB.");
    return { blob: file, name: file.name, previewUrl: null };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // The browser can't decode it (e.g. HEIC outside Safari): send the original if it is small enough.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("This photo format can't be resized in this browser and is over 4 MB.");
    return { blob: file, name: file.name, previewUrl: null };
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process the photo.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Could not process the photo.");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { blob, name, previewUrl: URL.createObjectURL(blob) };
}
