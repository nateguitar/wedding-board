import type { SupabaseClient } from "@supabase/supabase-js";
import { AssetRecordType, createShapeId, type Editor, type VecLike } from "tldraw";
import { toSupabaseSrc } from "@/lib/board-assets";
import { renderPdfFirstPage } from "@/lib/pdf";

const BUCKET = "uploads";
const MAX_DISPLAY_WIDTH = 340;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf"];

export function isAccepted(file: File) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Some browsers report empty type for .jpg; fall back to extension.
  return /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function imageDimensions(file: File) {
  const bitmap = await createImageBitmap(file);
  const dims = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return dims;
}

export type PlaceResult = {
  shapeId: string;
  storagePath: string;
  fileType: string;
  originalFilename: string;
};

// Uploads a file to Supabase Storage, drops it on the canvas as an image shape,
// and records an `uploads` row keyed to the shape id. Returns the metadata so
// the caller can persist / broadcast it.
export async function placeFileOnCanvas(opts: {
  editor: Editor;
  supabase: SupabaseClient;
  boardId: string;
  userId: string;
  file: File;
  point: VecLike;
}): Promise<PlaceResult> {
  const { editor, supabase, boardId, userId, file, point } = opts;
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  const uid = crypto.randomUUID();
  const originalPath = `${boardId}/${uid}-${sanitize(file.name)}`;

  // Upload the original file (kept with its real filename in the DB record).
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(originalPath, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;

  // Determine what to display on the canvas and its natural size.
  let displayPath = originalPath;
  let naturalW: number;
  let naturalH: number;
  let displayMime = file.type;

  if (isPdf) {
    const thumb = await renderPdfFirstPage(file);
    const thumbPath = `${boardId}/${uid}-thumb.png`;
    const { error: tErr } = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumb.blob, { contentType: "image/png" });
    if (tErr) throw tErr;
    displayPath = thumbPath;
    displayMime = "image/png";
    naturalW = thumb.width;
    naturalH = thumb.height;
  } else {
    const dims = await imageDimensions(file);
    naturalW = dims.w;
    naturalH = dims.h;
  }

  const scale =
    naturalW > MAX_DISPLAY_WIDTH ? MAX_DISPLAY_WIDTH / naturalW : 1;
  const displayW = Math.round(naturalW * scale);
  const displayH = Math.round(naturalH * scale);

  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      type: "image",
      typeName: "asset",
      meta: {},
      props: {
        w: naturalW,
        h: naturalH,
        name: file.name,
        isAnimated: false,
        mimeType: displayMime,
        src: toSupabaseSrc(displayPath),
      },
    },
  ]);

  const shapeId = createShapeId();
  editor.createShape({
    id: shapeId,
    type: "image",
    x: point.x - displayW / 2,
    y: point.y - displayH / 2,
    props: { assetId, w: displayW, h: displayH },
  });

  const { error: rowErr } = await supabase.from("uploads").insert({
    board_id: boardId,
    shape_id: shapeId,
    storage_path: originalPath,
    file_type: file.type || (isPdf ? "application/pdf" : "image"),
    original_filename: file.name,
    created_by: userId,
  });
  if (rowErr) throw rowErr;

  return {
    shapeId,
    storagePath: originalPath,
    fileType: file.type,
    originalFilename: file.name,
  };
}
