"use client";

import { useCallbackRef } from "@/lib/use-callback-ref";
import {
  Tldraw,
  type Editor,
  type TLRecord,
  type TLShapeId,
  type RecordsDiff,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  useEditor,
  useValue,
} from "tldraw";
import "tldraw/tldraw.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createAssetStore, isSupabaseSrc, pathFromSrc } from "@/lib/board-assets";
import { placeFileOnCanvas, isAccepted } from "@/lib/upload";
import { placeLinkOnCanvas } from "@/lib/link";
import { cropRegionToBlob } from "@/lib/crop";
import { PinShapeUtil, PinTool } from "@/lib/pin-shape";
import PinToolbar from "@/components/board/PinToolbar";

export type SaveStatus = "idle" | "saving" | "saved";

// Handle the canvas hands back to its parent so the TopBar / sidebar can drive it.
export type CanvasSection = { id: string; name: string };

export type CanvasApi = {
  openUpload: () => void;
  addLink: (url: string) => Promise<void>;
  jumpTo: (shapeId: string) => void;
  select: (shapeId: string) => void;
  clearSelection: () => void;
  addSection: (name: string) => string | null;
  getSections: () => CanvasSection[];
  startCropRegion: (imageShapeId: string) => boolean;
  goHome: () => void;
  saveHome: () => void;
  openPinTool: () => void;
};

type Props = {
  boardId: string;
  userId: string;
  userName: string;
  initialSnapshot: unknown | null;
  onSelectShape: (shapeId: string | null) => void;
  onSaveStatus: (status: SaveStatus) => void;
  onReady: (api: CanvasApi) => void;
  onUploaded: (shapeId: string) => void;
};

type RemoteCursor = { userId: string; name: string; color: string; x: number; y: number; ts: number };

// Stable, friendly color per user id.
const CURSOR_COLORS = ["#c0705f", "#5f8fc0", "#6fae6f", "#b07fc0", "#d09a3c", "#3fae9f"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

// Renders other people's cursors as a DOM overlay, converting their page
// coordinates to screen space (re-runs on pan/zoom via the reactive camera).
function Cursors({
  cursors,
  onSend,
}: {
  cursors: RemoteCursor[];
  onSend: (x: number, y: number) => void;
}) {
  const editor = useEditor();

  const positioned = useValue(
    "cursor-screen",
    () => cursors.map((c) => ({ ...c, s: editor.pageToScreen({ x: c.x, y: c.y }) })),
    [editor, cursors]
  );

  useEffect(() => {
    const el = editor.getContainer();
    let last = 0;
    const onMove = () => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const { x, y } = editor.inputs.currentPagePoint;
      onSend(x, y);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [editor, onSend]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[300] overflow-hidden">
      {positioned.map((c) => (
        <div
          key={c.userId}
          className="absolute -translate-x-0.5 -translate-y-0.5 transition-transform duration-75"
          style={{ transform: `translate(${c.s.x}px, ${c.s.y}px)` }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path
              d="M1 1l5.5 13 2-5.5L14 6 1 1z"
              fill={c.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          <span
            className="ml-3 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// Reports the single selected image shape (if any) up to the inspector.
function SelectionReporter({
  onSelectShape,
}: {
  onSelectShape: (id: string | null) => void;
}) {
  const editor = useEditor();
  const selectedId = useValue(
    "selected-image",
    () => {
      const shape = editor.getOnlySelectedShape();
      if (shape && (shape.type === "image" || shape.type === "note")) return shape.id;
      return null;
    },
    [editor]
  );
  useEffect(() => {
    onSelectShape(selectedId);
  }, [selectedId, onSelectShape]);
  return null;
}

export default function Canvas(props: Props) {
  const {
    boardId,
    userId,
    userName,
    initialSnapshot,
    onSaveStatus,
    onReady,
    onUploaded,
  } = props;

  const supabase = useMemo(() => createClient(), []);
  const assetStore = useMemo(() => createAssetStore(supabase), [supabase]);
  const editorRef = useRef<Editor | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRemote = useRef(false);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [cropSession, setCropSession] = useState<{ imageId: string; rectId: string } | null>(null);
  const [homeSaved, setHomeSaved] = useState(false);
  const [pinToolOpen, setPinToolOpen] = useState(false);
  const myColor = useMemo(() => colorFor(userId), [userId]);
  const homeKey = `katari-home-${boardId}`;

  const sendCursor = useCallbackRef((x: number, y: number) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "cursor",
      payload: { userId, name: userName, color: myColor, x, y },
    });
  });

  const onSelectShape = useCallbackRef(props.onSelectShape);

  // Persist the canvas snapshot (debounced) — geometry's single source of truth.
  const scheduleSave = useCallbackRef(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    onSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const editor = editorRef.current;
      if (!editor) return;
      const snapshot = getSnapshot(editor.store);
      const { error } = await supabase
        .from("board_snapshots")
        .upsert(
          { board_id: boardId, snapshot_json: snapshot, updated_at: new Date().toISOString() },
          { onConflict: "board_id" }
        );
      onSaveStatus(error ? "idle" : "saved");
    }, 1200);
  });

  const handleFiles = useCallbackRef(async (files: File[], point: { x: number; y: number }) => {
    const editor = editorRef.current;
    if (!editor) return;
    let offset = 0;
    for (const file of files) {
      if (!isAccepted(file)) continue;
      try {
        const res = await placeFileOnCanvas({
          editor,
          supabase,
          boardId,
          userId,
          file,
          point: { x: point.x + offset, y: point.y + offset },
        });
        offset += 28;
        editor.select(res.shapeId as TLShapeId);
        onUploaded(res.shapeId);
      } catch (err) {
        console.error("Upload failed", err);
      }
    }
  });

  function openFileDialog() {
    fileInputRef.current?.click();
  }

  const addLink = useCallbackRef(async (url: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const res = await placeLinkOnCanvas({
        editor,
        supabase,
        boardId,
        userId,
        url,
        point: editor.getViewportPageBounds().center,
      });
      editor.select(res.shapeId as TLShapeId);
      onUploaded(res.shapeId);
    } catch (err) {
      console.error("Add link failed", err);
    }
  });

  const jumpTo = useCallbackRef((shapeId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = shapeId as TLShapeId;
    if (!editor.getShape(id)) return;
    editor.select(id);
    editor.zoomToSelection({ animation: { duration: 300 } });
  });

  const selectShape = useCallbackRef((shapeId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = shapeId as TLShapeId;
    if (editor.getShape(id)) editor.select(id);
  });

  const clearSelection = useCallbackRef(() => {
    editorRef.current?.selectNone();
  });

  const addSection = useCallbackRef((name: string): string | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const center = editor.getViewportPageBounds().center;
    const w = 900;
    const h = 600;
    const id = createShapeId();
    editor.createShape({
      id,
      type: "frame",
      x: center.x - w / 2,
      y: center.y - h / 2,
      props: { name: name.trim() || "Section", w, h },
    });
    editor.select(id);
    editor.zoomToSelection({ animation: { duration: 300 } });
    return id;
  });

  // Drop a red marquee over an image; the user positions it, then "Crop to new
  // image" bakes that region into a fresh upload.
  const startCropRegion = useCallbackRef((imageShapeId: string): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const id = imageShapeId as TLShapeId;
    const shape = editor.getShape(id);
    const b = editor.getShapePageBounds(id);
    if (!shape || shape.type !== "image" || !b) return false;
    // Remove any stale marquee first.
    if (cropSession) editor.deleteShape(cropSession.rectId as TLShapeId);
    const rectId = createShapeId();
    editor.createShape({
      id: rectId,
      type: "geo",
      x: b.x + b.w * 0.2,
      y: b.y + b.h * 0.2,
      props: { geo: "rectangle", w: b.w * 0.6, h: b.h * 0.6, color: "red", fill: "none", dash: "solid" },
    });
    editor.setSelectedShapes([rectId]);
    setCropSession({ imageId: imageShapeId, rectId });
    return true;
  });

  const applyCrop = useCallbackRef(async () => {
    const editor = editorRef.current;
    const session = cropSession;
    if (!editor || !session) return;
    try {
      const res = await cropRegionToBlob({
        editor,
        imageId: session.imageId,
        rectId: session.rectId,
        resolveSrc: async (assetId) => {
          const asset = editor.getAsset(assetId);
          const src = (asset?.props as { src?: string } | undefined)?.src;
          if (!src) return null;
          if (isSupabaseSrc(src)) {
            const { data } = await supabase.storage
              .from("uploads")
              .createSignedUrl(pathFromSrc(src), 3600);
            return data?.signedUrl ?? null;
          }
          return src; // external URL (e.g. a link-card image)
        },
      });
      editor.deleteShape(session.rectId as TLShapeId);
      setCropSession(null);
      if (!res) {
        console.warn("Crop region had no overlap with the image");
        return;
      }
      const file = new File([res.blob], "crop.png", { type: "image/png" });
      const placed = await placeFileOnCanvas({ editor, supabase, boardId, userId, file, point: res.point });
      editor.select(placed.shapeId as TLShapeId);
      onUploaded(placed.shapeId);
    } catch (err) {
      console.error("Crop failed", err);
      editor.deleteShape(session.rectId as TLShapeId);
      setCropSession(null);
    }
  });

  const goHome = useCallbackRef(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const saved = localStorage.getItem(homeKey);
      if (saved) {
        const cam = JSON.parse(saved) as { x: number; y: number; z: number };
        editor.setCamera({ x: cam.x, y: cam.y, z: cam.z }, { animation: { duration: 400 } });
        return;
      }
    } catch { /* fall through to zoomToFit */ }
    editor.zoomToFit({ animation: { duration: 400 } });
  });

  const saveHome = useCallbackRef(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const cam = editor.getCamera();
    localStorage.setItem(homeKey, JSON.stringify({ x: cam.x, y: cam.y, z: cam.z }));
    setHomeSaved(true);
    setTimeout(() => setHomeSaved(false), 2000);
  });

  const cancelCrop = useCallbackRef(() => {
    const editor = editorRef.current;
    if (editor && cropSession) editor.deleteShape(cropSession.rectId as TLShapeId);
    setCropSession(null);
  });

  const getSections = useCallbackRef((): CanvasSection[] => {
    const editor = editorRef.current;
    if (!editor) return [];
    return editor
      .getCurrentPageShapes()
      .filter((s) => s.type === "frame")
      .map((s) => ({
        id: s.id,
        name: (s.props as { name?: string }).name || "Untitled section",
      }));
  });

  const handleMount = (editor: Editor) => {
    editorRef.current = editor;
    onReady({
      openUpload: openFileDialog,
      addLink,
      jumpTo,
      select: selectShape,
      clearSelection,
      addSection,
      getSections,
      startCropRegion,
      goHome,
      saveHome,
      openPinTool: () => setPinToolOpen(true),
    });

    // Restore saved canvas, if any.
    if (initialSnapshot) {
      try {
        loadSnapshot(editor.store, initialSnapshot as Parameters<typeof loadSnapshot>[1]);
      } catch (err) {
        console.error("Failed to load snapshot", err);
      }
    }

    // Route dropped/pasted files through our Supabase-backed pipeline.
    editor.registerExternalContentHandler("files", async (content) => {
      await handleFiles(content.files, content.point ?? editor.getViewportPageBounds().center);
    });

    // Pasted/dropped URLs become unfurled link cards instead of bookmarks.
    editor.registerExternalContentHandler("url", async (content) => {
      try {
        const res = await placeLinkOnCanvas({
          editor,
          supabase,
          boardId,
          userId,
          url: content.url,
          point: content.point ?? editor.getViewportPageBounds().center,
        });
        editor.select(res.shapeId as TLShapeId);
        onUploaded(res.shapeId);
      } catch (err) {
        console.error("Link drop failed", err);
      }
    });

    // Broadcast local edits + schedule a save on every document change.
    editor.store.listen(
      (entry) => {
        scheduleSave();
        if (applyingRemote.current) return;
        if (entry.source !== "user") return;
        channelRef.current?.send({
          type: "broadcast",
          event: "diff",
          payload: entry.changes,
        });
      },
      { scope: "document" }
    );
  };

  // Own the canvas-sync channel: register the remote-diff handler BEFORE
  // subscribing (Supabase requires this ordering), then keep it for sending.
  useEffect(() => {
    const applyRemote = (diff: RecordsDiff<TLRecord>) => {
      const editor = editorRef.current;
      if (!editor) return;
      applyingRemote.current = true;
      editor.store.mergeRemoteChanges(() => {
        editor.store.put(Object.values(diff.added));
        editor.store.put(Object.values(diff.updated).map(([, to]) => to));
        editor.store.remove(Object.keys(diff.removed) as TLRecord["id"][]);
      });
      applyingRemote.current = false;
    };

    const channel = supabase
      .channel(`board-${boardId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "diff" }, ({ payload }) =>
        applyRemote(payload as RecordsDiff<TLRecord>)
      )
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const c = payload as Omit<RemoteCursor, "ts">;
        setCursors((prev) => [
          ...prev.filter((p) => p.userId !== c.userId),
          { ...c, ts: Date.now() },
        ]);
      })
      .subscribe();
    channelRef.current = channel;

    // Drop cursors that have gone quiet (tab closed / idle).
    const prune = setInterval(() => {
      setCursors((prev) => prev.filter((c) => Date.now() - c.ts < 8000));
    }, 3000);

    return () => {
      clearInterval(prune);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, boardId]);

  return (
    <div className="absolute inset-0">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          const editor = editorRef.current;
          const files = Array.from(e.target.files ?? []);
          if (editor && files.length) {
            handleFiles(files, editor.getViewportPageBounds().center);
          }
          e.target.value = "";
        }}
      />
      <Tldraw
        onMount={handleMount}
        assets={assetStore}
        shapeUtils={[PinShapeUtil]}
        tools={[PinTool]}
      >
        <SelectionReporter onSelectShape={onSelectShape} />
        <Cursors cursors={cursors} onSend={sendCursor} />
        {pinToolOpen && <PinToolbar onClose={() => setPinToolOpen(false)} />}
      </Tldraw>

      {/* Home button — bottom-left of canvas */}
      <div className="absolute bottom-4 left-4 z-[200] flex items-center gap-1.5">
        <button
          onClick={goHome}
          title="Go home (zoom to fit all content)"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5 text-sm shadow backdrop-blur transition hover:border-accent hover:text-accent"
        >
          ⌂ Home
        </button>
        <button
          onClick={saveHome}
          title="Save current view as home position"
          className={[
            "rounded-lg border px-2.5 py-1.5 text-xs shadow backdrop-blur transition",
            homeSaved
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface/90 text-muted hover:border-accent hover:text-accent",
          ].join(" ")}
        >
          {homeSaved ? "✓ Saved!" : "Save view"}
        </button>
      </div>

      {cropSession && (
        <div className="absolute left-1/2 top-3 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
          <span className="text-xs text-muted">
            Position the red box over the area to extract…
          </span>
          <button
            onClick={applyCrop}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white transition hover:opacity-90"
          >
            Crop to new image
          </button>
          <button
            onClick={cancelCrop}
            className="rounded-lg border border-border px-3 py-1 text-sm text-muted transition hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
