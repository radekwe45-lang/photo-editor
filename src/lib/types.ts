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
};
