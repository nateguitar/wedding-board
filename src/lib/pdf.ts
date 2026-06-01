// Render the first page of a PDF to a PNG blob for use as a canvas thumbnail.
import * as pdfjsLib from "pdfjs-dist";

// Point pdf.js at its worker. `new URL(..., import.meta.url)` is understood by
// the Next.js bundler and produces a correct asset URL at build time.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export type RenderedThumb = {
  blob: Blob;
  width: number;
  height: number;
};

export async function renderPdfFirstPage(
  file: File,
  targetWidth = 900
): Promise<RenderedThumb> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context for PDF rendering");

  // White backdrop so transparent PDFs don't render black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    )
  );

  return { blob, width: canvas.width, height: canvas.height };
}
