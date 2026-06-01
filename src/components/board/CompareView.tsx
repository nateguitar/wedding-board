"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Rating, Reaction } from "@/lib/types";
import type { BoardItem } from "@/lib/use-board-items";

const MAX = 4;

export default function CompareView({
  items,
  onJump,
}: {
  items: BoardItem[];
  onJump: (shapeId: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [picked, setPicked] = useState<string[]>(() => items.slice(0, 2).map((i) => i.shapeId));
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);

  // Pull rating/reaction data for the whole board once (board is small).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = items.map((i) => i.shapeId);
      if (ids.length === 0) return;
      const [r, rx] = await Promise.all([
        supabase.from("ratings").select("*").in("shape_id", ids),
        supabase.from("reactions").select("*").in("shape_id", ids),
      ]);
      if (!cancelled) {
        setRatings((r.data as Rating[]) ?? []);
        setReactions((rx.data as Reaction[]) ?? []);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [items, supabase]);

  function togglePick(shapeId: string) {
    setPicked((prev) => {
      if (prev.includes(shapeId)) return prev.filter((x) => x !== shapeId);
      if (prev.length >= MAX) return prev;
      return [...prev, shapeId];
    });
  }

  const byId = useMemo(() => new Map(items.map((i) => [i.shapeId, i])), [items]);

  function ratingFor(shapeId: string) {
    const rs = ratings.filter((r) => r.shape_id === shapeId);
    if (rs.length === 0) return { avg: "—", count: 0 };
    return { avg: (rs.reduce((s, r) => s + r.rating, 0) / rs.length).toFixed(1), count: rs.length };
  }
  function reactionsFor(shapeId: string) {
    const map = new Map<string, number>();
    for (const rx of reactions.filter((r) => r.shape_id === shapeId)) {
      map.set(rx.emoji, (map.get(rx.emoji) ?? 0) + 1);
    }
    return [...map.entries()];
  }

  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
        Nothing to compare yet. Add some images or links first.
      </div>
    );
  }

  const columns = picked.map((id) => byId.get(id)).filter(Boolean) as BoardItem[];

  return (
    <div className="flex h-full flex-col">
      {/* Picker strip */}
      <div className="border-b border-border px-4 py-3">
        <p className="mb-2 text-xs text-muted">
          Pick up to {MAX} items to compare side by side ({picked.length}/{MAX}).
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((it) => {
            const on = picked.includes(it.shapeId);
            const full = !on && picked.length >= MAX;
            return (
              <button
                key={it.shapeId}
                onClick={() => togglePick(it.shapeId)}
                disabled={full}
                title={it.title}
                className={[
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition",
                  on ? "border-accent" : full ? "border-border opacity-40" : "border-border hover:border-accent",
                ].join(" ")}
              >
                {it.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-lg">
                    {it.kind === "link" ? "🔗" : it.kind === "pdf" ? "📄" : "🖼"}
                  </span>
                )}
                {on && (
                  <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-auto p-4">
        {columns.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted">
            Select items above to compare them.
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((it) => {
              const r = ratingFor(it.shapeId);
              const rx = reactionsFor(it.shapeId);
              return (
                <div key={it.shapeId} className="flex flex-col rounded-xl border border-border bg-surface">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-background">
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb} alt={it.title} className="h-full w-full object-contain" />
                    ) : (
                      <span className="grid h-full place-items-center text-3xl text-muted">
                        {it.kind === "link" ? "🔗" : it.kind === "pdf" ? "📄" : "🖼"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <p className="truncate text-sm font-medium" title={it.title}>
                      {it.title}
                    </p>
                    <p className="truncate text-[11px] text-muted">{it.subtitle}</p>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-semibold">{r.avg}</span>
                      <span className="text-[11px] text-muted">avg · {r.count} rating{r.count === 1 ? "" : "s"}</span>
                    </div>

                    {rx.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rx.map(([emoji, n]) => (
                          <span key={emoji} className="rounded-full border border-border bg-background px-1.5 py-0.5 text-xs">
                            {emoji} {n}
                          </span>
                        ))}
                      </div>
                    )}

                    {it.status && (
                      <span className="w-fit rounded-full bg-accent-soft px-2 py-0.5 text-[10px] uppercase">
                        {it.status}
                      </span>
                    )}

                    <button
                      onClick={() => onJump(it.shapeId)}
                      className="mt-auto rounded-lg border border-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
                    >
                      ⤢ View on canvas
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
