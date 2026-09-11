export type Tool =
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "pan";

export type ExportFormat = "png" | "jpeg" | "webp";

export interface CurvePoint {
  /** Input tone 0..1 */
  x: number;
  /** Output tone 0..1 */
  y: number;
}

export type CurveChannel = "master" | "r" | "g" | "b";

export interface ToneCurves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}


export type HslColorRange =
  | "reds"
  | "oranges"
  | "yellows"
  | "greens"
  | "aquas"
  | "blues"
  | "purples"
  | "magentas";

export interface HslRangeAdjust {
  /** Hue shift −100..100 */
  hue: number;
  /** Saturation −100..100 */
  saturation: number;
  /** Luminance −100..100 */
  luminance: number;
}

export type SelectiveHsl = Record<HslColorRange, HslRangeAdjust>;

export interface NoiseReduction {
  /** Luminance denoise 0..100 */
  luminance: number;
  /** Color denoise 0..100 */
  color: number;
}

export interface Adjustments {
  exposure: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  temperature: number; // -100..100 warm/cool
  tint: number; // -100..100 magenta/green
  highlights: number; // -100..100
  shadows: number; // -100..100
  vignette: number; // 0..100 edge darkening
  sharpen: number; // 0..100 unsharp mask
  clarity: number; // -100..100 midtone local contrast
  dehaze: number; // 0..100 haze cut
  hsl: SelectiveHsl;
  noise: NoiseReduction;
  curves: ToneCurves;
}

export interface EditorSnapshot {
  imageDataUrl: string;
  maskDataUrl: string | null;
  adjustments: Adjustments;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const IDENTITY_CURVE_POINTS: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];


const IDENTITY_HSL_RANGE: HslRangeAdjust = {
  hue: 0,
  saturation: 0,
  luminance: 0,
};

export const HSL_COLOR_RANGES: HslColorRange[] = [
  "reds",
  "oranges",
  "yellows",
  "greens",
  "aquas",
  "blues",
  "purples",
  "magentas",
];

export const HSL_RANGE_LABELS: Record<HslColorRange, string> = {
  reds: "Reds",
  oranges: "Oranges",
  yellows: "Yellows",
  greens: "Greens",
  aquas: "Aquas",
  blues: "Blues",
  purples: "Purples",
  magentas: "Magentas",
};

export function createDefaultSelectiveHsl(): SelectiveHsl {
  return {
    reds: { ...IDENTITY_HSL_RANGE },
    oranges: { ...IDENTITY_HSL_RANGE },
    yellows: { ...IDENTITY_HSL_RANGE },
    greens: { ...IDENTITY_HSL_RANGE },
    aquas: { ...IDENTITY_HSL_RANGE },
    blues: { ...IDENTITY_HSL_RANGE },
    purples: { ...IDENTITY_HSL_RANGE },
    magentas: { ...IDENTITY_HSL_RANGE },
  };
}

export const DEFAULT_NOISE: NoiseReduction = {
  luminance: 0,
  color: 0,
};

export const DEFAULT_TONE_CURVES: ToneCurves = {
  master: [...IDENTITY_CURVE_POINTS],
  r: [...IDENTITY_CURVE_POINTS],
  g: [...IDENTITY_CURVE_POINTS],
  b: [...IDENTITY_CURVE_POINTS],
};

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  vignette: 0,
  sharpen: 0,
  clarity: 0,
  dehaze: 0,
  hsl: createDefaultSelectiveHsl(),
  noise: { ...DEFAULT_NOISE },
  curves: {
    master: [...IDENTITY_CURVE_POINTS],
    r: [...IDENTITY_CURVE_POINTS],
    g: [...IDENTITY_CURVE_POINTS],
    b: [...IDENTITY_CURVE_POINTS],
  },
};

export interface AdjustmentPreset {
  id: string;
  label: string;
  adjustments: Adjustments;
}

/** One-click looks built from the adjustment fields. */
export const ADJUSTMENT_PRESETS: AdjustmentPreset[] = [
  {
    id: "neutral",
    label: "Neutral",
    adjustments: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: "portrait",
    label: "Portrait",
    adjustments: {
      exposure: 8,
      contrast: -8,
      saturation: -5,
      temperature: 12,
      tint: 6,
      highlights: -18,
      shadows: 22,
      vignette: 18,
      sharpen: 12,
      clarity: 8,
      dehaze: 0,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
  {
    id: "vibrant",
    label: "Vibrant",
    adjustments: {
      exposure: 4,
      contrast: 18,
      saturation: 28,
      temperature: 6,
      tint: 0,
      highlights: -8,
      shadows: 10,
      vignette: 0,
      sharpen: 18,
      clarity: 16,
      dehaze: 8,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    adjustments: {
      exposure: -6,
      contrast: 22,
      saturation: -12,
      temperature: 16,
      tint: -4,
      highlights: -24,
      shadows: 16,
      vignette: 42,
      sharpen: 10,
      clarity: 20,
      dehaze: 12,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
  {
    id: "bw",
    label: "B&W",
    adjustments: {
      exposure: 0,
      contrast: 20,
      saturation: -100,
      temperature: 0,
      tint: 0,
      highlights: -10,
      shadows: 12,
      vignette: 28,
      sharpen: 22,
      clarity: 14,
      dehaze: 6,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
  {
    id: "cool",
    label: "Cool",
    adjustments: {
      exposure: 2,
      contrast: 8,
      saturation: -4,
      temperature: -28,
      tint: -8,
      highlights: -6,
      shadows: 8,
      vignette: 12,
      sharpen: 8,
      clarity: 6,
      dehaze: 10,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
  {
    id: "warm",
    label: "Warm",
    adjustments: {
      exposure: 6,
      contrast: 6,
      saturation: 10,
      temperature: 32,
      tint: 8,
      highlights: -12,
      shadows: 14,
      vignette: 16,
      sharpen: 8,
      clarity: 10,
      dehaze: 4,
      hsl: createDefaultSelectiveHsl(),
      noise: { ...DEFAULT_NOISE },
      curves: {
        master: [...IDENTITY_CURVE_POINTS],
        r: [...IDENTITY_CURVE_POINTS],
        g: [...IDENTITY_CURVE_POINTS],
        b: [...IDENTITY_CURVE_POINTS],
      },
    },
  },
];

export type CropAspectId = "free" | "1:1" | "4:3" | "3:2" | "16:9" | "9:16";

export interface CropAspectPreset {
  id: CropAspectId;
  label: string;
  /** width / height; null = freeform */
  ratio: number | null;
}

export const CROP_ASPECT_PRESETS: CropAspectPreset[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:2", label: "3:2", ratio: 3 / 2 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];
