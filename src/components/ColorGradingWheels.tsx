"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { ColorGradeRegion, ColorGrading } from "@/lib/types";
import { createDefaultColorGrading } from "@/lib/types";

type GradeKey = keyof ColorGrading;

const LABELS: Record<GradeKey, string> = {
  shadows: "Shadows",
  midtones: "Midtones",
  highlights: "Highlights",
};

const WHEEL_SIZE = 72;
const KNOB = 7;

function hueSatFromPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect
): { hue: number; saturation: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const radius = Math.min(rect.width, rect.height) / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const sat = Math.max(0, Math.min(100, (dist / radius) * 100));
  let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
  hue = (hue + 360) % 360;
  return { hue: Math.round(hue), saturation: Math.round(sat) };
}

function ColorWheel({
  label,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: ColorGradeRegion;
  disabled?: boolean;
  onChange: (next: ColorGradeRegion) => void;
  onCommit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = WHEEL_SIZE;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 1;

    ctx.clearRect(0, 0, size, size);

    // Hue/sat disk
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist > radius) {
          data[i + 3] = 0;
          continue;
        }
        let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        hue = (hue + 360) % 360;
        const sat = dist / radius;
        // HSL -> RGB at L=0.5
        const h = hue / 60;
        const c = sat;
        const xC = c * (1 - Math.abs((h % 2) - 1));
        let r = 0,
          g = 0,
          b = 0;
        if (h < 1) {
          r = c;
          g = xC;
        } else if (h < 2) {
          r = xC;
          g = c;
        } else if (h < 3) {
          g = c;
          b = xC;
        } else if (h < 4) {
          g = xC;
          b = c;
        } else if (h < 5) {
          r = xC;
          b = c;
        } else {
          r = c;
          b = xC;
        }
        const m = 0.5 - c / 2;
        data[i] = Math.round((r + m) * 255);
        data[i + 1] = Math.round((g + m) * 255);
        data[i + 2] = Math.round((b + m) * 255);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Soft outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center neutral
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(24,24,27,0.85)";
    ctx.fill();

    // Knob
    const sat01 = Math.max(0, Math.min(1, value.saturation / 100));
    const rad = ((value.hue % 360) * Math.PI) / 180;
    const kx = cx + Math.cos(rad) * sat01 * (radius - 2);
    const ky = cy + Math.sin(rad) * sat01 * (radius - 2);
    ctx.beginPath();
    ctx.arc(kx, ky, KNOB / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }, [value.hue, value.saturation]);

  useEffect(() => {
    draw();
  }, [draw]);

  function setFromEvent(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const next = hueSatFromPointer(clientX, clientY, canvas.getBoundingClientRect());
    onChange(next);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromEvent(e.clientX, e.clientY);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragging.current || disabled) return;
    setFromEvent(e.clientX, e.clientY);
  }

  function endDrag(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit();
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas
        ref={canvasRef}
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        className={
          disabled
            ? "cursor-not-allowed rounded-full opacity-40"
            : "cursor-crosshair rounded-full touch-none"
        }
        aria-label={`${label} color wheel`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="text-[10px] uppercase tracking-wider text-chrome-500">
        {label}
      </div>
      <div className="font-mono text-[10px] text-chrome-600">
        {value.saturation === 0 ? "—" : `${value.hue}° · ${value.saturation}`}
      </div>
    </div>
  );
}

interface Props {
  value: ColorGrading;
  onChange: (next: ColorGrading) => void;
  onCommit: () => void;
  disabled?: boolean;
}

export function ColorGradingWheels({ value, onChange, onCommit, disabled }: Props) {
  function patch(key: GradeKey, region: ColorGradeRegion) {
    onChange({ ...value, [key]: region });
  }

  return (
    <div className="space-y-3 border-t border-white/5 pt-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-chrome-500">
          Color grading
        </div>
        <button
          type="button"
          className="text-[11px] text-chrome-500 hover:text-accent"
          disabled={disabled}
          onClick={() => {
            onChange(createDefaultColorGrading());
            setTimeout(onCommit, 0);
          }}
        >
          Reset
        </button>
      </div>
      <div className="flex justify-between gap-1">
        {(["shadows", "midtones", "highlights"] as GradeKey[]).map((key) => (
          <ColorWheel
            key={key}
            label={LABELS[key]}
            value={value[key]}
            disabled={disabled}
            onChange={(region) => patch(key, region)}
            onCommit={onCommit}
          />
        ))}
      </div>
      <p className="text-[10px] leading-snug text-chrome-600">
        Drag each wheel: angle = hue, distance from center = saturation
        (0 at center = off).
      </p>
    </div>
  );
}
