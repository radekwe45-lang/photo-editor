"use client";

import { useState } from "react";
import type { ExportFormat } from "@/lib/types";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat, quality: number) => void;
}

export function ExportModal({ open, onClose, onExport }: Props) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(0.92);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-sm rounded-xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-chrome-100">Export image</h3>
          <button type="button" className="btn h-7 w-7 p-0" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-chrome-400">
            Format
            <select
              className="mt-1 w-full rounded-md border border-white/10 bg-chrome-850 px-2 py-2 text-sm text-chrome-100"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          {format !== "png" && (
            <label className="block text-xs text-chrome-400">
              Quality ({Math.round(quality * 100)}%)
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={quality}
                className="slider mt-2"
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          )}
          <button
            type="button"
            className="btn btn-accent w-full py-2"
            onClick={() => onExport(format, quality)}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
