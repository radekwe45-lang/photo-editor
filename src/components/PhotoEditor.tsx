"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toolbar } from "./Toolbar";
import { EditorCanvas } from "./EditorCanvas";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { GenerativePanel } from "./GenerativePanel";
import { ExportModal } from "./ExportModal";
import { useHistory } from "@/hooks/useHistory";
import {
  applyAdjustments,
  applyMockEditFilter,
  canvasToBlob,
  flipCanvas,
  loadImage,
  rotateCanvas,
} from "@/lib/canvas";
import {
  DEFAULT_ADJUSTMENTS,
  type Adjustments,
  type CropRect,
  type ExportFormat,
  type Tool,
} from "@/lib/types";

interface Snapshot {
  imageSrc: string;
  maskSrc: string | null;
  adjustments: Adjustments;
}

function adjustmentsEqual(a: Adjustments, b: Adjustments): boolean {
  return (
    a.exposure === b.exposure &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.temperature === b.temperature &&
    a.tint === b.tint &&
    a.highlights === b.highlights &&
    a.shadows === b.shadows &&
    a.vignette === b.vignette
  );
}

export function PhotoEditor() {
  const fileRef = useRef<HTMLInputElement>(null);
  const history = useHistory<Snapshot | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState(40);
  const [liveAdj, setLiveAdj] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [exportOpen, setExportOpen] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [comparing, setComparing] = useState(false);

  const snap = history.present;
  const hasImage = !!snap?.imageSrc;
  const previewAdj = comparing ? DEFAULT_ADJUSTMENTS : liveAdj;

  useEffect(() => {
    if (snap) setLiveAdj(snap.adjustments);
  }, [snap]);

  const commitSnapshot = useCallback(
    (next: Snapshot) => {
      history.push(next);
    },
    [history]
  );

  async function openFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const initial: Snapshot = {
        imageSrc: src,
        maskSrc: null,
        adjustments: DEFAULT_ADJUSTMENTS,
      };
      history.reset(initial);
      setLiveAdj(DEFAULT_ADJUSTMENTS);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      setTool("select");
      setComparing(false);
    };
    reader.readAsDataURL(file);
  }

  function onUploadClick() {
    fileRef.current?.click();
  }

  async function bakeCurrent(): Promise<HTMLCanvasElement> {
    if (!snap) throw new Error("No image");
    const img = await loadImage(snap.imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    applyAdjustments(ctx, canvas.width, canvas.height, liveAdj);
    return canvas;
  }

  async function applyGeometry(
    transform: (c: HTMLCanvasElement) => HTMLCanvasElement
  ) {
    if (!snap) return;
    const baked = await bakeCurrent();
    const out = transform(baked);
    commitSnapshot({
      imageSrc: out.toDataURL("image/png"),
      maskSrc: null,
      adjustments: DEFAULT_ADJUSTMENTS,
    });
    setLiveAdj(DEFAULT_ADJUSTMENTS);
  }

  async function onRotate(deg: number) {
    await applyGeometry((c) => rotateCanvas(c, deg));
  }

  async function onFlipH() {
    await applyGeometry((c) => flipCanvas(c, true, false));
  }

  async function onFlipV() {
    await applyGeometry((c) => flipCanvas(c, false, true));
  }

  async function onCropApply(rect: CropRect) {
    if (!snap) return;
    const baked = await bakeCurrent();
    const out = document.createElement("canvas");
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(baked.width - x, Math.floor(rect.w));
    const h = Math.min(baked.height - y, Math.floor(rect.h));
    if (w < 2 || h < 2) return;
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(baked, x, y, w, h, 0, 0, w, h);
    commitSnapshot({
      imageSrc: out.toDataURL("image/png"),
      maskSrc: null,
      adjustments: DEFAULT_ADJUSTMENTS,
    });
    setLiveAdj(DEFAULT_ADJUSTMENTS);
    setTool("select");
  }

  function onMaskChange(dataUrl: string | null) {
    if (!snap) return;
    commitSnapshot({
      ...snap,
      maskSrc: dataUrl,
      adjustments: liveAdj,
    });
  }

  function onAdjCommit() {
    if (!snap) return;
    if (adjustmentsEqual(liveAdj, snap.adjustments)) {
      return;
    }
    commitSnapshot({
      ...snap,
      adjustments: liveAdj,
    });
  }

  async function onGenerate(prompt: string, useMask: boolean) {
    if (!snap) return;
    const baked = await bakeCurrent();
    const blob = await canvasToBlob(baked, "image/png");
    const form = new FormData();
    form.append("image", blob, "image.png");
    form.append("prompt", prompt);

    if (useMask && snap.maskSrc) {
      const maskImg = await loadImage(snap.maskSrc);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = baked.width;
      maskCanvas.height = baked.height;
      const mctx = maskCanvas.getContext("2d")!;
      // OpenAI-style mask: transparent = edit region. Convert our orange overlay alpha to alpha mask.
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      mctx.globalCompositeOperation = "destination-out";
      mctx.drawImage(maskImg, 0, 0, baked.width, baked.height);
      const maskBlob = await canvasToBlob(maskCanvas, "image/png");
      form.append("mask", maskBlob, "mask.png");
    }

    const res = await fetch("/api/edit", { method: "POST", body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        detail = j.error || j.detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }

    const mode = res.headers.get("X-Aperture-Mode");
    const outBlob = await res.blob();
    const url = URL.createObjectURL(outBlob);
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      if (mode === "mock") {
        applyMockEditFilter(canvas);
      }
      commitSnapshot({
        imageSrc: canvas.toDataURL("image/png"),
        maskSrc: null,
        adjustments: DEFAULT_ADJUSTMENTS,
      });
      setLiveAdj(DEFAULT_ADJUSTMENTS);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function doExport(format: ExportFormat, quality: number) {
    if (!snap) return;
    const baked = await bakeCurrent();
    const mime =
      format === "png"
        ? "image/png"
        : format === "jpeg"
          ? "image/jpeg"
          : "image/webp";
    const blob = await canvasToBlob(
      baked,
      mime,
      format === "png" ? undefined : quality
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aperture-export.${format === "jpeg" ? "jpg" : format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportOpen(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history.redo();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Hold \ to show before (no live adjustments)
      if (e.key === "\\" || e.code === "Backslash") {
        e.preventDefault();
        if (hasImage && !e.repeat) setComparing(true);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "v") setTool("select");
      if (k === "h") setTool("pan");
      if (k === "c") setTool("crop");
      if (k === "b") setTool("brush");
      if (k === "e") setTool("eraser");
      if (k === " " && hasImage) {
        e.preventDefault();
        setTool("pan");
      }
      if (k === "=" || k === "+") setZoom((z) => Math.min(5, z + 0.1));
      if (k === "-") setZoom((z) => Math.max(0.1, z - 0.1));
      if (k === "0") {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "\\" || e.code === "Backslash") {
        setComparing(false);
      }
    }
    function onBlur() {
      setComparing(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [history, hasImage]);

  return (
    <div
      className="flex h-dvh flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void openFile(f);
      }}
    >
      <Toolbar
        tool={tool}
        onTool={setTool}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onRotate={onRotate}
        onFlipH={onFlipH}
        onFlipV={onFlipV}
        zoom={zoom}
        onZoom={setZoom}
        onUpload={onUploadClick}
        onExport={() => setExportOpen(true)}
        hasImage={hasImage}
        comparing={comparing}
        onCompareStart={() => setComparing(true)}
        onCompareEnd={() => setComparing(false)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="panel flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-y-0 border-l-0 p-4">
          <AdjustmentsPanel
            value={liveAdj}
            onChange={setLiveAdj}
            onCommit={onAdjCommit}
            disabled={!hasImage}
          />
          <div className="border-t border-white/5 pt-4">
            <label className="mb-3 block space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-chrome-300">Brush size</span>
                <span className="font-mono text-chrome-500">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={160}
                value={brushSize}
                disabled={!hasImage}
                className="slider"
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn w-full text-xs"
              disabled={!snap?.maskSrc}
              onClick={() => snap && onMaskChange(null)}
            >
              Clear mask
            </button>
          </div>
          <div className="mt-auto space-y-2 border-t border-white/5 pt-4 text-[11px] text-chrome-500">
            <div className="font-semibold uppercase tracking-wider text-chrome-600">
              Shortcuts
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
              <span className="kbd">V</span><span>Select</span>
              <span className="kbd">B</span><span>Brush mask</span>
              <span className="kbd">E</span><span>Eraser</span>
              <span className="kbd">C</span><span>Crop</span>
              <span className="kbd">H</span><span>Pan</span>
              <span className="kbd">\\</span><span>Hold: before / after</span>
              <span className="kbd">⌘Z</span><span>Undo</span>
              <span className="kbd">⌘⇧Z</span><span>Redo</span>
              <span className="kbd">+/-</span><span>Zoom</span>
            </div>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">
          <EditorCanvas
            imageSrc={snap?.imageSrc ?? null}
            maskSrc={snap?.maskSrc ?? null}
            adjustments={previewAdj}
            tool={tool}
            zoom={zoom}
            brushSize={brushSize}
            onMaskChange={onMaskChange}
            onCropApply={onCropApply}
            panOffset={panOffset}
            onPanOffset={setPanOffset}
          />
          {comparing && hasImage && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-chrome-200 ring-1 ring-white/10">
              Before
            </div>
          )}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent-glow">
              Drop image to open
            </div>
          )}
        </main>

        <aside className="panel flex w-72 shrink-0 flex-col overflow-y-auto border-y-0 border-r-0 p-4">
          <GenerativePanel
            disabled={!hasImage}
            hasMask={!!snap?.maskSrc}
            onGenerate={onGenerate}
          />
          <div className="mt-6 rounded-lg border border-white/5 bg-chrome-850/60 p-3 text-[11px] leading-relaxed text-chrome-500">
            <div className="mb-1 font-semibold text-chrome-400">Operator note</div>
            Aperture does not ship model weights. Connect your own OpenAI-compatible,
            ComfyUI, or SD WebUI endpoint via <code className="text-chrome-300">.env</code>.
            No CSAM tooling. No non-consensual deepfake helpers.
          </div>
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = "";
        }}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={doExport}
      />
    </div>
  );
}
