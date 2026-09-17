import type {
  Adjustments,
  FilmGrain,
  GraduatedFilter,
  RadialFilter,
  SplitTone,
} from "./types";
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
  const grading = adj.colorGrading;
  const skipGrading = !grading || isIdentityColorGrading(grading);
  const graduated = adj.graduated;
  const radial = adj.radial;
  const skipGraduated = !graduated || isIdentityLocalTone(graduated);
  const skipRadial = !radial || isIdentityLocalTone(radial);
  const filmGrain = adj.filmGrain;
  const splitTone = adj.splitTone;
  const skipGrain = !filmGrain || (filmGrain.amount ?? 0) === 0;
  const skipSplitTone = !splitTone || isIdentitySplitTone(splitTone);
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
    skipGrading &&
    noiseLum === 0 &&
    noiseColor === 0 &&
    skipCurves &&
    skipGraduated &&
    skipRadial &&
    skipGrain &&
    skipSplitTone
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

    // 3-way color grading after primary/HSL, before tone curves
    // (creative lift/gamma/gain-style tint; curves remain the final tonal shaper).
    if (!skipGrading) {
      const graded = applyColorGrading(r, g, b, grading);
      r = graded[0];
      g = graded[1];
      b = graded[2];
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

    // Local filters (graduated / radial) after global tone/HSL/grading/curves,
    // before vignette — same blend: out = base + (filtered - base) * mask.
    if (!skipGraduated || !skipRadial) {
      const px = (i / 4) % width;
      const py = Math.floor(i / 4 / width);
      if (!skipGraduated) {
        const m = graduatedMask(px, py, width, height, graduated);
        if (m > 0) {
          const filtered = applyLocalTone(
            r,
            g,
            b,
            graduated.exposure,
            graduated.contrast,
            graduated.saturation,
            graduated.temperature
          );
          r = r + (filtered[0] - r) * m;
          g = g + (filtered[1] - g) * m;
          b = b + (filtered[2] - b) * m;
        }
      }
      if (!skipRadial) {
        const m = radialMask(px, py, width, height, radial);
        if (m > 0) {
          const filtered = applyLocalTone(
            r,
            g,
            b,
            radial.exposure,
            radial.contrast,
            radial.saturation,
            radial.temperature
          );
          r = r + (filtered[0] - r) * m;
          g = g + (filtered[1] - g) * m;
          b = b + (filtered[2] - b) * m;
        }
      }
    }

    // Split tone after local filters / before vignette (Lightroom-style Effects-adjacent
    // creative tint: independent highlight vs shadow hues).
    if (!skipSplitTone) {
      const toned = applySplitTone(r, g, b, splitTone);
      r = toned[0];
      g = toned[1];
      b = toned[2];
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

  // Film grain last — finishing effect after NR/detail so grain is not blurred or
  // over-sharpened. Deterministic hash from pixel coords + image size seed (stable
  // across slider nudges that do not change size).
  if (!skipGrain) {
    applyFilmGrain(d, width, height, filmGrain);
  }

  ctx.putImageData(imageData, 0, 0);
}



function isIdentitySplitTone(st: SplitTone): boolean {
  return (
    (st.highlightSaturation ?? 0) === 0 &&
    (st.shadowSaturation ?? 0) === 0
  );
}

/**
 * Independent highlight / shadow tint (Lightroom Split Toning).
 * balance shifts the luminance pivot (− → more shadow range).
 */
function applySplitTone(
  r: number,
  g: number,
  b: number,
  st: SplitTone
): [number, number, number] {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const balance = Math.max(-1, Math.min(1, (st.balance ?? 0) / 100));
  const pivot = 0.5 + balance * 0.35;
  // Soft complementary masks around pivot
  const hMask = smoothstep(pivot - 0.28, pivot + 0.28, lum);
  const sMask = 1 - hMask;
  const STRENGTH = 0.78;
  let outR = r;
  let outG = g;
  let outB = b;

  const hSat = Math.max(0, Math.min(100, st.highlightSaturation ?? 0)) / 100;
  if (hSat > 0 && hMask > 0) {
    const hue = ((st.highlightHue % 360) + 360) % 360;
    const blended = blendTowardHue(outR, outG, outB, hue, hSat * hMask * STRENGTH);
    outR = blended[0];
    outG = blended[1];
    outB = blended[2];
  }

  const sSat = Math.max(0, Math.min(100, st.shadowSaturation ?? 0)) / 100;
  if (sSat > 0 && sMask > 0) {
    const hue = ((st.shadowHue % 360) + 360) % 360;
    const blended = blendTowardHue(outR, outG, outB, hue, sSat * sMask * STRENGTH);
    outR = blended[0];
    outG = blended[1];
    outB = blended[2];
  }

  return [outR, outG, outB];
}

/** Deterministic value noise in −1..1 from integer lattice coords + seed. */
function hashNoise2D(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393) ^ (iy * 668265263) ^ (seed * 1274126177);
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n & 0xffff) / 0xffff) * 2 - 1;
}

/** Bilinear sample of hashed lattice noise (stable, size-controllable). */
function sampleGrainNoise(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const n00 = hashNoise2D(x0, y0, seed);
  const n10 = hashNoise2D(x0 + 1, y0, seed);
  const n01 = hashNoise2D(x0, y0 + 1, seed);
  const n11 = hashNoise2D(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/**
 * Luminance-biased photographic film grain (not RGB snow).
 * amount/size/roughness: 0..100. Identity when amount is 0.
 * Seed derived from image dimensions so grain does not flicker on slider nudges.
 */
function applyFilmGrain(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  grain: FilmGrain
): void {
  const amount = Math.max(0, Math.min(100, grain.amount ?? 0)) / 100;
  if (amount <= 0) return;
  const size = Math.max(0, Math.min(100, grain.size ?? 40));
  const roughness = Math.max(0, Math.min(100, grain.roughness ?? 35)) / 100;
  // size 0 → ~1px; size 100 → ~8px clumps
  const scale = 1 + (size / 100) * 7;
  const seed = (width * 73856093) ^ (height * 19349663) ^ 0x9e3779b9;
  const seedFine = seed ^ 0x85ebca6b;
  // Peak amplitude in 8-bit units
  const peak = amount * 42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Midtone-weighted visibility (classic film); slight shadow lift
      const mid = 1 - Math.abs(lum - 0.45) * 1.6;
      const shadowBias = (1 - lum) * 0.35;
      const lumaMask = Math.max(0, Math.min(1, mid * 0.75 + shadowBias));

      const n1 = sampleGrainNoise(x, y, scale, seed);
      const n2 = sampleGrainNoise(x, y, Math.max(1, scale * 0.45), seedFine);
      // roughness blends fine octave in and slightly decorrelates channels
      const mono = n1 * (1 - roughness * 0.55) + n2 * (roughness * 0.55);
      const chromaBleed = roughness * 0.18;
      const nr = mono + n2 * chromaBleed * 0.35;
      const ng = mono;
      const nb = mono - n2 * chromaBleed * 0.25;

      const amp = peak * lumaMask;
      r += nr * amp;
      g += ng * amp;
      b += nb * amp;
      d[i] = clamp(r);
      d[i + 1] = clamp(g);
      d[i + 2] = clamp(b);
    }
  }
}

function isIdentityLocalTone(f: {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
}): boolean {
  return (
    f.exposure === 0 &&
    f.contrast === 0 &&
    f.saturation === 0 &&
    f.temperature === 0
  );
}

/** Smoothstep hermite for soft mask edges (t in 0..1). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Local exposure/contrast/sat/temp — same math style as the global pass
 * (pow2 exposure, contrast around 128, temp R/B shift, sat vs luma).
 */
function applyLocalTone(
  r: number,
  g: number,
  b: number,
  exposure: number,
  contrast: number,
  saturation: number,
  temperature: number
): [number, number, number] {
  const e = exposure / 100;
  const c = contrast / 100;
  const s = saturation / 100;
  const t = temperature / 100;
  const exposureMul = Math.pow(2, e);
  let nr = r * exposureMul;
  let ng = g * exposureMul;
  let nb = b * exposureMul;
  if (c !== 0) {
    const contrastFactor = (1 + c) / (1.0001 - c);
    nr = (nr - 128) * contrastFactor + 128;
    ng = (ng - 128) * contrastFactor + 128;
    nb = (nb - 128) * contrastFactor + 128;
  }
  if (t !== 0) {
    const tAmt = t * 40;
    nr += tAmt;
    nb -= tAmt;
  }
  if (s !== 0) {
    const gray = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    nr = gray + (nr - gray) * (1 + s);
    ng = gray + (ng - gray) * (1 + s);
    nb = gray + (nb - gray) * (1 + s);
  }
  return [nr, ng, nb];
}

/** Linear graduated mask 0..1 along angle, with midpoint + feather. */
function graduatedMask(
  x: number,
  y: number,
  width: number,
  height: number,
  f: GraduatedFilter
): number {
  const rad = ((f.angle % 360) * Math.PI) / 180;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  // Normalize pixel to [-0.5, 0.5] so angle is image-aspect aware
  const px = x / Math.max(1, width) - 0.5;
  const py = y / Math.max(1, height) - 0.5;
  const t = px * dirX + py * dirY;
  // Extent of projection over the unit square ≈ half the L1 of direction
  const extent = 0.5 * (Math.abs(dirX) + Math.abs(dirY)) || 0.5;
  const pos = (t / extent + 1) / 2; // 0..1 along gradient axis
  const mid = Math.max(0, Math.min(1, f.midpoint / 100));
  const feather = Math.max(0, Math.min(1, f.feather / 100));
  // feather 0 = hard edge; 100 = transition spans most of the axis
  const half = Math.max(0.001, feather * 0.5);
  let m = smoothstep(mid - half, mid + half, pos);
  if (f.invert) m = 1 - m;
  return m;
}

/** Soft elliptical radial mask; invert=false → effect inside. */
function radialMask(
  x: number,
  y: number,
  width: number,
  height: number,
  f: RadialFilter
): number {
  const cx = (f.centerX / 100) * width;
  const cy = (f.centerY / 100) * height;
  // radius 0..100 as % of half width / half height
  const rx = Math.max(1e-3, (f.radiusX / 100) * (width / 2));
  const ry = Math.max(1e-3, (f.radiusY / 100) * (height / 2));
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const dist = Math.sqrt(nx * nx + ny * ny);
  const feather = Math.max(0, Math.min(1, f.feather / 100));
  // Inner hard radius shrinks as feather grows (soft outer band)
  const inner = Math.max(0, 1 - feather);
  let m = 1 - smoothstep(inner, 1, dist);
  if (f.invert) m = 1 - m;
  return m;
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

function isIdentityColorGrading(g: NonNullable<Adjustments["colorGrading"]>): boolean {
  return (
    (g.shadows?.saturation ?? 0) === 0 &&
    (g.midtones?.saturation ?? 0) === 0 &&
    (g.highlights?.saturation ?? 0) === 0
  );
}

/** Smooth luminance masks for shadows / midtones / highlights (no hard clip). */
function tonalMasks(lum: number): [number, number, number] {
  const l = Math.max(0, Math.min(1, lum));
  // Soft polynomial falloffs that overlap and normalize to ~1
  const s = (1 - l) * (1 - l);
  const h = l * l;
  let m = 1 - Math.abs(l - 0.5) * 2;
  m = m * m;
  const sum = s + m + h || 1;
  return [s / sum, m / sum, h / sum];
}

/**
 * Luma-preserving blend toward a hue at given saturation strength.
 * amount is 0..1 after mask weighting.
 */
function blendTowardHue(
  r: number,
  g: number,
  b: number,
  hue: number,
  amount: number
): [number, number, number] {
  if (amount <= 0.0001) return [r, g, b];
  const [tr, tg, tb] = hslToRgb(hue, 1, 0.5);
  const srcL = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const tgtL = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb || 1;
  const scale = srcL / tgtL;
  const gr = tr * scale;
  const gg = tg * scale;
  const gb = tb * scale;
  const a = Math.max(0, Math.min(1, amount));
  return [
    r + (gr - r) * a,
    g + (gg - g) * a,
    b + (gb - b) * a,
  ];
}

function applyColorGrading(
  r: number,
  g: number,
  b: number,
  grading: NonNullable<Adjustments["colorGrading"]>
): [number, number, number] {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const [ws, wm, wh] = tonalMasks(lum);
  // Global strength so sat=100 is noticeable but not crushed
  const STRENGTH = 0.72;
  let outR = r;
  let outG = g;
  let outB = b;

  const regions: { key: "shadows" | "midtones" | "highlights"; w: number }[] = [
    { key: "shadows", w: ws },
    { key: "midtones", w: wm },
    { key: "highlights", w: wh },
  ];

  for (const { key, w } of regions) {
    const region = grading[key];
    if (!region) continue;
    const sat = Math.max(0, Math.min(100, region.saturation)) / 100;
    if (sat <= 0 || w <= 0) continue;
    const hue = ((region.hue % 360) + 360) % 360;
    const amt = sat * w * STRENGTH;
    const blended = blendTowardHue(outR, outG, outB, hue, amt);
    outR = blended[0];
    outG = blended[1];
    outB = blended[2];
  }

  return [outR, outG, outB];
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


/**
 * Keystone / perspective correction.
 * horizontal & vertical: −100..100.
 * Positive vertical: corrects upward lean (samples a narrower top).
 * Positive horizontal: corrects rightward lean (samples a shorter right edge).
 * Maps the source trapezoid onto a full rectangular output via bilinear sampling.
 */
export function perspectiveCanvas(
  source: HTMLCanvasElement,
  horizontal: number,
  vertical: number
): HTMLCanvasElement {
  const hAmt = Math.max(-1, Math.min(1, horizontal / 100));
  const vAmt = Math.max(-1, Math.min(1, vertical / 100));
  if (hAmt === 0 && vAmt === 0) return source;

  const w = source.width;
  const h = source.height;
  const maxInsetX = w * 0.4;
  const maxInsetY = h * 0.4;

  let tlX = 0;
  let tlY = 0;
  let trX = w - 1;
  let trY = 0;
  let brX = w - 1;
  let brY = h - 1;
  let blX = 0;
  let blY = h - 1;

  if (vAmt > 0) {
    const inset = vAmt * maxInsetX;
    tlX += inset;
    trX -= inset;
  } else if (vAmt < 0) {
    const inset = -vAmt * maxInsetX;
    blX += inset;
    brX -= inset;
  }

  if (hAmt > 0) {
    const inset = hAmt * maxInsetY;
    trY += inset;
    brY -= inset;
  } else if (hAmt < 0) {
    const inset = -hAmt * maxInsetY;
    tlY += inset;
    blY -= inset;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  const sctx = source.getContext("2d")!;
  const srcData = sctx.getImageData(0, 0, w, h);
  const outData = octx.createImageData(w, h);
  const sd = srcData.data;
  const od = outData.data;

  const sample = (sx: number, sy: number, oi: number) => {
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    if (x0 < 0 || y0 < 0 || x1 >= w || y1 >= h) {
      const cx = Math.max(0, Math.min(w - 1, Math.round(sx)));
      const cy = Math.max(0, Math.min(h - 1, Math.round(sy)));
      const si = (cy * w + cx) * 4;
      od[oi] = sd[si];
      od[oi + 1] = sd[si + 1];
      od[oi + 2] = sd[si + 2];
      od[oi + 3] = sd[si + 3];
      return;
    }
    const fx = sx - x0;
    const fy = sy - y0;
    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;
    for (let c = 0; c < 4; c++) {
      od[oi + c] = Math.round(
        sd[i00 + c] * (1 - fx) * (1 - fy) +
          sd[i10 + c] * fx * (1 - fy) +
          sd[i01 + c] * (1 - fx) * fy +
          sd[i11 + c] * fx * fy
      );
    }
  };

  for (let y = 0; y < h; y++) {
    const vv = h === 1 ? 0 : y / (h - 1);
    for (let x = 0; x < w; x++) {
      const uu = w === 1 ? 0 : x / (w - 1);
      const topX = tlX + (trX - tlX) * uu;
      const topY = tlY + (trY - tlY) * uu;
      const botX = blX + (brX - blX) * uu;
      const botY = blY + (brY - blY) * uu;
      const sx = topX + (botX - topX) * vv;
      const sy = topY + (botY - topY) * vv;
      sample(sx, sy, (y * w + x) * 4);
    }
  }

  octx.putImageData(outData, 0, 0);
  return out;
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

/** Soft circular brush stamp: radial alpha falloff 1→0 from center to radius. */
export function createSoftBrushMask(radius: number): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(radius * 2));
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Soft-clone a circular patch from (sx,sy) onto (dx,dy) on the same canvas.
 * Operates on the base pixel buffer (no live adjustments).
 */
export function softCloneStamp(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  dx: number,
  dy: number,
  sx: number,
  sy: number,
  radius: number,
  opacity = 0.85
): void {
  const r = Math.max(1, radius);
  const size = Math.ceil(r * 2);
  const half = size / 2;

  const patch = document.createElement("canvas");
  patch.width = size;
  patch.height = size;
  const pctx = patch.getContext("2d")!;

  // Source patch centered on (sx, sy)
  pctx.drawImage(srcCanvas, sx - half, sy - half, size, size, 0, 0, size, size);

  // Soft edge via destination-in radial mask
  const mask = createSoftBrushMask(r);
  pctx.globalCompositeOperation = "destination-in";
  pctx.drawImage(mask, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(patch, dx - half, dy - half);
  ctx.restore();
}

/**
 * Spot-heal dab: sample a ring around the brush and soft-blend into the center.
 * Pure client-side (no ML) — good for small blemishes on fairly uniform areas.
 */
export function softHealStamp(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  radius: number,
  opacity = 0.9
): void {
  const r = Math.max(1, radius);
  const size = Math.ceil(r * 2);
  const half = size / 2;
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  // Sample ring average BEFORE writing so we read pristine surrounding pixels
  const sctx = srcCanvas.getContext("2d")!;
  const ringInner = r * 1.15;
  const ringOuter = r * 2.1;
  const sampleR = Math.ceil(ringOuter);
  const x0 = Math.max(0, Math.floor(cx - sampleR));
  const y0 = Math.max(0, Math.floor(cy - sampleR));
  const x1 = Math.min(w, Math.ceil(cx + sampleR));
  const y1 = Math.min(h, Math.ceil(cy + sampleR));
  const sw = x1 - x0;
  const sh = y1 - y0;

  let ar = 0;
  let ag = 0;
  let ab = 0;
  let n = 0;
  if (sw > 0 && sh > 0) {
    const data = sctx.getImageData(x0, y0, sw, sh).data;
    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        const dx = x0 + px - cx;
        const dy = y0 + py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= ringInner && dist <= ringOuter) {
          const i = (py * sw + px) * 4;
          ar += data[i];
          ag += data[i + 1];
          ab += data[i + 2];
          n++;
        }
      }
    }
  }

  // Sample origin on a ring ~1.6× radius outside the dab (prefer upward)
  const sampleDist = r * 1.6;
  let sx = cx;
  let sy = cy - sampleDist;
  if (sy < r) sy = cy + sampleDist;
  sx = Math.max(r, Math.min(w - r, sx));
  sy = Math.max(r, Math.min(h - r, sy));

  softCloneStamp(ctx, srcCanvas, cx, cy, sx, sy, r, opacity * 0.75);

  if (n === 0) return;
  ar = Math.round(ar / n);
  ag = Math.round(ag / n);
  ab = Math.round(ab / n);

  const fill = document.createElement("canvas");
  fill.width = size;
  fill.height = size;
  const fctx = fill.getContext("2d")!;
  fctx.fillStyle = `rgb(${ar},${ag},${ab})`;
  fctx.fillRect(0, 0, size, size);
  const mask = createSoftBrushMask(r);
  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(mask, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity * 0.35;
  ctx.drawImage(fill, cx - half, cy - half);
  ctx.restore();
}
