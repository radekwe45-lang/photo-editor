"use client";

import type { CropAspectId } from "@/lib/types";
import { CROP_ASPECT_PRESETS } from "@/lib/types";

interface Props {
  cropAspectId: CropAspectId;
  onCropAspectId: (id: CropAspectId) => void;
  straighten: number;
  onStraighten: (v: number) => void;
  onApplyStraighten: () => void;
  cropToolActive: boolean;
  disabled?: boolean;
}

export function GeometryPanel({
  cropAspectId,
  onCropAspectId,
  straighten,
  onStraighten,
  onApplyStraighten,
  cropToolActive,
  disabled,
}: Props) {
  return (
    <section className="space-y-4 border-t border-white/5 pt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-chrome-400">
        Geometry
      </h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-chrome-300">Crop aspect</span>
          {!cropToolActive && (
            <span className="text-[10px] text-chrome-600">press C</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CROP_ASPECT_PRESETS.map((p) => {
            const active = cropAspectId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                title={p.label}
                onClick={() => onCropAspectId(p.id)}
                className={`btn h-7 px-2 text-[11px] ${active ? "btn-active" : ""}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-chrome-300">Straighten</span>
          <span className="font-mono text-chrome-500">
            {straighten > 0 ? "+" : ""}
            {straighten.toFixed(1)}°
          </span>
        </div>
        <input
          type="range"
          min={-45}
          max={45}
          step={0.5}
          value={straighten}
          disabled={disabled}
          className="slider"
          onChange={(e) => onStraighten(Number(e.target.value))}
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn flex-1 text-xs"
          disabled={disabled || straighten === 0}
          onClick={onApplyStraighten}
        >
          Apply straighten
        </button>
        <button
          type="button"
          className="btn text-xs"
          disabled={disabled || straighten === 0}
          onClick={() => onStraighten(0)}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
