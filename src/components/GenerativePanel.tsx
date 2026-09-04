"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  disabled?: boolean;
  hasMask: boolean;
  onGenerate: (prompt: string, useMask: boolean) => Promise<void>;
}

export function GenerativePanel({ disabled, hasMask, onGenerate }: Props) {
  const [prompt, setPrompt] = useState("");
  const [useMask, setUseMask] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeHint, setModeHint] = useState<string | null>(null);
  const [apiMode, setApiMode] = useState<"mock" | "live" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/edit");
        if (!res.ok) return;
        const json = (await res.json()) as { mode?: string };
        if (!cancelled && (json.mode === "mock" || json.mode === "live")) {
          setApiMode(json.mode);
        }
      } catch {
        /* badge stays hidden if probe fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy || disabled) return;
    setBusy(true);
    setError(null);
    setModeHint(null);
    try {
      await onGenerate(prompt.trim(), useMask && hasMask);
      setModeHint("Edit applied — check canvas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-chrome-400">
          Generative edit
        </h2>
        {apiMode && (
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              apiMode === "mock"
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
            }`}
            title={
              apiMode === "mock"
                ? "MOCK_IMAGE_API or missing IMAGE_API_BASE_URL"
                : "Forwarding to IMAGE_API_BASE_URL"
            }
          >
            {apiMode === "mock" ? "Mock API" : "Live API"}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-chrome-500">
        Prompt-based inpaint / edit via <code className="text-chrome-400">/api/edit</code>.
        Default is mock mode (DEMO watermark). Point{" "}
        <code className="text-chrome-400">IMAGE_API_BASE_URL</code> at your self-hosted
        backend for live uncensored models.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled || busy}
          rows={4}
          placeholder="Describe the edit… e.g. soften skin, change background to misty forest"
          className="w-full resize-none rounded-md border border-white/10 bg-chrome-850 px-2.5 py-2 text-sm text-chrome-100 placeholder:text-chrome-600 focus:border-accent/40 focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-chrome-400">
          <input
            type="checkbox"
            checked={useMask && hasMask}
            disabled={!hasMask || disabled || busy}
            onChange={(e) => setUseMask(e.target.checked)}
            className="accent-accent"
          />
          Use brush mask for inpaint
          {!hasMask && (
            <span className="text-chrome-600">(paint a mask first)</span>
          )}
        </label>
        <button
          type="submit"
          disabled={disabled || busy || !prompt.trim()}
          className="btn btn-accent w-full py-2"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Run edit
            </>
          )}
        </button>
      </form>
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
      {modeHint && !error && (
        <p className="text-[11px] text-accent-glow">{modeHint}</p>
      )}
    </section>
  );
}
