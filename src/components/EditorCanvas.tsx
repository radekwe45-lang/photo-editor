"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Adjustments, CropRect, Tool } from "@/lib/types";
import {
  applyAdjustments,
  loadImage,
  softCloneStamp,
  softHealStamp,
} from "@/lib/canvas";

interface Props {
  imageSrc: string | null;
  maskSrc: string | null;
  adjustments: Adjustments;
  tool: Tool;
  zoom: number;
  brushSize: number;
  /** width/height; null = freeform crop */
  cropAspect: number | null;
  onMaskChange: (dataUrl: string | null) => void;
  /** Commit a heal/clone stroke baked into the base image (no adjustments). */
  onImagePaint: (dataUrl: string) => void;
  onCropApply: (rect: CropRect) => void;
  panOffset: { x: number; y: number };
  onPanOffset: (o: { x: number; y: number }) => void;
}

function constrainCropRect(
  start: { x: number; y: number },
  pt: { x: number; y: number },
  aspect: number | null,
  bounds: { w: number; h: number }
): CropRect {
  let dx = pt.x - start.x;
  let dy = pt.y - start.y;
  if (aspect && aspect > 0) {
    const signX = dx < 0 ? -1 : 1;
    const signY = dy < 0 ? -1 : 1;
    const absW = Math.abs(dx);
    const absH = Math.abs(dy) || 1e-6;
    if (absW / absH > aspect) {
      dx = signX * absH * aspect;
    } else {
      dy = signY * (absW / aspect);
    }
  }
  let x = Math.min(start.x, start.x + dx);
  let y = Math.min(start.y, start.y + dy);
  let w = Math.abs(dx);
  let h = Math.abs(dy);
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > bounds.w) w = bounds.w - x;
  if (y + h > bounds.h) h = bounds.h - y;
  if (aspect && aspect > 0 && w > 0 && h > 0) {
    const cur = w / h;
    if (Math.abs(cur - aspect) > 0.001) {
      if (cur > aspect) w = h * aspect;
      else h = w / aspect;
      if (x + w > bounds.w) {
        w = bounds.w - x;
        h = w / aspect;
      }
      if (y + h > bounds.h) {
        h = bounds.h - y;
        w = h * aspect;
      }
    }
  }
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

export function EditorCanvas({
  imageSrc,
  maskSrc,
  adjustments,
  tool,
  zoom,
  brushSize,
  cropAspect,
  onMaskChange,
  onImagePaint,
  onCropApply,
  panOffset,
  onPanOffset,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  /** Base-image paint buffer for heal/clone (no live adjustments). */
  const paintBufRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const painting = useRef(false);
  const imagePainting = useRef(false);
  const panning = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const cloneSource = useRef<{ x: number; y: number } | null>(null);
  /** Fixed offset = source - first stroke point (classic clone stamp). */
  const cloneOffset = useRef<{ x: number; y: number } | null>(null);
  const strokeDirty = useRef(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [cloneMarker, setCloneMarker] = useState<{ x: number; y: number } | null>(
    null
  );

  const ensurePaintBuffer = useCallback(async () => {
    if (!imageSrc) return null;
    let buf = paintBufRef.current;
    const img = imageRef.current ?? (await loadImage(imageSrc));
    imageRef.current = img;
    if (!buf || buf.width !== img.naturalWidth || buf.height !== img.naturalHeight) {
      buf = document.createElement("canvas");
      buf.width = img.naturalWidth;
      buf.height = img.naturalHeight;
      paintBufRef.current = buf;
      buf.getContext("2d")!.drawImage(img, 0, 0);
    }
    return buf;
  }, [imageSrc]);

  const refreshDisplayFromBuffer = useCallback(() => {
    const canvas = displayRef.current;
    const buf = paintBufRef.current;
    if (!canvas || !buf) return;
    const ctx = canvas.getContext("2d")!;
    if (canvas.width !== buf.width || canvas.height !== buf.height) {
      canvas.width = buf.width;
      canvas.height = buf.height;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0);
    applyAdjustments(ctx, canvas.width, canvas.height, adjustments);
  }, [adjustments]);

  const redraw = useCallback(async () => {
    const canvas = displayRef.current;
    if (!canvas || !imageSrc) return;
    // Skip full reload while an image-paint stroke is in progress
    if (imagePainting.current) return;
    const img = await loadImage(imageSrc);
    imageRef.current = img;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });

    // Sync paint buffer to the committed base image
    const buf = document.createElement("canvas");
    buf.width = img.naturalWidth;
    buf.height = img.naturalHeight;
    buf.getContext("2d")!.drawImage(img, 0, 0);
    paintBufRef.current = buf;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    applyAdjustments(ctx, canvas.width, canvas.height, adjustments);

    const maskCanvas = maskRef.current;
    if (maskCanvas) {
      if (
        maskCanvas.width !== canvas.width ||
        maskCanvas.height !== canvas.height
      ) {
        const prev = document.createElement("canvas");
        prev.width = maskCanvas.width;
        prev.height = maskCanvas.height;
        prev.getContext("2d")!.drawImage(maskCanvas, 0, 0);
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        maskCanvas.getContext("2d")!.drawImage(prev, 0, 0);
      }
    }
  }, [imageSrc, adjustments]);

  useEffect(() => {
    void redraw();
  }, [redraw]);

  // Clear clone source when leaving clone tool
  useEffect(() => {
    if (tool !== "clone") {
      cloneSource.current = null;
      cloneOffset.current = null;
      setCloneMarker(null);
    }
  }, [tool]);

  useEffect(() => {
    const maskCanvas = maskRef.current;
    if (!maskCanvas || !imageSrc) return;
    (async () => {
      if (maskSrc) {
        const img = await loadImage(maskSrc);
        if (maskCanvas.width === 0) {
          maskCanvas.width = natural.w || img.naturalWidth;
          maskCanvas.height = natural.h || img.naturalHeight;
        }
        const ctx = maskCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        ctx.drawImage(img, 0, 0);
      } else if (natural.w) {
        maskCanvas.width = natural.w;
        maskCanvas.height = natural.h;
        maskCanvas.getContext("2d")!.clearRect(0, 0, natural.w, natural.h);
      }
    })();
  }, [maskSrc, imageSrc, natural.w, natural.h]);

  function canvasPoint(e: ReactPointerEvent) {
    const canvas = displayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function paintAt(x: number, y: number, erasing: boolean) {
    const maskCanvas = maskRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext("2d")!;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    if (erasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    }
    const last = lastPt.current;
    ctx.beginPath();
    if (last) {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y);
    }
    ctx.stroke();
    ctx.restore();
    lastPt.current = { x, y };
  }

  function imagePaintDab(x: number, y: number) {
    const buf = paintBufRef.current;
    if (!buf) return;
    const ctx = buf.getContext("2d")!;
    const radius = brushSize / 2;

    if (tool === "clone") {
      const src = cloneSource.current;
      if (!src) return;
      if (!cloneOffset.current) {
        // Classic stamp: fix offset at first paint point of this stroke
        cloneOffset.current = { x: src.x - x, y: src.y - y };
      }
      const off = cloneOffset.current;
      const sx = x + off.x;
      const sy = y + off.y;
      softCloneStamp(ctx, buf, x, y, sx, sy, radius, 0.85);
      setCloneMarker({ x: sx, y: sy });
    } else if (tool === "heal") {
      softHealStamp(ctx, buf, x, y, radius, 0.9);
    }
    strokeDirty.current = true;
    refreshDisplayFromBuffer();
  }

  function imagePaintStrokeTo(x: number, y: number) {
    const last = lastPt.current;
    const spacing = Math.max(1, brushSize * 0.2);
    if (!last) {
      imagePaintDab(x, y);
      lastPt.current = { x, y };
      return;
    }
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < spacing) return;
    const steps = Math.floor(dist / spacing);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      imagePaintDab(last.x + dx * t, last.y + dy * t);
    }
    lastPt.current = { x, y };
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (!imageSrc) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const pt = canvasPoint(e);

    if (tool === "pan" || e.buttons === 4 || e.altKey) {
      panning.current = true;
      lastPt.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Clone source pick: Ctrl/Cmd-click (Alt is reserved for temporary pan)
    if (tool === "clone" && (e.ctrlKey || e.metaKey)) {
      cloneSource.current = { x: pt.x, y: pt.y };
      cloneOffset.current = null;
      setCloneMarker({ x: pt.x, y: pt.y });
      return;
    }

    if (tool === "brush" || tool === "eraser") {
      painting.current = true;
      lastPt.current = null;
      paintAt(pt.x, pt.y, tool === "eraser");
      return;
    }

    if (tool === "heal" || tool === "clone") {
      if (tool === "clone" && !cloneSource.current) {
        // No source yet — ignore paint (user must Ctrl/Cmd-click first)
        return;
      }
      imagePainting.current = true;
      strokeDirty.current = false;
      cloneOffset.current = null; // recompute offset per stroke from fixed source
      lastPt.current = null;
      void (async () => {
        await ensurePaintBuffer();
        if (!imagePainting.current) return;
        imagePaintStrokeTo(pt.x, pt.y);
      })();
      return;
    }

    if (tool === "crop") {
      cropStart.current = pt;
      setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (panning.current && lastPt.current) {
      const dx = e.clientX - lastPt.current.x;
      const dy = e.clientY - lastPt.current.y;
      lastPt.current = { x: e.clientX, y: e.clientY };
      onPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy });
      return;
    }
    if (painting.current) {
      const pt = canvasPoint(e);
      paintAt(pt.x, pt.y, tool === "eraser");
      return;
    }
    if (imagePainting.current) {
      const pt = canvasPoint(e);
      imagePaintStrokeTo(pt.x, pt.y);
      return;
    }
    if (tool === "crop" && cropStart.current) {
      const pt = canvasPoint(e);
      const canvas = displayRef.current;
      const bounds = {
        w: canvas?.width ?? natural.w,
        h: canvas?.height ?? natural.h,
      };
      setCropRect(constrainCropRect(cropStart.current, pt, cropAspect, bounds));
    }
  }

  function onPointerUp() {
    if (painting.current) {
      painting.current = false;
      lastPt.current = null;
      const maskCanvas = maskRef.current;
      if (maskCanvas) {
        const ctx = maskCanvas.getContext("2d")!;
        const data = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        let has = false;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) {
            has = true;
            break;
          }
        }
        onMaskChange(has ? maskCanvas.toDataURL("image/png") : null);
      }
    }
    if (imagePainting.current) {
      imagePainting.current = false;
      lastPt.current = null;
      const buf = paintBufRef.current;
      if (buf && strokeDirty.current) {
        // Bake into base imageSrc; adjustments stay live in PhotoEditor snapshot
        onImagePaint(buf.toDataURL("image/png"));
      }
      strokeDirty.current = false;
      // Keep clone source; reset per-stroke offset
      cloneOffset.current = null;
      if (cloneSource.current) {
        setCloneMarker({ ...cloneSource.current });
      }
    }
    if (panning.current) {
      panning.current = false;
      lastPt.current = null;
    }
    if (tool === "crop" && cropRect && cropRect.w > 4 && cropRect.h > 4) {
      onCropApply(cropRect);
      setCropRect(null);
      cropStart.current = null;
    } else {
      setCropRect(null);
      cropStart.current = null;
    }
  }

  const cursor =
    tool === "pan"
      ? "grab"
      : tool === "brush" ||
          tool === "eraser" ||
          tool === "heal" ||
          tool === "clone" ||
          tool === "crop"
        ? "crosshair"
        : "default";

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a1a1e_0%,_#0a0a0b_70%)]"
    >
      {!imageSrc && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 text-2xl text-accent">
            A
          </div>
          <p className="text-sm text-chrome-300">Drop an image or click Open</p>
          <p className="mt-1 text-xs text-chrome-600">
            PNG · JPEG · WebP · shortcuts: V B E J S C H · Ctrl+Z
          </p>
        </div>
      )}

      {imageSrc && (
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
          className="relative"
        >
          <div className="relative shadow-panel ring-1 ring-white/10">
            <canvas
              ref={displayRef}
              style={{ cursor, display: "block", maxWidth: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <canvas
              ref={maskRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ mixBlendMode: "screen" }}
            />
            {cropRect && (
              <div
                className="pointer-events-none absolute border-2 border-accent bg-accent/10"
                style={{
                  left: cropRect.x,
                  top: cropRect.y,
                  width: cropRect.w,
                  height: cropRect.h,
                }}
              />
            )}
            {tool === "clone" && cloneMarker && (
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  left: cloneMarker.x,
                  top: cloneMarker.y,
                  transform: "translate(-50%, -50%)",
                }}
                title="Clone source"
              >
                <div className="relative h-4 w-4">
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.9)]" />
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.9)]" />
                  <div className="absolute inset-0 rounded-full border border-sky-300/80" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
