"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  loadTheme,
  normalizeHex,
  PRESETS,
  saveTheme,
  TEST_PALETTE,
  THEME_TOKENS,
  type Theme,
  type ThemeKey,
} from "@/lib/theme";

// Floating control mounted app-wide. Owns the live theme, a small launcher
// button, and the editor panel. Changes apply instantly and persist to
// localStorage (per-browser).
export default function ThemeControls() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  // Mirror the hex text fields so users can type freely without fighting validation.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Adopt the stored theme on mount (the no-flash script already painted it).
  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    setDrafts(t);
    applyTheme(t);
  }, []);

  // Allow other parts of the app (e.g. the board sidebar) to open the editor.
  useEffect(() => {
    const open = () => setOpen(true);
    window.addEventListener("wb:open-theme", open);
    return () => window.removeEventListener("wb:open-theme", open);
  }, []);

  function update(key: ThemeKey, value: string) {
    const next = { ...theme, [key]: value };
    setTheme(next);
    setDrafts((d) => ({ ...d, [key]: value }));
    applyTheme({ [key]: value });
    saveTheme(next);
  }

  function applyPreset(next: Theme) {
    setTheme(next);
    setDrafts(next);
    applyTheme(next);
    saveTheme(next);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Edit theme"
        className="fixed bottom-4 left-4 z-[1000] grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-lg shadow-lg transition hover:scale-105"
        title="Theme"
      >
        🎨
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-[1000] flex max-h-[80vh] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Theme</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted transition hover:text-foreground"
              aria-label="Close theme editor"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* Presets */}
            <section className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Presets
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p.theme)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition hover:border-accent"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: p.theme.accent }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </section>

            {/* Reference palette swatches */}
            <section className="mb-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Test palette
              </h3>
              <div className="grid grid-cols-5 gap-1.5">
                {TEST_PALETTE.map((c) => (
                  <button
                    key={c.hex}
                    title={`${c.name} · ${c.hex} (click to copy)`}
                    onClick={() => navigator.clipboard?.writeText(c.hex)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className="h-7 w-full rounded-md border border-border"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="w-full truncate text-center text-[9px] leading-tight text-muted">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted">Click a swatch to copy its hex.</p>
            </section>

            {/* Per-token editors */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Colors
              </h3>
              <div className="space-y-2.5">
                {THEME_TOKENS.map((tok) => (
                  <div key={tok.key} className="flex items-center gap-2.5">
                    <input
                      type="color"
                      aria-label={tok.label}
                      value={theme[tok.key]}
                      onChange={(e) => update(tok.key, e.target.value)}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{tok.label}</p>
                      <p className="truncate text-[10px] text-muted">{tok.hint}</p>
                    </div>
                    <input
                      type="text"
                      value={drafts[tok.key] ?? theme[tok.key]}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [tok.key]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const hex = normalizeHex(e.target.value);
                        if (hex) update(tok.key, hex);
                        else setDrafts((d) => ({ ...d, [tok.key]: theme[tok.key] }));
                      }}
                      className="w-20 shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] uppercase outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <button
              onClick={() => applyPreset(DEFAULT_THEME)}
              className="text-xs text-muted transition hover:text-foreground"
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </>
  );
}
