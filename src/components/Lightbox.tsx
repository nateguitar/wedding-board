"use client";

import { useEffect } from "react";

export default function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {/* Stop clicks on the image from bubbling to the backdrop */}
      <div onClick={(e) => e.stopPropagation()} className="relative max-h-[90vh] max-w-[90vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? "Full size preview"}
          className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
        />
        <button
          onClick={onClose}
          className="absolute -right-3 -top-3 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-sm shadow-lg transition hover:bg-accent hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p className="absolute bottom-6 text-sm text-white/60">
        Click anywhere or press Esc to close
      </p>
    </div>
  );
}
