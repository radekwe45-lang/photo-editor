"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Adjustments, CurveChannel, CurvePoint, ToneCurves } from "@/lib/types";
import { DEFAULT_TONE_CURVES } from "@/lib/types";
import {
  buildLut,
  cloneCurves,
  computeHistogram,
  isIdentityCurve,
  normalizeCurvePoints,
  type HistogramData,
  emptyHistogram,
} from "@/lib/curves";
import { applyAdjustments, loadImage } from "@/lib/canvas";

const SIZE = 200;
const PAD = 8;
const INNER = SIZE - PAD * 2;

const CHANNELS: { id: CurveChannel; label: string; color: string }[] = [
  { id: "master", label: "RGB", color: "#e4e4e7" },
  { id: "r", label: "R", color: "#f87171" },
  { id: "g", label: "G", color: "#4ade80" },
  { id: "b", label: "B", color: "#60a5fa" },
];

interface Props {
  value: Adjustments;
  onChange: (next: Adjustments) => void;
  onCommit: () => void;
  imageSrc: string | null;
  disabled?: boolean;
}

function toSvg(p: CurvePoint): { x: number; y: number } {
  return {
    x: PAD + p.x * INNER,
    y: PAD + (1 - p.y) * INNER,
  };
}

function fromSvg(x: number, y: number): CurvePoint {
  return {
    x: Math.max(0, Math.min(1, (x - PAD) / INNER)),
    y: Math.max(0, Math.min(1, 1 - (y - PAD) / INNER)),
  };
}

function curvePath(points: CurvePoint[]): string {
  const lut = buildLut(points);
  const parts: string[] = [];
  for (let i = 0; i < 256; i++) {
    const s = toSvg({ x: i / 255, y: lut[i] / 255 });
    parts.push(`${i === 0 ? "M" : "L"}${s.x.toFixed(2)},${s.y.toFixed(2)}`);
  }
  return parts.join(" ");
}

function histPath(bins: Uint32Array, colorChannel: "luma" | "r" | "g" | "b"): string {
  let max = 1;
  for (let i = 0; i < 256; i++) if (bins[i] > max) max = bins[i];
  const parts: string[] = [`M${PAD},${PAD + INNER}`];
  for (let i = 0; i < 256; i++) {
    const x = PAD + (i / 255) * INNER;
    const h = (bins[i] / max) * INNER;
    const y = PAD + INNER - h;
    parts.push(`L${x.toFixed(2)},${y.toFixed(2)}`);
  }
  parts.push(`L${PAD + INNER},${PAD + INNER} Z`);
  void colorChannel;
  return parts.join(" ");
}

export function CurvesHistogram({
  value,
  onChange,
  onCommit,
  imageSrc,
  disabled,
}: Props) {
  const [channel, setChannel] = useState<CurveChannel>("master");
  const [histMode, setHistMode] = useState<"luma" | "rgb">("luma");
  const [hist, setHist] = useState<HistogramData>(() => emptyHistogram());
  const dragIdx = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const curves = value.curves ?? DEFAULT_TONE_CURVES;
  const points = curves[channel];

  // Histogram of current image + adjustments (live)
  useEffect(() => {
    if (!imageSrc) {
      setHist(emptyHistogram());
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const img = await loadImage(imageSrc);
          if (cancelled) return;
          const maxSide = 320;
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          applyAdjustments(ctx, w, h, value);
          const data = ctx.getImageData(0, 0, w, h);
          if (!cancelled) {
            setHist(computeHistogram(data.data, w, h));
          }
        } catch {
          if (!cancelled) setHist(emptyHistogram());
        }
      })();
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imageSrc, value]);

  const setChannelPoints = useCallback(
    (nextPoints: CurvePoint[], commit = false) => {
      const nextCurves: ToneCurves = {
        ...cloneCurves(curves),
        [channel]: normalizeCurvePoints(nextPoints),
      };
      onChange({ ...value, curves: nextCurves });
      if (commit) setTimeout(onCommit, 0);
    },
    [channel, curves, onChange, onCommit, value]
  );

  const channelColor =
    CHANNELS.find((c) => c.id === channel)?.color ?? "#e4e4e7";

  function clientToSvg(e: ReactPointerEvent | PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    return { x, y };
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = clientToSvg(e);
    const hitR = 10;
    let found = -1;
    for (let i = 0; i < points.length; i++) {
      const s = toSvg(points[i]);
      if (Math.hypot(s.x - pt.x, s.y - pt.y) <= hitR) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      dragIdx.current = found;
      return;
    }
    // Add point
    const np = fromSvg(pt.x, pt.y);
    const next = normalizeCurvePoints([...points, np]);
    // Find index of nearest new point
    let idx = 0;
    let best = 1e9;
    for (let i = 0; i < next.length; i++) {
      const d = Math.abs(next[i].x - np.x);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    dragIdx.current = idx;
    setChannelPoints(next);
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (disabled || dragIdx.current === null) return;
    const idx = dragIdx.current;
    const pt = fromSvg(clientToSvg(e).x, clientToSvg(e).y);
    const next = points.map((p) => ({ ...p }));
    const isEnd = idx === 0 || idx === next.length - 1;
    if (isEnd) {
      next[idx] = { x: next[idx].x, y: pt.y };
    } else {
      const minX = next[idx - 1].x + 0.01;
      const maxX = next[idx + 1].x - 0.01;
      next[idx] = {
        x: Math.max(minX, Math.min(maxX, pt.x)),
        y: pt.y,
      };
    }
    setChannelPoints(next);
  }

  function onPointerUp() {
    if (dragIdx.current !== null) {
      dragIdx.current = null;
      onCommit();
    }
  }

  function onDoubleClick(e: ReactPointerEvent<SVGSVGElement>) {
    if (disabled) return;
    const pt = clientToSvg(e);
    const hitR = 10;
    for (let i = 1; i < points.length - 1; i++) {
      const s = toSvg(points[i]);
      if (Math.hypot(s.x - pt.x, s.y - pt.y) <= hitR) {
        const next = points.filter((_, j) => j !== i);
        setChannelPoints(next, true);
        return;
      }
    }
  }

  const pathD = useMemo(() => curvePath(points), [points]);

  return (
    <section className="space-y-3 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-chrome-400">
          Curves
        </h2>
        <button
          type="button"
          className="text-[11px] text-chrome-500 hover:text-accent"
          disabled={disabled || isIdentityCurve(points)}
          onClick={() =>
            setChannelPoints(
              [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              true
            )
          }
        >
          Reset channel
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {CHANNELS.map((c) => {
          const active = channel === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              className={
                active
                  ? "rounded-full bg-accent/20 px-2 py-0.5 text-[11px] text-accent ring-1 ring-accent/40"
                  : "rounded-full bg-chrome-800 px-2 py-0.5 text-[11px] text-chrome-300 ring-1 ring-chrome-700 hover:text-chrome-100"
              }
              onClick={() => setChannel(c.id)}
            >
              <span style={{ color: active ? undefined : c.color }}>{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] text-chrome-500">
        <span>Histogram</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={histMode === "luma" ? "text-accent" : "hover:text-chrome-300"}
            disabled={disabled}
            onClick={() => setHistMode("luma")}
          >
            Luma
          </button>
          <span className="text-chrome-700">/</span>
          <button
            type="button"
            className={histMode === "rgb" ? "text-accent" : "hover:text-chrome-300"}
            disabled={disabled}
            onClick={() => setHistMode("rgb")}
          >
            RGB
          </button>
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-md bg-chrome-850 ring-1 ring-white/5 ${
          disabled ? "opacity-40" : ""
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          role="img"
          aria-label="Tone curve editor"
        >
          {/* grid */}
          <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="#121214" />
          {[0.25, 0.5, 0.75].map((g) => (
            <g key={g}>
              <line
                x1={PAD + g * INNER}
                y1={PAD}
                x2={PAD + g * INNER}
                y2={PAD + INNER}
                stroke="#2a2a2e"
                strokeWidth={1}
              />
              <line
                x1={PAD}
                y1={PAD + g * INNER}
                x2={PAD + INNER}
                y2={PAD + g * INNER}
                stroke="#2a2a2e"
                strokeWidth={1}
              />
            </g>
          ))}
          {/* diagonal identity */}
          <line
            x1={PAD}
            y1={PAD + INNER}
            x2={PAD + INNER}
            y2={PAD}
            stroke="#3f3f46"
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          {histMode === "luma" ? (
            <path
              d={histPath(hist.luma, "luma")}
              fill="rgba(228,228,231,0.18)"
              stroke="none"
            />
          ) : (
            <>
              <path d={histPath(hist.r, "r")} fill="rgba(248,113,113,0.22)" stroke="none" />
              <path d={histPath(hist.g, "g")} fill="rgba(74,222,128,0.18)" stroke="none" />
              <path d={histPath(hist.b, "b")} fill="rgba(96,165,250,0.18)" stroke="none" />
            </>
          )}

          <path
            d={pathD}
            fill="none"
            stroke={channelColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => {
            const s = toSvg(p);
            return (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={4.5}
                fill="#18181b"
                stroke={channelColor}
                strokeWidth={2}
              />
            );
          })}
        </svg>
      </div>

      <p className="text-[10px] leading-relaxed text-chrome-600">
        Drag handles to reshape. Click empty area to add a point; double-click a
        mid point to remove. Live preview + undo on release.
      </p>

      <button
        type="button"
        className="btn w-full text-[11px]"
        disabled={disabled}
        onClick={() => {
          onChange({
            ...value,
            curves: {
              master: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              r: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              g: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
              b: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ],
            },
          });
          setTimeout(onCommit, 0);
        }}
      >
        Reset all curves
      </button>
    </section>
  );
}
