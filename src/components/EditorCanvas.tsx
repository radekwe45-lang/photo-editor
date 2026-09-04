"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Adjustments, CropRect, Tool } from "@/lib/types";
import { applyAdjustments, loadImage } from "@/lib/canvas";

interface Props {
  imageSrc: string | null;
  maskSrc: string | null;
  adjustments: Adjustments;
  tool: Tool;
  zoom: number;
  brushSize: number;
  onMaskChange: (dataUrl: string | null) => void;
  onCropApply: (rect: CropRect) => void;
  panOffset: { x: number; y: number };
  onPanOffset: (o: { x: number; y: number }) => void;
}

export function EditorCanvas({
  imageSrc,
  maskSrc,
  adjustments,
  tool,
  zoom,
  brushSize,
  onMaskChange,
  onCropApply,
  panOffset,
  onPanOffset,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const painting = useRef(false);
  const panning = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const redraw = useCallback(async () => {
    const canvas = displayRef.current;
    if (!canvas || !imageSrc) return;
    const img = await loadImage(imageSrc);
    imageRef.current = img;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
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
    if (tool === "brush" || tool === "eraser") {
      painting.current = true;
      lastPt.current = null;
      paintAt(pt.x, pt.y, tool === "eraser");
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
    if (tool === "crop" && cropStart.current) {
      const pt = canvasPoint(e);
      const x = Math.min(cropStart.current.x, pt.x);
      const y = Math.min(cropStart.current.y, pt.y);
      const w = Math.abs(pt.x - cropStart.current.x);
      const h = Math.abs(pt.y - cropStart.current.y);
      setCropRect({ x, y, w, h });
    }
  }

  function onPointerUp() {
    if (painting.current) {
      painting.current = false;
      lastPt.current = null;
      const maskCanvas = maskRef.current;
      if (maskCanvas) {
        // Check if mask has any pixels
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
      : tool === "brush" || tool === "eraser"
        ? "crosshair"
        : tool === "crop"
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
            PNG · JPEG · WebP · shortcuts: V B E C H · Ctrl+Z
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
          </div>
        </div>
      )}
    </div>
  );
}
