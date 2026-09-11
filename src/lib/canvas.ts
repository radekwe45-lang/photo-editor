import type { Adjustments } from "./types";
import {
  buildCurveLuts,
  computeHistogram,
  isIdentityCurves,
  type HistogramData,
} from "./curves";

export type { HistogramData };
export { computeHistogram };

/** Load an image from a data URL or blob URL. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Apply CSS-like filter chain to a canvas via pixel ops for export fidelity. */
export function applyAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  adj: Adjustments
): void {
  const curves = adj.curves;
  const skipCurves = !curves || isIdentityCurves(curves);
  const hsl = adj.hsl;
  const skipHsl = !hsl || isIdentityHsl(hsl);
  const noiseLum = Math.max(0, Math.min(100, adj.noise?.luminance ?? 0));
  const noiseColor = Math.max(0, Math.min(100, adj.noise?.color ?? 0));
  if (
    adj.exposure === 0 &&
    adj.contrast === 0 &&
    adj.saturation === 0 &&
    adj.temperature === 0 &&
    adj.tint === 0 &&
    adj.highlights === 0 &&
    adj.shadows === 0 &&
    adj.vignette === 0 &&
    adj.sharpen === 0 &&
    adj.clarity === 0 &&
    adj.dehaze === 0 &&
    skipHsl &&
    noiseLum === 0 &&
    noiseColor === 0 &&
    skipCurves
  ) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const exposure = adj.exposure / 100; // -1..1
  const contrast = adj.contrast / 100;
  const saturation = adj.saturation / 100;
  const temperature = adj.temperature / 100;
  const tint = adj.tint / 100;
  const highlights = adj.highlights / 100;
  const shadows = adj.shadows / 100;
  const vignette = Math.max(0, Math.min(1, adj.vignette / 100));
  const sharpen = Math.max(0, Math.min(1, adj.sharpen / 100));
  const clarity = Math.max(-1, Math.min(1, adj.clarity / 100));
  const dehaze = Math.max(0, Math.min(1, adj.dehaze / 100));
  const curveLuts = skipCurves ? null : buildCurveLuts(curves);
  const contrastFactor = (1 + contrast) / (1.0001 - contrast);
  const exposureMul = Math.pow(2, exposure);
  const cx = width / 2;
  const cy = height / 2;
  // Normalize radius so corners reach ~1
  const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * exposureMul;
    let g = d[i + 1] * exposureMul;
    let b = d[i + 2] * exposureMul;

    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    // Luminance for highlights / shadows masks (0..1)
    let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum = Math.max(0, Math.min(1, lum));

    // Highlights: lift/crush bright pixels (mask ~ lum^2)
    if (highlights !== 0) {
      const hMask = lum * lum;
      const hAmt = highlights * hMask * 64;
      r += hAmt;
      g += hAmt;
      b += hAmt;
    }

    // Shadows: lift/crush dark pixels (mask ~ (1-lum)^2)
    if (shadows !== 0) {
      const sMask = (1 - lum) * (1 - lum);
      const sAmt = shadows * sMask * 64;
      r += sAmt;
      g += sAmt;
      b += sAmt;
    }

    // Temperature: warm (+) boosts R / cuts B; cool (-) opposite
    if (temperature !== 0) {
      const tAmt = temperature * 40;
      r += tAmt;
      b -= tAmt;
    }

    // Tint: magenta (+) boosts R+B / cuts G; green (-) opposite
    if (tint !== 0) {
      const tintAmt = tint * 30;
      r += tintAmt * 0.5;
      g -= tintAmt;
      b += tintAmt * 0.5;
    }

    // Dehaze: dark-channel-ish crush + midtone contrast / sat
    if (dehaze > 0) {
      const minC = Math.min(r, g, b) / 255;
      const haze = Math.max(0, Math.min(1, minC));
      const crush = dehaze * haze * 42;
      const gain = 1 + dehaze * 0.22;
      r = (r - crush) * gain;
      g = (g - crush) * gain;
      b = (b - crush) * gain;
      const grayDh = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const satBoost = 1 + dehaze * 0.18;
      r = grayDh + (r - grayDh) * satBoost;
      g = grayDh + (g - grayDh) * satBoost;
      b = grayDh + (b - grayDh) * satBoost;
    }

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray + (r - gray) * (1 + saturation);
    g = gray + (g - gray) * (1 + saturation);
    b = gray + (b - gray) * (1 + saturation);

    if (!skipHsl) {
      const adjRgb = applySelectiveHsl(r, g, b, hsl);
      r = adjRgb[0];
      g = adjRgb[1];
      b = adjRgb[2];
    }

    if (curveLuts) {
      let ri = clamp(r);
      let gi = clamp(g);
      let bi = clamp(b);
      ri = curveLuts.r[ri];
      gi = curveLuts.g[gi];
      bi = curveLuts.b[bi];
      r = curveLuts.master[ri];
      g = curveLuts.master[gi];
      b = curveLuts.master[bi];
    }

    if (vignette > 0) {
      const px = (i / 4) % width;
      const py = Math.floor(i / 4 / width);
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      // Soft radial falloff; strength scales with slider
      const falloff = Math.pow(dist, 1.65);
      const factor = 1 - falloff * vignette * 0.85;
      r *= factor;
      g *= factor;
      b *= factor;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }

  if (noiseLum > 0 || noiseColor > 0) {
    applyNoiseReduction(d, width, height, noiseLum / 100, noiseColor / 100);
  }

  if (sharpen > 0 || clarity !== 0) {
    applyDetailPass(d, width, height, sharpen, clarity);
  }

  ctx.putImageData(imageData, 0, 0);
}

/** Separable box blur on a float buffer (src -> dst). */
function boxBlurPass(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
): void {
  const r = Math.max(1, radius | 0);
  const extent = r * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -r; x <= r; x++) {
        const xx = Math.min(width - 1, Math.max(0, x));
        sum += src[row + xx];
      }
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum / extent;
        const leave = Math.min(width - 1, Math.max(0, x - r));
        const enter = Math.min(width - 1, Math.max(0, x + r + 1));
        sum += src[row + enter] - src[row + leave];
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) {
        const yy = Math.min(height - 1, Math.max(0, y));
        sum += src[yy * width + x];
      }
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / extent;
        const leave = Math.min(height - 1, Math.max(0, y - r));
        const enter = Math.min(height - 1, Math.max(0, y + r + 1));
        sum += src[enter * width + x] - src[leave * width + x];
      }
    }
  }
}

function blurLuma(
  luma: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const tmp = new Float32Array(luma.length);
  const out = new Float32Array(luma.length);
  boxBlurPass(luma, tmp, width, height, radius, true);
  boxBlurPass(tmp, out, width, height, radius, false);
  return out;
}


/** Soft hue-range centers (degrees) and half-widths for selective HSL. */
const HSL_RANGES: { key: keyof NonNullable<Adjustments["hsl"]>; center: number; half: number }[] = [
  { key: "reds", center: 0, half: 22 },
  { key: "oranges", center: 30, half: 18 },
  { key: "yellows", center: 60, half: 18 },
  { key: "greens", center: 120, half: 35 },
  { key: "aquas", center: 180, half: 25 },
  { key: "blues", center: 225, half: 28 },
  { key: "purples", center: 280, half: 22 },
  { key: "magentas", center: 320, half: 22 },
];

function isIdentityHsl(hsl: Adjustments["hsl"]): boolean {
  for (const range of HSL_RANGES) {
    const a = hsl[range.key];
    if (!a) continue;
    if (a.hue !== 0 || a.saturation !== 0 || a.luminance !== 0) return false;
  }
  return true;
}

function hueDistance(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Soft triangular weight in [0,1] for a hue against a range. */
function hueWeight(hue: number, center: number, half: number): number {
  const d = hueDistance(hue, center);
  if (d >= half) return 0;
  return 1 - d / half;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return [
    hue2rgb(p, q, hn + 1 / 3) * 255,
    hue2rgb(p, q, hn) * 255,
    hue2rgb(p, q, hn - 1 / 3) * 255,
  ];
}

function applySelectiveHsl(
  r: number,
  g: number,
  b: number,
  hslAdj: Adjustments["hsl"]
): [number, number, number] {
  const [h0, s0, l0] = rgbToHsl(r, g, b);
  // Near-gray pixels have unstable hue — skip soft contribution
  if (s0 < 0.02) return [r, g, b];

  let dh = 0;
  let ds = 0;
  let dl = 0;
  let wSum = 0;

  for (const range of HSL_RANGES) {
    const a = hslAdj[range.key];
    if (!a || (a.hue === 0 && a.saturation === 0 && a.luminance === 0)) continue;
    const w = hueWeight(h0, range.center, range.half);
    if (w <= 0) continue;
    wSum += w;
    dh += w * (a.hue / 100) * 30; // ±30° at full
    ds += w * (a.saturation / 100);
    dl += w * (a.luminance / 100);
  }

  if (wSum <= 0) return [r, g, b];
  // Normalize overlapping soft masks so stacked ranges don't explode
  const inv = 1 / Math.max(1, wSum);
  dh *= inv;
  ds *= inv;
  dl *= inv;

  const h1 = h0 + dh;
  const s1 = Math.max(0, Math.min(1, s0 * (1 + ds)));
  const l1 = Math.max(0, Math.min(1, l0 + dl * 0.35));
  return hslToRgb(h1, s1, l1);
}

/**
 * MVP noise reduction: blur luma and/or chroma and blend by amount.
 * Uses small radii so live preview stays responsive.
 */
function applyNoiseReduction(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  lumAmt: number,
  colorAmt: number
): void {
  const n = width * height;
  const minSide = Math.min(width, height);

  if (lumAmt > 0) {
    const luma = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      luma[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    const radius = Math.max(1, Math.round(1 + lumAmt * Math.max(2, minSide / 280)));
    const blurred = blurLuma(luma, width, height, radius);
    const mix = lumAmt * 0.92;
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const L = luma[p];
      const Lb = blurred[p];
      const delta = (Lb - L) * mix;
      d[i] = clamp(d[i] + delta);
      d[i + 1] = clamp(d[i + 1] + delta);
      d[i + 2] = clamp(d[i + 2] + delta);
    }
  }

  if (colorAmt > 0) {
    const cr = new Float32Array(n);
    const cg = new Float32Array(n);
    const cb = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      cr[p] = d[i] - L;
      cg[p] = d[i + 1] - L;
      cb[p] = d[i + 2] - L;
    }
    // Color NR uses a slightly larger radius than luma
    const radius = Math.max(1, Math.round(2 + colorAmt * Math.max(3, minSide / 200)));
    const br = blurLuma(cr, width, height, radius);
    const bg = blurLuma(cg, width, height, radius);
    const bb = blurLuma(cb, width, height, radius);
    const mix = colorAmt * 0.95;
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const nr = L + cr[p] + (br[p] - cr[p]) * mix;
      const ng = L + cg[p] + (bg[p] - cg[p]) * mix;
      const nb = L + cb[p] + (bb[p] - cb[p]) * mix;
      d[i] = clamp(nr);
      d[i + 1] = clamp(ng);
      d[i + 2] = clamp(nb);
    }
  }
}

/**
 * Sharpen (unsharp mask) + Clarity (midtone local contrast) using a blurred luma map.
 */
function applyDetailPass(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  sharpen: number,
  clarity: number
): void {
  const n = width * height;
  const luma = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    luma[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }

  const minSide = Math.min(width, height);
  const sharpRadius = Math.max(1, Math.round(minSide / 400));
  const clarityRadius = Math.max(2, Math.round(minSide / 120));

  const sharpBlur =
    sharpen > 0 ? blurLuma(luma, width, height, sharpRadius) : null;
  const clarityBlur =
    clarity !== 0 ? blurLuma(luma, width, height, clarityRadius) : null;

  const sharpAmt = sharpen * 1.35;
  const clarityAmt = clarity * 1.1;

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    const L = luma[p];

    if (sharpBlur) {
      const delta = (L - sharpBlur[p]) * sharpAmt;
      r += delta;
      g += delta;
      b += delta;
    }

    if (clarityBlur) {
      // Midtone mask peaks near 0.5 luma
      const t = L / 255;
      const mid = 1 - Math.abs(t - 0.5) * 2;
      const midMask = mid * mid;
      const delta = (L - clarityBlur[p]) * clarityAmt * midMask;
      r += delta;
      g += delta;
      b += delta;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
}


/** Render adjustments onto a temp copy and return RGB/luma histograms. */
export function histogramFromImageData(
  source: ImageData,
  adj: Adjustments
): HistogramData {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(source, 0, 0);
  applyAdjustments(ctx, canvas.width, canvas.height, adj);
  const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return computeHistogram(out.data, canvas.width, canvas.height);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v | 0));
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      type,
      quality
    );
  });
}

export function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: number
): HTMLCanvasElement {
  // Normalize to (-180, 180] for stable bounding-box math
  let deg = ((degrees % 360) + 360) % 360;
  if (deg > 180) deg -= 360;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.ceil(source.width * cos + source.height * sin));
  out.height = Math.max(1, Math.ceil(source.width * sin + source.height * cos));
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

export function flipCanvas(
  source: HTMLCanvasElement,
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  if (!flipH && !flipV) return source;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(flipH ? out.width : 0, flipV ? out.height : 0);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(source, 0, 0);
  return out;
}

/** Draw a DEMO watermark for mock generative results. */
export function stampDemoWatermark(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const size = Math.max(24, Math.floor(canvas.width / 18));
  ctx.save();
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(245, 158, 11, 0.85)";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "DEMO · MOCK API";
  const x = canvas.width / 2;
  const y = canvas.height - size;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Apply a visible stylized filter used by mock /api/edit. */
export function applyMockEditFilter(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    // Warm cinematic shift + slight vignette-like darkening at edges via index
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    const nx = px / width - 0.5;
    const ny = py / height - 0.5;
    const vig = 1 - Math.min(1, (nx * nx + ny * ny) * 1.6) * 0.35;
    let r = d[i] * 1.08 + 12;
    let g = d[i + 1] * 0.98;
    let b = d[i + 2] * 0.88;
    r *= vig;
    g *= vig;
    b *= vig;
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
  ctx.putImageData(imageData, 0, 0);
  stampDemoWatermark(canvas);
}
