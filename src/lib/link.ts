import type { SupabaseClient } from "@supabase/supabase-js";
import { AssetRecordType, createShapeId, toRichText, type Editor, type VecLike } from "tldraw";

const MAX_DISPLAY_WIDTH = 340;

type Unfurled = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

export type LinkResult = { shapeId: string; url: string };

function looksLikeUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function normalizeUrl(text: string): string | null {
  const t = text.trim();
  if (looksLikeUrl(t)) return t;
  // Allow pasting "etsy.com/..." without a scheme.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return null;
}

// Loads an image just far enough to read its natural dimensions. naturalWidth/
// naturalHeight are readable cross-origin (they aren't pixel data).
function imageDims(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Unfurls a URL, drops a card on the canvas, and records a `links` row keyed to
// the shape id. Uses the og:image as an image shape when available, otherwise a
// sticky note with the title + URL.
export async function placeLinkOnCanvas(opts: {
  editor: Editor;
  supabase: SupabaseClient;
  boardId: string;
  userId: string;
  url: string;
  point: VecLike;
}): Promise<LinkResult> {
  const { editor, supabase, boardId, userId, point } = opts;

  const res = await fetch("/api/unfurl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: opts.url }),
  });
  const meta = (await res.json()) as Unfurled;

  const shapeId = createShapeId();

  if (meta.image) {
    const dims = (await imageDims(meta.image)) ?? { w: 400, h: 300 };
    const scale = dims.w > MAX_DISPLAY_WIDTH ? MAX_DISPLAY_WIDTH / dims.w : 1;
    const displayW = Math.round(dims.w * scale);
    const displayH = Math.round(dims.h * scale);

    const assetId = AssetRecordType.createId();
    editor.createAssets([
      {
        id: assetId,
        type: "image",
        typeName: "asset",
        meta: {},
        props: {
          w: dims.w,
          h: dims.h,
          name: meta.title || meta.url,
          isAnimated: false,
          mimeType: "image/*",
          src: meta.image,
        },
      },
    ]);
    editor.createShape({
      id: shapeId,
      type: "image",
      x: point.x - displayW / 2,
      y: point.y - displayH / 2,
      props: { assetId, w: displayW, h: displayH },
    });
  } else {
    // No preview image — drop a sticky note so there's something to react to.
    editor.createShape({
      id: shapeId,
      type: "note",
      x: point.x - 100,
      y: point.y - 100,
      props: { richText: toRichText(`${meta.title}\n${meta.url}`.slice(0, 200)) },
    });
  }

  const { error } = await supabase.from("links").insert({
    board_id: boardId,
    shape_id: shapeId,
    url: meta.url,
    title: meta.title ?? "",
    description: meta.description ?? "",
    image_url: meta.image ?? "",
    site_name: meta.siteName ?? "",
    created_by: userId,
  });
  if (error) throw error;

  return { shapeId, url: meta.url };
}
