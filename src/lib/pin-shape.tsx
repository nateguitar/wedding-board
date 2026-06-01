import {
  BaseBoxShapeTool,
  ShapeUtil,
  HTMLContainer,
  Rectangle2d,
  type TLBaseShape,
  type RecordProps,
  T,
} from "tldraw";

// ─── Palette ────────────────────────────────────────────────────────────────

export const PIN_COLORS = [
  { name: "Bubblegum", hex: "#F66483" },
  { name: "Marigold", hex: "#F0A800" },
  { name: "Brown Sugar", hex: "#A6480A" },
  { name: "Malachite", hex: "#15484C" },
  { name: "Lagoon", hex: "#30B8B2" },
] as const;

export const PIN_COLOR_VALUES = PIN_COLORS.map((c) => c.hex) as unknown as [string, ...string[]];

// ─── Shape type ─────────────────────────────────────────────────────────────

export type PinShape = TLBaseShape<
  "pin",
  { w: number; h: number; color: string; label: string }
>;

// ─── ShapeUtil ──────────────────────────────────────────────────────────────

export class PinShapeUtil extends ShapeUtil<PinShape> {
  static override type = "pin" as const;

  static override props: RecordProps<PinShape> = {
    w: T.number,
    h: T.number,
    color: T.string,
    label: T.string,
  };

  override getDefaultProps(): PinShape["props"] {
    return { w: 32, h: 40, color: PIN_COLORS[0].hex, label: "" };
  }

  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override isAspectRatioLocked() {
    return true;
  }
  override hideSelectionBoundsFg() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }

  override getGeometry(shape: PinShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override component(shape: PinShape) {
    const { color, label } = shape.props;
    return (
      <HTMLContainer
        id={shape.id}
        style={{ width: shape.props.w, height: shape.props.h, pointerEvents: "all" }}
      >
        <div className="group relative" style={{ width: 32, height: 40 }}>
          {/* SVG pin icon */}
          <svg
            width="32"
            height="40"
            viewBox="0 0 32 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))" }}
          >
            <path
              d="M16 0C9.37 0 4 5.37 4 12c0 9 12 28 12 28s12-19 12-28c0-6.63-5.37-12-12-12z"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
            />
            <circle cx="16" cy="12" r="5" fill="white" fillOpacity="0.7" />
          </svg>

          {/* Hover label */}
          {label && (
            <div
              className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg group-hover:block"
              style={{ backgroundColor: color }}
            >
              {label}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: PinShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={4}
        ry={4}
        fill="none"
        stroke={shape.props.color}
        strokeWidth={2}
      />
    );
  }
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class PinTool extends BaseBoxShapeTool {
  static override id = "pin";
  static override initial = "idle";
  override shapeType = "pin";
}
