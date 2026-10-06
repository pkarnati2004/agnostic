import { useEffect, useState } from "react";
import { clampWidth, type PaneRange } from "./pane-width";

export type PaneWidth = {
  width: number;
  /** Clamped to the range; integers only. */
  set: (width: number) => void;
  reset: () => void;
};

/**
 * A pane that is not drawn has no width of its own: when `shown` turns false the width goes back
 * to the default, so collapsing, closing or hiding the pane reopens it at the default.
 */
export function usePaneWidth(range: PaneRange, shown: boolean): PaneWidth {
  const [width, setWidth] = useState(range.defaultWidth);
  useEffect(() => {
    if (!shown) {
      setWidth(range.defaultWidth);
    }
  }, [shown, range.defaultWidth]);
  return {
    width,
    set: (next) => setWidth(clampWidth(range, Math.round(next))),
    reset: () => setWidth(range.defaultWidth),
  };
}
