/**
 * How sharp a photo is: the variance of the Laplacian (edge strength) of a greyscale image. Text on a sharp
 * receipt photo has strong edges; a blurred photo has weak ones. Pure maths, so it can be tested without a browser.
 */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += value;
      sumSquares += value * value;
      count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

/** RGBA pixels (from a canvas) to greyscale. */
export function toGray(rgba: ArrayLike<number>): Float32Array {
  const gray = new Float32Array(rgba.length / 4);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return gray;
}

/** Measured at this width; below SHARPNESS_THRESHOLD the app asks whether to take the photo again. */
export const SHARPNESS_WIDTH = 800;
export const SHARPNESS_THRESHOLD = 60;
