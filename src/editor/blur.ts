interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Three box passes approximate a Gaussian with a bounded, deterministic WebView fallback.
 * RGB is weighted by alpha; transparent padding must never introduce hidden color values.
 * Only one output image and one scanline are allocated, independent of the blur radius.
 */
export function blurPixels(image: PixelImage, radius: number): Uint8ClampedArray {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 32_000_000 ||
    data.length !== width * height * 4
  )
    throw new Error('The blur image has invalid dimensions.');
  if (!Number.isInteger(radius) || radius < 0 || radius > 32)
    throw new Error('The blur radius must be between 0 and 32 pixels.');

  const result = data.slice();
  if (!radius) return result;
  const line = new Uint8ClampedArray(Math.max(width, height) * 4);
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(result, width, height, radius, false, line);
    blurAxis(result, width, height, radius, true, line);
  }
  return result;
}

function blurAxis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  vertical: boolean,
  line: Uint8ClampedArray,
): void {
  const length = vertical ? height : width;
  const count = vertical ? width : height;
  const stride = vertical ? width * 4 : 4;
  const divisor = radius * 2 + 1;
  for (let row = 0; row < count; row++) {
    const start = vertical ? row * 4 : row * width * 4;
    for (let i = 0; i < length; i++) {
      const source = start + i * stride;
      for (let channel = 0; channel < 4; channel++) line[i * 4 + channel] = data[source + channel]!;
    }
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    const accumulate = (i: number, sign: number) => {
      if (i < 0 || i >= length) return;
      const offset = i * 4;
      const weight = line[offset + 3]! * sign;
      red += line[offset]! * weight;
      green += line[offset + 1]! * weight;
      blue += line[offset + 2]! * weight;
      alpha += weight;
    };
    for (let i = 0; i <= Math.min(radius, length - 1); i++) accumulate(i, 1);
    for (let i = 0; i < length; i++) {
      const offset = start + i * stride;
      data[offset + 3] = alpha / divisor;
      const visible = data[offset + 3]! > 0;
      data[offset] = visible ? red / alpha : 0;
      data[offset + 1] = visible ? green / alpha : 0;
      data[offset + 2] = visible ? blue / alpha : 0;
      accumulate(i - radius, -1);
      accumulate(i + radius + 1, 1);
    }
  }
}
