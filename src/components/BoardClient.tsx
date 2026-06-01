"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import Inspector from "@/components/Inspector";
import LeftSidebar, { type BoardView, type BrowseFilter } from "@/components/board/LeftSidebar";
import RightSidebar from "@/components/board/RightSidebar";
import GalleryView from "@/components/board/GalleryView";
import CompareView from "@/components/board/CompareView";
import SectionsPanel from "@/components/board/SectionsPanel";
import { useBoardItems } from "@/lib/use-board-items";
import type { CanvasApi, SaveStatus } from "@/components/Canvas";
import Lightbox from "@/components/Lightbox";
import type { Board, Profile } from "@/lib/types";

const Canvas = dynamic(() => import("@/components/Canvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-sm text-muted">
      Loading canvas…
    </div>
  ),
});

const noopApi: CanvasApi = {
  openUpload: () => {},
  addLink: async () => {},
  jumpTo: () => {},
  select: () => {},
  clearSelection: () => {},
  addSection: () => null,
  getSections: () => [],
  startCropRegion: () => false,
  goHome: () => {},
  saveHome: () => {},
  openPinTool: () => {},
};

export default function BoardClient({
  board,
  userId,
  members,
  initialSnapshot,
}: {
  board: Board;
  userId: string;
  members: Profile[];
  initialSnapshot: unknown | null;
}) {
  const [view, setView] = useState<BoardView>("canvas");
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const apiRef = useRef<CanvasApi>(noopApi);

  const { items, counts, loading } = useBoardItems(board.id);

  const userName = members.find((m) => m.id === userId)?.display_name || "You";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "image" || filter === "pdf" || filter === "link"
            ? it.kind === filter
            : it.status === filter;
      const matchesSearch =
        !q || it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [items, filter, search]);

  function handleView(v: BoardView) {
    setView(v);
  }

  function handleSearch(value: string) {
    setSearch(value);
    if (value.trim() && view === "canvas") setView("gallery");
  }

  function handleFilter(f: BrowseFilter) {
    setFilter(f);
    if (view === "canvas") setView("gallery");
  }

  function jumpTo(shapeId: string) {
    setView("canvas");
    apiRef.current.jumpTo(shapeId);
    setSelected(shapeId);
  }

  return (
    <div className="flex h-screen">
      <LeftSidebar
        view={view}
        onView={handleView}
        filter={filter}
        onFilter={handleFilter}
        counts={counts}
        onOpenTheme={() => window.dispatchEvent(new Event("wb:open-theme"))}
        onOpenPinTool={() => { setView("canvas"); setTimeout(() => apiRef.current.openPinTool(), 60); }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          boardId={board.id}
          title={board.title}
          saveStatus={saveStatus}
          members={members}
          userId={userId}
          search={search}
          onSearch={handleSearch}
          onUpload={() => apiRef.current.openUpload()}
          onAddLink={(url) => apiRef.current.addLink(url)}
        />

        <div className="relative flex-1 overflow-hidden">
          {/* Canvas stays mounted (keeps realtime + tldraw state); other views overlay it. */}
          <div
            className={
              view === "canvas" || view === "sections"
                ? "absolute inset-0"
                : "invisible absolute inset-0"
            }
          >
            <Canvas
              boardId={board.id}
              userId={userId}
              userName={userName}
              initialSnapshot={initialSnapshot}
              onSelectShape={setSelected}
              onSaveStatus={setSaveStatus}
              onReady={(api) => {
                apiRef.current = api;
              }}
              onUploaded={() => {}}
            />
          </div>

          {view === "sections" && (
            <SectionsPanel
              getSections={() => apiRef.current.getSections()}
              addSection={(name) => apiRef.current.addSection(name)}
              onJump={(id) => apiRef.current.jumpTo(id)}
              onClose={() => setView("canvas")}
            />
          )}

          {view === "gallery" && (
            <div className="absolute inset-0 overflow-y-auto bg-background">
              <GalleryView
                items={filtered}
                loading={loading}
                selectedShapeId={selected}
                onSelect={(id) => {
                  apiRef.current.select(id);
                  setSelected(id);
                }}
                onJump={jumpTo}
              />
            </div>
          )}

          {view === "compare" && (
            <div className="absolute inset-0 bg-background">
              <CompareView items={filtered} onJump={jumpTo} />
            </div>
          )}
        </div>
      </div>

      {/* Right zone: review inspector when something is selected, else the board panel. */}
      {selected ? (
        <Inspector
          boardId={board.id}
          userId={userId}
          members={members}
          shapeId={selected}
          onStartCrop={(id) => {
            setView("canvas");
            setTimeout(() => apiRef.current.startCropRegion(id), 60);
          }}
          onOpenLightbox={(src) => setLightboxSrc(src)}
          onClose={() => {
            apiRef.current.clearSelection();
            setSelected(null);
          }}
        />
      ) : (
        <RightSidebar
          boardId={board.id}
          userId={userId}
          userName={userName}
          members={members}
          items={items}
          onJump={jumpTo}
        />
      )}

      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc}
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </div>
  );
}
