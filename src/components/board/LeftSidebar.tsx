"use client";

import Link from "next/link";
import type { BoardCounts } from "@/lib/use-board-items";

export type BoardView = "canvas" | "gallery" | "compare" | "sections";
export type BrowseFilter =
  | "all"
  | "image"
  | "pdf"
  | "link"
  | "shortlisted"
  | "maybe"
  | "rejected";

const VIEWS: { id: BoardView; label: string; icon: string; soon?: boolean }[] = [
  { id: "canvas", label: "Canvas", icon: "▦" },
  { id: "gallery", label: "Gallery", icon: "▤" },
  { id: "compare", label: "Compare", icon: "⇆" },
  { id: "sections", label: "Sections", icon: "❏" },
];

const FILES: { id: BrowseFilter; label: string; icon: string; countKey: keyof BoardCounts }[] = [
  { id: "all", label: "All items", icon: "🗂", countKey: "all" },
  { id: "image", label: "Images", icon: "🖼", countKey: "image" },
  { id: "pdf", label: "PDFs", icon: "📄", countKey: "pdf" },
  { id: "link", label: "Links", icon: "🔗", countKey: "link" },
];

const STATUSES: { id: BrowseFilter; label: string; icon: string; countKey: keyof BoardCounts }[] = [
  { id: "shortlisted", label: "Shortlisted", icon: "★", countKey: "shortlisted" },
  { id: "maybe", label: "Maybe", icon: "◐", countKey: "maybe" },
  { id: "rejected", label: "Rejected", icon: "✕", countKey: "rejected" },
];

export default function LeftSidebar({
  view,
  onView,
  filter,
  onFilter,
  counts,
  onOpenTheme,
  onOpenPinTool,
}: {
  view: BoardView;
  onView: (v: BoardView) => void;
  filter: BrowseFilter;
  onFilter: (f: BrowseFilter) => void;
  counts: BoardCounts;
  onOpenTheme: () => void;
  onOpenPinTool: () => void;
}) {
  return (
    <nav className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
      <div className="px-4 py-3">
        <Link href="/" className="text-xs text-muted transition hover:text-foreground">
          ← All boards
        </Link>
      </div>

      {/* VIEWS */}
      <SectionHeader>Views</SectionHeader>
      <ul className="px-2 pb-2">
        {VIEWS.map((v) => {
          const active = view === v.id;
          return (
            <li key={v.id}>
              <button
                disabled={v.soon}
                onClick={() => onView(v.id)}
                className={[
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                  active
                    ? "bg-accent text-white"
                    : v.soon
                      ? "cursor-default text-muted/60"
                      : "text-foreground hover:bg-accent-soft",
                ].join(" ")}
              >
                <span className="w-4 text-center">{v.icon}</span>
                <span className="flex-1 text-left">{v.label}</span>
                {v.soon && (
                  <span className="rounded-full bg-background px-1.5 py-0.5 text-[9px] uppercase text-muted">
                    soon
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li>
          <button
            onClick={() => { onView("canvas"); onOpenPinTool(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition hover:bg-accent-soft"
          >
            <span className="w-4 text-center">📍</span>
            <span className="flex-1 text-left">Add pin</span>
          </button>
        </li>
        <li>
          <button
            onClick={onOpenTheme}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition hover:bg-accent-soft"
          >
            <span className="w-4 text-center">🎨</span>
            <span className="flex-1 text-left">Theme</span>
          </button>
        </li>
      </ul>

      {/* BROWSE */}
      <SectionHeader>Browse</SectionHeader>
      <ul className="px-2 pb-1">
        {FILES.map((f) => (
          <BrowseRow
            key={f.id}
            label={f.label}
            icon={f.icon}
            count={counts[f.countKey]}
            active={filter === f.id}
            onClick={() => onFilter(f.id)}
          />
        ))}
      </ul>
      <div className="mx-4 my-1 border-t border-border" />
      <ul className="px-2 pb-3">
        {STATUSES.map((s) => (
          <BrowseRow
            key={s.id}
            label={s.label}
            icon={s.icon}
            count={counts[s.countKey]}
            active={filter === s.id}
            onClick={() => onFilter(s.id)}
          />
        ))}
      </ul>
    </nav>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {children}
    </div>
  );
}

function BrowseRow({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={[
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition",
          active ? "bg-accent-soft font-medium" : "text-foreground hover:bg-accent-soft/60",
        ].join(" ")}
      >
        <span className="w-4 text-center text-xs">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span
          className={[
            "rounded-full px-1.5 py-0.5 text-[10px]",
            active ? "bg-accent text-white" : "bg-background text-muted",
          ].join(" ")}
        >
          {count}
        </span>
      </button>
    </li>
  );
}
