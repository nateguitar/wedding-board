"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/upload";
import type { Comment, Link, Profile, Rating, Reaction, Upload } from "@/lib/types";

const STATUS_OPTIONS = ["", "shortlisted", "maybe", "rejected"] as const;
const EMOJIS = ["😍", "👍", "🤔", "👎", "💸", "🎉"] as const;

export default function Inspector({
  boardId,
  userId,
  members,
  shapeId,
  onStartCrop,
  onOpenLightbox,
  onClose,
}: {
  boardId: string;
  userId: string;
  members: Profile[];
  shapeId: string;
  onStartCrop: (shapeId: string) => void;
  onOpenLightbox: (src: string) => void;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name || "Someone";

  // Load all review data for this shape.
  const reload = useRef<() => void>(() => {});
  reload.current = async () => {
    const [u, l, r, c, rx] = await Promise.all([
      supabase.from("uploads").select("*").eq("board_id", boardId).eq("shape_id", shapeId).maybeSingle(),
      supabase.from("links").select("*").eq("board_id", boardId).eq("shape_id", shapeId).maybeSingle(),
      supabase.from("ratings").select("*").eq("board_id", boardId).eq("shape_id", shapeId),
      supabase.from("comments").select("*").eq("board_id", boardId).eq("shape_id", shapeId).order("created_at"),
      supabase.from("reactions").select("*").eq("board_id", boardId).eq("shape_id", shapeId),
    ]);
    const up = (u.data as Upload) ?? null;
    setUpload(up);
    setLink((l.data as Link) ?? null);
    setRatings((r.data as Rating[]) ?? []);
    setComments((c.data as Comment[]) ?? []);
    setReactions((rx.data as Reaction[]) ?? []);
    setLoading(false);

    if (up && ACCEPTED_IMAGE_TYPES.includes(up.file_type)) {
      const { data } = await supabase.storage
        .from("uploads")
        .createSignedUrl(up.storage_path, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    } else {
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    setPreviewUrl(null);
    reload.current();
  }, [shapeId]);

  // Realtime: refetch when any review data for THIS shape changes.
  useEffect(() => {
    const tables = ["ratings", "comments", "uploads", "links", "reactions"];
    const channel = supabase.channel(`board-db-${boardId}-${shapeId}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `shape_id=eq.${shapeId}` },
        () => reload.current()
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, shapeId, supabase]);

  const myRating = ratings.find((r) => r.user_id === userId)?.rating ?? null;
  const average =
    ratings.length > 0
      ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
      : "—";

  // The item carries a status either on its upload row or its link row.
  const status = upload?.status ?? link?.status ?? "";
  const itemTitle = upload?.original_filename ?? link?.title ?? "Untitled item";

  async function setRating(value: number) {
    setRatings((prev) => {
      const others = prev.filter((r) => r.user_id !== userId);
      return [
        ...others,
        { id: "tmp", board_id: boardId, shape_id: shapeId, user_id: userId, rating: value, created_at: "", updated_at: "" },
      ];
    });
    await supabase.from("ratings").upsert(
      { board_id: boardId, shape_id: shapeId, user_id: userId, rating: value, updated_at: new Date().toISOString() },
      { onConflict: "shape_id,user_id" }
    );
  }

  async function setStatus(next: string) {
    if (upload) {
      setUpload({ ...upload, status: next });
      await supabase.from("uploads").update({ status: next }).eq("id", upload.id);
    } else if (link) {
      setLink({ ...link, status: next });
      await supabase.from("links").update({ status: next }).eq("id", link.id);
    }
  }

  async function toggleReaction(emoji: string) {
    const mine = reactions.find((r) => r.user_id === userId && r.emoji === emoji);
    if (mine) {
      setReactions((prev) => prev.filter((r) => r !== mine));
      await supabase
        .from("reactions")
        .delete()
        .eq("board_id", boardId)
        .eq("shape_id", shapeId)
        .eq("user_id", userId)
        .eq("emoji", emoji);
    } else {
      setReactions((prev) => [
        ...prev,
        { id: "tmp", board_id: boardId, shape_id: shapeId, user_id: userId, emoji, created_at: "" },
      ]);
      await supabase
        .from("reactions")
        .upsert(
          { board_id: boardId, shape_id: shapeId, user_id: userId, emoji },
          { onConflict: "shape_id,user_id,emoji" }
        );
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await supabase
      .from("comments")
      .insert({ board_id: boardId, shape_id: shapeId, user_id: userId, body });
    reload.current();
  }

  const orderedMembers = [...members].sort((a) => (a.id === userId ? -1 : 1));

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Review</span>
        <button
          onClick={onClose}
          className="text-muted transition hover:text-foreground"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Preview + title */}
        <div className="mb-4">
          {link ? (
            <a href={link.url} target="_blank" rel="noreferrer" className="group block">
              {link.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.image_url}
                  alt={link.title}
                  className="mb-2 max-h-44 w-full rounded-lg border border-border object-contain"
                />
              ) : (
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
                  🔗 link
                </div>
              )}
              <p className="truncate text-sm font-medium group-hover:text-accent" title={link.title}>
                {loading ? "Loading…" : link.title || link.url}
              </p>
              <p className="truncate text-[11px] text-muted">
                {link.site_name || new URL(link.url).hostname.replace(/^www\./, "")} · open ↗
              </p>
            </a>
          ) : (
            <>
              {previewUrl ? (
                <div className="group relative mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={upload?.original_filename ?? "preview"}
                    className="max-h-44 w-full rounded-lg border border-border object-contain"
                  />
                  <button
                    onClick={() => onOpenLightbox(previewUrl)}
                    title="View fullscreen"
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-surface/90 text-xs opacity-0 shadow transition group-hover:opacity-100 hover:bg-accent hover:text-white"
                  >
                    ↗
                  </button>
                </div>
              ) : (
                <div className="mb-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
                  {upload?.file_type === "application/pdf" ? "PDF" : "No preview"}
                </div>
              )}
              <p className="truncate text-sm font-medium" title={upload?.original_filename}>
                {loading ? "Loading…" : itemTitle}
              </p>
              {upload && (
                <button
                  onClick={() => onStartCrop(shapeId)}
                  className="mt-2 w-full rounded-lg border border-border px-2 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
                >
                  ✂️ Crop a region → new image
                </button>
              )}
            </>
          )}
        </div>

        {/* Reactions */}
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Reactions
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((emoji) => {
              const who = reactions.filter((r) => r.emoji === emoji);
              const mine = who.some((r) => r.user_id === userId);
              return (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  title={who.map((r) => nameOf(r.user_id)).join(", ")}
                  className={[
                    "flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition",
                    mine
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-background hover:border-accent",
                  ].join(" ")}
                >
                  <span>{emoji}</span>
                  {who.length > 0 && (
                    <span className="text-xs text-muted">{who.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Ratings */}
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Ratings
            </h3>
            <span className="text-sm">
              avg <span className="font-semibold">{average}</span>
            </span>
          </div>

          {orderedMembers.map((m) => {
            const r = ratings.find((x) => x.user_id === m.id)?.rating ?? null;
            const editable = m.id === userId;
            return (
              <div key={m.id} className="mb-3">
                <p className="mb-1 text-sm">
                  {m.display_name}
                  {editable && <span className="text-muted"> (you)</span>}
                  {r != null && <span className="float-right font-medium">{r}/10</span>}
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      disabled={!editable}
                      onClick={() => editable && setRating(n)}
                      className={[
                        "h-6 flex-1 rounded text-xs transition",
                        (editable ? myRating : r) != null && n <= (editable ? myRating! : r!)
                          ? "bg-accent text-white"
                          : "bg-accent-soft text-foreground/60",
                        editable ? "hover:opacity-90" : "cursor-default opacity-70",
                      ].join(" ")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Status */}
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Status
          </h3>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s || "none"}
                disabled={!upload && !link}
                onClick={() => setStatus(s)}
                className={[
                  "rounded-full border px-3 py-1 text-xs capitalize transition",
                  status === s
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-background text-muted hover:text-foreground",
                ].join(" ")}
              >
                {s || "none"}
              </button>
            ))}
          </div>
        </section>

        {/* Comments */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Comments
          </h3>
          <ul className="mb-3 space-y-3">
            {comments.length === 0 && (
              <li className="text-sm text-muted">No comments yet.</li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-background p-2.5">
                <div className="mb-0.5 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{nameOf(c.user_id)}</span>
                  <span className="text-[11px] text-muted">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>

          <form onSubmit={addComment} className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              className="resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="self-end rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </section>
      </div>
    </aside>
  );
}
