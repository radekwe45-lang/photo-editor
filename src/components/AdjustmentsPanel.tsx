"use client";

import type { Adjustments } from "@/lib/types";
import { ADJUSTMENT_PRESETS, DEFAULT_ADJUSTMENTS } from "@/lib/types";

interface Props {
  value: Adjustments;
  onChange: (next: Adjustments) => void;
  onCommit: () => void;
  disabled?: boolean;
}

function SliderRow({
  label,
  value,
  min = -100,
  max = 100,
  onChange,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
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
        min={min}
        max={max}
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

function presetActive(value: Adjustments, preset: Adjustments): boolean {
  return (
    value.exposure === preset.exposure &&
    value.contrast === preset.contrast &&
    value.saturation === preset.saturation &&
    value.temperature === preset.temperature &&
    value.tint === preset.tint &&
    value.highlights === preset.highlights &&
    value.shadows === preset.shadows &&
    value.vignette === preset.vignette &&
    value.sharpen === preset.sharpen &&
    value.clarity === preset.clarity &&
    value.dehaze === preset.dehaze
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

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-chrome-500">
          Presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ADJUSTMENT_PRESETS.map((preset) => {
            const active = presetActive(value, preset.adjustments);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-full bg-accent/20 px-2.5 py-1 text-[11px] text-accent ring-1 ring-accent/40"
                    : "rounded-full bg-chrome-800 px-2.5 py-1 text-[11px] text-chrome-300 ring-1 ring-chrome-700 hover:text-chrome-100"
                }
                onClick={() => {
                  onChange({ ...preset.adjustments });
                  setTimeout(onCommit, 0);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
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
      <SliderRow
        label="Temperature"
        value={value.temperature}
        disabled={disabled}
        onChange={(temperature) => onChange({ ...value, temperature })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Tint"
        value={value.tint}
        disabled={disabled}
        onChange={(tint) => onChange({ ...value, tint })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Highlights"
        value={value.highlights}
        disabled={disabled}
        onChange={(highlights) => onChange({ ...value, highlights })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Shadows"
        value={value.shadows}
        disabled={disabled}
        onChange={(shadows) => onChange({ ...value, shadows })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Vignette"
        value={value.vignette}
        min={0}
        max={100}
        disabled={disabled}
        onChange={(vignette) => onChange({ ...value, vignette })}
        onCommit={onCommit}
      />
      <div className="pt-1 text-[11px] uppercase tracking-wider text-chrome-500">
        Detail
      </div>
      <SliderRow
        label="Sharpen"
        value={value.sharpen}
        min={0}
        max={100}
        disabled={disabled}
        onChange={(sharpen) => onChange({ ...value, sharpen })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Clarity"
        value={value.clarity}
        disabled={disabled}
        onChange={(clarity) => onChange({ ...value, clarity })}
        onCommit={onCommit}
      />
      <SliderRow
        label="Dehaze"
        value={value.dehaze}
        min={0}
        max={100}
        disabled={disabled}
        onChange={(dehaze) => onChange({ ...value, dehaze })}
        onCommit={onCommit}
      />
    </section>
  );
}
