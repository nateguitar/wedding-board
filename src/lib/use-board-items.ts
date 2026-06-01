"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/upload";
import type { Link, Upload } from "@/lib/types";

export type ItemKind = "image" | "pdf" | "link";

export type BoardItem = {
  shapeId: string;
  kind: ItemKind;
  title: string;
  subtitle: string;
  status: string;
  thumb: string | null;
  url?: string;
  createdAt: string;
};

export type BoardCounts = {
  all: number;
  image: number;
  pdf: number;
  link: number;
  shortlisted: number;
  maybe: number;
  rejected: number;
};

// Loads everything reviewable on a board (uploads + links), signs image
// thumbnails, and keeps itself fresh via realtime. Shared by the Gallery, the
// Browse filters, and the Links panel so they never disagree.
export function useBoardItems(boardId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [u, l] = await Promise.all([
        supabase.from("uploads").select("*").eq("board_id", boardId).order("created_at"),
        supabase.from("links").select("*").eq("board_id", boardId).order("created_at"),
      ]);
      const uploads = (u.data as Upload[]) ?? [];
      const links = (l.data as Link[]) ?? [];

      const signed = await Promise.all(
        uploads.map(async (up) => {
          if (!ACCEPTED_IMAGE_TYPES.includes(up.file_type)) return null;
          const { data } = await supabase.storage
            .from("uploads")
            .createSignedUrl(up.storage_path, 3600);
          return data?.signedUrl ?? null;
        })
      );

      const next: BoardItem[] = [
        ...uploads.map((up, i) => ({
          shapeId: up.shape_id,
          kind: (up.file_type === "application/pdf" ? "pdf" : "image") as ItemKind,
          title: up.original_filename,
          subtitle: up.file_type === "application/pdf" ? "PDF" : "Image",
          status: up.status,
          thumb: signed[i],
          createdAt: up.created_at,
        })),
        ...links.map((ln) => ({
          shapeId: ln.shape_id,
          kind: "link" as ItemKind,
          title: ln.title || ln.url,
          subtitle: ln.site_name || safeHost(ln.url),
          status: ln.status,
          thumb: ln.image_url || null,
          url: ln.url,
          createdAt: ln.created_at,
        })),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

      if (!cancelled) {
        setItems(next);
        setLoading(false);
      }
    }

    setLoading(true);
    load();

    const channel = supabase
      .channel(`board-items-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "uploads", filter: `board_id=eq.${boardId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "links", filter: `board_id=eq.${boardId}` }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [boardId, supabase]);

  const counts: BoardCounts = useMemo(() => {
    const c: BoardCounts = { all: items.length, image: 0, pdf: 0, link: 0, shortlisted: 0, maybe: 0, rejected: 0 };
    for (const it of items) {
      c[it.kind]++;
      if (it.status === "shortlisted") c.shortlisted++;
      else if (it.status === "maybe") c.maybe++;
      else if (it.status === "rejected") c.rejected++;
    }
    return c;
  }, [items]);

  return { items, counts, loading };
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
