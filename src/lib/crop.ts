import type { Editor, TLImageShape, TLShapeId, TLAssetId } from "tldraw";

// Renders the part of an image shape that lies under a marquee rectangle into a
// fresh PNG blob, at the source image's native resolution. Returns the blob plus
// a page-space point to drop the new image near. Assumes the image isn't rotated
// (the common case); rotated images would need a transform we don't bother with.
export async function cropRegionToBlob(opts: {
  editor: Editor;
  imageId: string;
  rectId: string;
  resolveSrc: (assetId: TLAssetId) => Promise<string | null>;
}): Promise<{ blob: Blob; point: { x: number; y: number } } | null> {
  const { editor, resolveSrc } = opts;
  const imageId = opts.imageId as TLShapeId;
  const rectId = opts.rectId as TLShapeId;

  const shape = editor.getShape(imageId) as TLImageShape | undefined;
  const imgB = editor.getShapePageBounds(imageId);
  const rectB = editor.getShapePageBounds(rectId);
  if (!shape || shape.type !== "image" || !imgB || !rectB) return null;

  // Intersection of the marquee with the image, in page space.
  const ax = Math.max(imgB.x, rectB.x);
  const ay = Math.max(imgB.y, rectB.y);
  const bx = Math.min(imgB.x + imgB.w, rectB.x + rectB.w);
  const by = Math.min(imgB.y + imgB.h, rectB.y + rectB.h);
  if (bx <= ax || by <= ay) return null;

  // Normalised position inside the displayed image box (0..1).
  const u0 = (ax - imgB.x) / imgB.w;
  const v0 = (ay - imgB.y) / imgB.h;
  const u1 = (bx - imgB.x) / imgB.w;
  const v1 = (by - imgB.y) / imgB.h;

  // Compose with any existing (non-destructive) crop on the source image.
  const crop = shape.props.crop;
  const cx0 = crop ? crop.topLeft.x : 0;
  const cy0 = crop ? crop.topLeft.y : 0;
  const cx1 = crop ? crop.bottomRight.x : 1;
  const cy1 = crop ? crop.bottomRight.y : 1;
  const nx0 = cx0 + u0 * (cx1 - cx0);
  const ny0 = cy0 + v0 * (cy1 - cy0);
  const nx1 = cx0 + u1 * (cx1 - cx0);
  const ny1 = cy0 + v1 * (cy1 - cy0);

  const assetId = shape.props.assetId;
  if (!assetId) return null;
  const asset = editor.getAsset(assetId);
  if (!asset) return null;
  const natW = (asset.props as { w?: number }).w ?? 0;
  const natH = (asset.props as { h?: number }).h ?? 0;
  if (!natW || !natH) return null;

  const url = await resolveSrc(assetId);
  if (!url) return null;
  const img = await loadImage(url);

  const sx = Math.round(nx0 * natW);
  const sy = Math.round(ny0 * natH);
  const sw = Math.max(1, Math.round((nx1 - nx0) * natW));
  const sh = Math.max(1, Math.round((ny1 - ny0) * natH));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return null;

  return { blob, point: { x: (ax + bx) / 2 + 24, y: (ay + by) / 2 + 24 } };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // needed so the canvas stays exportable
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
