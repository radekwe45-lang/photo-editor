"use client";

import {
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  MousePointer2,
  Paintbrush,
  Redo2,
  RotateCcw,
  RotateCw,
  Eraser,
  Undo2,
  ZoomIn,
  ZoomOut,
  Download,
  Upload,
} from "lucide-react";
import type { Tool } from "@/lib/types";

interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: (deg: number) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  onUpload: () => void;
  onExport: () => void;
  hasImage: boolean;
}

function ToolBtn({
  active,
  title,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`btn h-8 w-8 p-0 ${active ? "btn-active" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-white/10" />;
}

export function Toolbar(props: ToolbarProps) {
  const {
    tool,
    onTool,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onRotate,
    onFlipH,
    onFlipV,
    zoom,
    onZoom,
    onUpload,
    onExport,
    hasImage,
  } = props;

  return (
    <header className="panel flex h-12 shrink-0 items-center gap-1 border-x-0 border-t-0 px-3">
      <div className="mr-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/20 text-accent-glow">
          <span className="text-sm font-bold">A</span>
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-chrome-100">
            Aperture
          </div>
          <div className="text-[10px] text-chrome-500">Realistic photo editor</div>
        </div>
      </div>

      <Divider />

      <ToolBtn title="Select (V)" active={tool === "select"} onClick={() => onTool("select")}>
        <MousePointer2 size={16} />
      </ToolBtn>
      <ToolBtn title="Pan (H / Space)" active={tool === "pan"} onClick={() => onTool("pan")} disabled={!hasImage}>
        <Hand size={16} />
      </ToolBtn>
      <ToolBtn title="Crop (C)" active={tool === "crop"} onClick={() => onTool("crop")} disabled={!hasImage}>
        <Crop size={16} />
      </ToolBtn>
      <ToolBtn title="Brush mask (B)" active={tool === "brush"} onClick={() => onTool("brush")} disabled={!hasImage}>
        <Paintbrush size={16} />
      </ToolBtn>
      <ToolBtn title="Eraser mask (E)" active={tool === "eraser"} onClick={() => onTool("eraser")} disabled={!hasImage}>
        <Eraser size={16} />
      </ToolBtn>

      <Divider />

      <ToolBtn title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
        <Undo2 size={16} />
      </ToolBtn>
      <ToolBtn title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>
        <Redo2 size={16} />
      </ToolBtn>

      <Divider />

      <ToolBtn title="Rotate −90°" onClick={() => onRotate(-90)} disabled={!hasImage}>
        <RotateCcw size={16} />
      </ToolBtn>
      <ToolBtn title="Rotate +90°" onClick={() => onRotate(90)} disabled={!hasImage}>
        <RotateCw size={16} />
      </ToolBtn>
      <ToolBtn title="Flip horizontal" onClick={onFlipH} disabled={!hasImage}>
        <FlipHorizontal2 size={16} />
      </ToolBtn>
      <ToolBtn title="Flip vertical" onClick={onFlipV} disabled={!hasImage}>
        <FlipVertical2 size={16} />
      </ToolBtn>

      <Divider />

      <ToolBtn title="Zoom out" onClick={() => onZoom(Math.max(0.1, zoom - 0.1))} disabled={!hasImage}>
        <ZoomOut size={16} />
      </ToolBtn>
      <button
        type="button"
        className="btn min-w-[3.5rem] px-1 font-mono text-xs text-chrome-300"
        title="Reset zoom"
        disabled={!hasImage}
        onClick={() => onZoom(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ToolBtn title="Zoom in" onClick={() => onZoom(Math.min(5, zoom + 0.1))} disabled={!hasImage}>
        <ZoomIn size={16} />
      </ToolBtn>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="btn" onClick={onUpload}>
          <Upload size={15} />
          Open
        </button>
        <button type="button" className="btn btn-accent" onClick={onExport} disabled={!hasImage}>
          <Download size={15} />
          Export
        </button>
      </div>
    </header>
  );
}
