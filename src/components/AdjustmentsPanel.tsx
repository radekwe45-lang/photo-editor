"use client";

import type { Adjustments } from "@/lib/types";
import { DEFAULT_ADJUSTMENTS } from "@/lib/types";

interface Props {
  value: Adjustments;
  onChange: (next: Adjustments) => void;
  onCommit: () => void;
  disabled?: boolean;
}

function SliderRow({
  label,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-chrome-300">{label}</span>
        <span className="font-mono text-chrome-500">{value}</span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        value={value}
        disabled={disabled}
        className="slider"
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={onCommit}
      />
    </label>
  );
}

export function AdjustmentsPanel({ value, onChange, onCommit, disabled }: Props) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-chrome-400">
          Adjustments
        </h2>
        <button
          type="button"
          className="text-[11px] text-chrome-500 hover:text-accent"
          disabled={disabled}
          onClick={() => {
            onChange(DEFAULT_ADJUSTMENTS);
            // commit after reset
            setTimeout(onCommit, 0);
          }}
        >
          Reset
        </button>
      </div>
      <SliderRow
        label="Exposure"
        value={value.exposure}
        disabled={disabled}
        onChange={(exposure) => onChange({ ...value, exposure })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Contrast"
        value={value.contrast}
        disabled={disabled}
        onChange={(contrast) => onChange({ ...value, contrast })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Saturation"
        value={value.saturation}
        disabled={disabled}
        onChange={(saturation) => onChange({ ...value, saturation })}
        onCommit={onCommit}
      />
    </section>
  );
}
