import { DEFAULT_TERMINAL_SIZE } from "@agnostic/core/browser";
import type { ITheme } from "@xterm/xterm";

// 40 % of 255, as the hex alpha byte xterm's own colour parser reads.
const SELECTION_ALPHA = "66";

/** What a pane falls back through: the user's choice goes in front of it, never in place of it. */
export const MONO_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/**
 * The pane's colours from `tokens.css`, read once at mount. `--terminal` is the canvas the pane sits
 * on, which the page owns; everything drawn on it is the agent's, so the sixteen ANSI colours stay
 * xterm's. `read` is `getComputedStyle(…).getPropertyValue` in the page, a stub in tests.
 */
export function xtermTheme(read: (token: string) => string): ITheme {
  const background = read("--terminal").trim();
  const foreground = read("--foreground").trim();
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: translucent(read("--ring").trim()),
  };
}

/** The tokens are plain hex, which takes an alpha byte; anything else is passed through as read. */
function translucent(color: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? `${color}${SELECTION_ALPHA}` : color;
}

/**
 * The pane's font from the same place its colours come from: `--terminal-font` is the family the
 * user picked in Settings, or nothing for the page's own stack, and `--terminal-font-size` is the
 * size in px. A property the root does not set reads as the empty string, which is the default.
 */
export function xtermFont(read: (token: string) => string): {
  fontFamily: string;
  fontSize: number;
} {
  const family = read("--terminal-font")
    .trim()
    .replace(/^["']|["']$/g, "");
  const size = Number.parseFloat(read("--terminal-font-size"));
  return {
    fontFamily: family === "" ? MONO_STACK : `"${family}", ${MONO_STACK}`,
    fontSize: Number.isFinite(size) && size > 0 ? size : DEFAULT_TERMINAL_SIZE,
  };
}
