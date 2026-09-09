export type Tool =
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "pan";

export type ExportFormat = "png" | "jpeg" | "webp";

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
