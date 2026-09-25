import type { TaskStatus } from "@agnostic/core";
import type { CSSProperties } from "react";
import { cn } from "../class-names";
import { STATUS_DOT, type StatusShape } from "./status-dot";

/** A glyph in a sidebar row is 8 px; one in a tab or a pill is 7 px. */
export type GlyphSize = "row" | "tab";

const DOT_PX: Record<GlyphSize, number> = { row: 8, tab: 7 };
const SQUARE_PX: Record<GlyphSize, number> = { row: 7, tab: 6 };

/** What is drawn: a worktree agn has removed takes the dashed ring whatever the status. */
type Drawn = StatusShape | "cleaned";

/**
 * The one dot every status draws as. It carries no text: the row, the tab and the pill around it
 * say the word, so a screen reader hears the status once.
 */
export function StatusGlyph({
  status,
  size = "row",
  cleaned = false,
  className,
}: {
  status: TaskStatus;
  size?: GlyphSize;
  cleaned?: boolean;
  className?: string;
}) {
  const { token, shape } = STATUS_DOT[status];
  const drawn: Drawn = cleaned ? "cleaned" : shape;
  return (
    <span
      aria-hidden
      data-status={status}
      data-shape={drawn}
      className={cn(
        "shrink-0 rounded-full",
        drawn === "square" && "rounded-[2px]",
        // The page's one animation, and it stops when the machine asks for less motion.
        drawn === "spinner" &&
          "animate-[glyph-spin_1.2s_linear_infinite] motion-reduce:animate-none",
        className,
      )}
      style={glyphStyle(drawn, token, size)}
    />
  );
}

function glyphStyle(drawn: Drawn, token: string, size: GlyphSize): CSSProperties {
  const colour = `var(${token})`;
  const side = drawn === "square" ? SQUARE_PX[size] : DOT_PX[size];
  const box = { width: side, height: side };
  switch (drawn) {
    case "filled":
    case "square":
      return { ...box, backgroundColor: colour };
    case "halo":
      return {
        ...box,
        backgroundColor: colour,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${colour} 20%, transparent)`,
      };
    case "ring":
      return { ...box, border: `1.5px solid ${colour}` };
    case "spinner":
      return { ...box, border: `1.5px solid ${colour}`, borderTopColor: "transparent" };
    case "cleaned":
      return { ...box, border: "1.5px dashed var(--status-done)" };
  }
}
