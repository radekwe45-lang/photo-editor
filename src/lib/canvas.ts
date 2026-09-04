import type { Adjustments } from "./types";

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
  if (adj.exposure === 0 && adj.contrast === 0 && adj.saturation === 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  const exposure = adj.exposure / 100; // -1..1
  const contrast = adj.contrast / 100;
  const saturation = adj.saturation / 100;
  const contrastFactor = (1 + contrast) / (1.0001 - contrast);
  const exposureMul = Math.pow(2, exposure);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * exposureMul;
    let g = d[i + 1] * exposureMul;
    let b = d[i + 2] * exposureMul;

    r = (r - 128) * contrastFactor + 128;
    g = (g - 128) * contrastFactor + 128;
    b = (b - 128) * contrastFactor + 128;

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray + (r - gray) * (1 + saturation);
    g = gray + (g - gray) * (1 + saturation);
    b = gray + (b - gray) * (1 + saturation);

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);
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
  const rad = ((degrees % 360) * Math.PI) / 180;
  const swap = Math.abs(degrees % 180) === 90;
  const out = document.createElement("canvas");
  out.width = swap ? source.height : source.width;
  out.height = swap ? source.width : source.height;
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
