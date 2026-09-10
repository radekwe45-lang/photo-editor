import {
  DEFAULT_TONE_CURVES,
  type CurvePoint,
  type ToneCurves,
} from "./types";

export { DEFAULT_TONE_CURVES };

export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export function cloneCurves(c: ToneCurves): ToneCurves {
  return {
    master: c.master.map((p) => ({ ...p })),
    r: c.r.map((p) => ({ ...p })),
    g: c.g.map((p) => ({ ...p })),
    b: c.b.map((p) => ({ ...p })),
  };
}

function pointsEqual(a: CurvePoint[], b: CurvePoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}

export function curvesEqual(a: ToneCurves, b: ToneCurves): boolean {
  return (
    pointsEqual(a.master, b.master) &&
    pointsEqual(a.r, b.r) &&
    pointsEqual(a.g, b.g) &&
    pointsEqual(a.b, b.b)
  );
}

export function isIdentityCurve(points: CurvePoint[]): boolean {
  return pointsEqual(points, IDENTITY_CURVE);
}

export function isIdentityCurves(c: ToneCurves): boolean {
  return curvesEqual(c, DEFAULT_TONE_CURVES);
}

/** Sort + clamp points into a valid tone curve. */
export function normalizeCurvePoints(points: CurvePoint[]): CurvePoint[] {
  const cleaned = points
    .map((p) => ({
      x: Math.max(0, Math.min(1, p.x)),
      y: Math.max(0, Math.min(1, p.y)),
    }))
    .sort((a, b) => a.x - b.x);

  // Enforce unique x (keep last on collision)
  const unique: CurvePoint[] = [];
  for (const p of cleaned) {
    if (unique.length && Math.abs(unique[unique.length - 1].x - p.x) < 1e-6) {
      unique[unique.length - 1] = p;
    } else {
      unique.push(p);
    }
  }

  if (!unique.length || unique[0].x > 0) {
    unique.unshift({ x: 0, y: unique[0]?.y ?? 0 });
  } else {
    unique[0] = { x: 0, y: unique[0].y };
  }
  if (unique[unique.length - 1].x < 1) {
    unique.push({ x: 1, y: unique[unique.length - 1].y });
  } else {
    unique[unique.length - 1] = {
      x: 1,
      y: unique[unique.length - 1].y,
    };
  }
  return unique;
}

/**
 * Sample a monotone-ish cubic Hermite through sorted control points into a 256 LUT.
 * Endpoints are clamped; tangents use Catmull-Rom with finite differences.
 */
export function buildLut(points: CurvePoint[]): Uint8Array {
  const pts = normalizeCurvePoints(points);
  const lut = new Uint8Array(256);

  if (pts.length === 2 && pts[0].y === 0 && pts[1].y === 1) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    lut[i] = Math.max(0, Math.min(255, Math.round(evalCurveY(pts, x) * 255)));
  }
  return lut;
}

function evalCurveY(pts: CurvePoint[], x: number): number {
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].x < x) i++;

  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];

  const dx = p2.x - p1.x || 1e-6;
  const t = (x - p1.x) / dx;

  // Catmull-Rom tangents scaled to segment
  const m1 = ((p2.y - p0.y) / (p2.x - p0.x || 1e-6)) * dx;
  const m2 = ((p3.y - p1.y) / (p3.x - p1.x || 1e-6)) * dx;

  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * p1.y + h10 * m1 + h01 * p2.y + h11 * m2;
}

/** Build master + RGB LUTs once per apply pass. */
export function buildCurveLuts(curves: ToneCurves): {
  master: Uint8Array;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
} {
  return {
    master: buildLut(curves.master),
    r: buildLut(curves.r),
    g: buildLut(curves.g),
    b: buildLut(curves.b),
  };
}

export interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
}

export function emptyHistogram(): HistogramData {
  return {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    luma: new Uint32Array(256),
  };
}

/** Downsample-friendly histogram from RGBA buffer. */
export function computeHistogram(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxSamples = 120_000
): HistogramData {
  const hist = emptyHistogram();
  const total = width * height;
  const step = Math.max(1, Math.ceil(total / maxSamples));
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    hist.r[r]++;
    hist.g[g]++;
    hist.b[b]++;
    const luma = Math.max(
      0,
      Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b))
    );
    hist.luma[luma]++;
  }
  return hist;
}
