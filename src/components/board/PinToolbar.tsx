"use client";

import { useState } from "react";
import { PIN_COLORS } from "@/lib/pin-shape";
import { useEditor, createShapeId } from "tldraw";
import type { PinShape } from "@/lib/pin-shape";

// Floating toolbar rendered inside <Tldraw> so useEditor() works.
// Shows when the user activates the pin tool from the left sidebar.
export default function PinToolbar({
  onClose,
}: {
  onClose: () => void;
}) {
  const editor = useEditor();
  const [color, setColor] = useState<string>(PIN_COLORS[0].hex);
  const [label, setLabel] = useState("");

  function placePin() {
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape<PinShape>({
      id,
      type: "pin",
      x: center.x - 16,
      y: center.y - 40,
      props: { w: 32, h: 40, color, label: label.trim() },
    });
    editor.select(id);
    setLabel("");
    onClose();
  }

  return (
    <div className="absolute right-3 top-3 z-[200] w-52 rounded-xl border border-border bg-surface/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Add pin
        </span>
        <button
          onClick={onClose}
          className="text-muted transition hover:text-foreground"
          aria-label="Close pin toolbar"
        >
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Color swatches */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">Color</p>
          <div className="flex gap-2">
            {PIN_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                title={c.name}
                className={[
                  "h-7 w-7 rounded-full border-2 transition hover:scale-110",
                  color === c.hex ? "border-foreground scale-110" : "border-transparent",
                ].join(" ")}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        {/* Optional label */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">
            Label <span className="normal-case">(optional)</span>
          </p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && placePin()}
            placeholder="e.g. Check this…"
            maxLength={40}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <button
          onClick={placePin}
          className="w-full rounded-lg py-1.5 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: color }}
        >
          Place pin
        </button>

        <p className="text-[10px] text-muted text-center">
          Tip: drag the pin after placing to reposition it.
        </p>
      </div>
    </div>
  );
}
