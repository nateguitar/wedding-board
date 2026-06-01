"use client";

import { useEffect, useState } from "react";
import type { CanvasSection } from "@/components/Canvas";

// Floating navigator for canvas "sections" (tldraw frames). Lets you create
// labeled zones and jump between them while the canvas stays in view.
export default function SectionsPanel({
  getSections,
  addSection,
  onJump,
  onClose,
}: {
  getSections: () => CanvasSection[];
  addSection: (name: string) => string | null;
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [name, setName] = useState("");

  const refresh = () => setSections(getSections());

  useEffect(() => {
    refresh();
    // Frames can change from remote edits; cheap periodic refresh keeps the list live.
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = addSection(name);
    setName("");
    if (id) setTimeout(refresh, 50);
  }

  return (
    <div className="absolute left-3 top-3 z-[200] flex max-h-[70%] w-60 flex-col overflow-hidden rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Sections
        </span>
        <button
          onClick={onClose}
          className="text-muted transition hover:text-foreground"
          aria-label="Close sections"
        >
          ✕
        </button>
      </div>

      <form onSubmit={submit} className="flex gap-1.5 border-b border-border px-3 py-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New section…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-accent px-2.5 text-sm font-medium text-white">
          +
        </button>
      </form>

      <div className="flex-1 overflow-y-auto p-1.5">
        {sections.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted">
            No sections yet. Add one to group items into zones (Invitations, Flowers, Venue…).
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onJump(s.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-accent-soft"
                >
                  <span className="text-xs">❏</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
