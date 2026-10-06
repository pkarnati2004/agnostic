import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../class-names";
import type { PaneColumn } from "./workspace-columns";

type Edge = "left" | "right";

type PaneHandleProps = {
  /** Which edge of its pane the handle sits on; a drag to the right widens a right-edge pane and
   * narrows a left-edge one. */
  edge: Edge;
  /** The `aria-label`: "Resize sidebar", "Resize Changes". */
  label: string;
  column: PaneColumn;
};

/** How far one arrow press moves the edge. */
const KEY_STEP_PX = 16;

/** Set on `<body>` while a drag runs, so the cursor and the dead selection hold across the page. */
const DRAGGING_CLASS = "pane-dragging";

/** The separator on a pane's edge: drag it, or focus it and use the arrow keys, to set the width. */
export function PaneHandle({ edge, label, column }: PaneHandleProps) {
  const drag = usePaneDrag(edge, column);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyWidth(event.key, edge, column);
    if (next === null) {
      return;
    }
    event.preventDefault();
    column.set(bound(column, next));
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> takes no focus and holds no child bar
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={column.min}
      aria-valuemax={column.max}
      aria-valuenow={column.width}
      tabIndex={0}
      data-dragging={drag.dragging ? "" : undefined}
      // The hit area is 8 px wide; `z-10` keeps it over the terminal canvas beside it.
      className={cn(
        "group absolute top-0 bottom-0 z-10 w-2 cursor-col-resize outline-none",
        // The sidebar's straddles its edge; the column's sits inside, because the panel's `aside`
        // has `overflow-hidden` and would clip the outer half.
        edge === "right" ? "-right-1" : "left-0",
      )}
      onPointerDown={drag.start}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
      onLostPointerCapture={drag.end}
      onDoubleClick={column.reset}
      onKeyDown={onKeyDown}
    >
      {/* The bar over the pane's border: invisible until the handle is hovered, focused or held. */}
      <div
        className={cn(
          "h-full w-1 bg-transparent group-hover:bg-ring group-focus-visible:bg-ring",
          "group-data-[dragging]:bg-ring",
          edge === "right" ? "mx-auto" : "mr-auto",
        )}
      />
    </div>
  );
}

type Drag = { startX: number; startWidth: number; latestX: number; frame: number | null };

type PaneDrag = {
  dragging: boolean;
  start: (event: PointerEvent<HTMLDivElement>) => void;
  move: (event: PointerEvent<HTMLDivElement>) => void;
  end: (event: PointerEvent<HTMLDivElement>) => void;
};

/**
 * The pointer's own delta, not the pane's rect: the drag then needs no layout, and the width moves
 * at most once a frame however often the pointer reports.
 */
function usePaneDrag(edge: Edge, column: PaneColumn): PaneDrag {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  // A pane closed mid-drag would otherwise leave the page with a resize cursor and no selection.
  useEffect(() => () => stopDragging(drag), []);
  const apply = (moved: Drag) => column.set(bound(column, widthAfter(edge, moved)));
  return {
    dragging,
    start: (event) => {
      if (event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const at = event.clientX;
      drag.current = { startX: at, startWidth: column.width, latestX: at, frame: null };
      document.body.classList.add(DRAGGING_CLASS);
      setDragging(true);
    },
    move: (event) => {
      const moved = drag.current;
      if (moved === null) {
        return;
      }
      moved.latestX = event.clientX;
      if (moved.frame === null) {
        moved.frame = requestAnimationFrame(() => {
          moved.frame = null;
          apply(moved);
        });
      }
    },
    end: (event) => {
      const moved = drag.current;
      if (moved === null) {
        return;
      }
      moved.latestX = event.clientX;
      stopDragging(drag);
      apply(moved);
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
  };
}

/** Drops the drag, the pending frame and the body class; safe to call when no drag is running. */
function stopDragging(drag: { current: Drag | null }): void {
  const moved = drag.current;
  if (moved === null) {
    return;
  }
  if (moved.frame !== null) {
    cancelAnimationFrame(moved.frame);
  }
  drag.current = null;
  document.body.classList.remove(DRAGGING_CLASS);
}

function widthAfter(edge: Edge, moved: Drag): number {
  const delta = edge === "right" ? moved.latestX - moved.startX : moved.startX - moved.latestX;
  return moved.startWidth + delta;
}

/** The window's ceiling, which is tighter than the pane's own range once the other pane is open. */
function bound(column: PaneColumn, width: number): number {
  return Math.min(Math.max(Math.round(width), column.min), column.max);
}

/** The arrow moves the edge in its own direction, so ArrowRight widens a right-edge pane. */
function keyWidth(key: string, edge: Edge, column: PaneColumn): number | null {
  const step = edge === "right" ? KEY_STEP_PX : -KEY_STEP_PX;
  switch (key) {
    case "ArrowRight":
      return column.width + step;
    case "ArrowLeft":
      return column.width - step;
    case "Home":
      return column.min;
    case "End":
      return column.max;
    default:
      return null;
  }
}
