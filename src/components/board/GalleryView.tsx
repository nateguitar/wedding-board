"use client";

import type { BoardItem } from "@/lib/use-board-items";

const STATUS_STYLE: Record<string, string> = {
  shortlisted: "bg-accent text-white",
  maybe: "bg-accent-soft text-foreground",
  rejected: "bg-background text-muted line-through",
};

export default function GalleryView({
  items,
  loading,
  selectedShapeId,
  onSelect,
  onJump,
}: {
  items: BoardItem[];
  loading: boolean;
  selectedShapeId: string | null;
  onSelect: (shapeId: string) => void;
  onJump: (shapeId: string) => void;
}) {
  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
        Nothing matches this view yet. Upload an image or add a link to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((it) => {
        const selected = selectedShapeId === it.shapeId;
        return (
          <div
            key={it.shapeId}
            className={[
              "group relative flex flex-col overflow-hidden rounded-xl border bg-surface transition",
              selected ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-accent",
            ].join(" ")}
          >
            <button
              onClick={() => onSelect(it.shapeId)}
              className="block aspect-[4/3] w-full overflow-hidden bg-background"
            >
              {it.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumb} alt={it.title} className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-2xl text-muted">
                  {it.kind === "link" ? "🔗" : it.kind === "pdf" ? "📄" : "🖼"}
                </span>
              )}
            </button>

            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={it.title}>
                  {it.title}
                </p>
                {it.status && (
                  <span
                    className={[
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase",
                      STATUS_STYLE[it.status] ?? "bg-background text-muted",
                    ].join(" ")}
                  >
                    {it.status}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted">{it.subtitle}</p>
            </div>

            <button
              onClick={() => onJump(it.shapeId)}
              className="absolute right-2 top-2 rounded-md bg-surface/90 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 shadow transition group-hover:opacity-100"
              title="Find on canvas"
            >
              ⤢ Canvas
            </button>
          </div>
        );
      })}
    </div>
  );
}
