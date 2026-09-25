import type { ITheme } from "@xterm/xterm";

// 40 % of 255, as the hex alpha byte xterm's own colour parser reads.
const SELECTION_ALPHA = "66";

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
