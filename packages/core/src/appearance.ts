/**
 * What a theme and a colour mode are, with no schema behind them: the page reads these on its very
 * first paint, before any request, so they belong in the browser-safe half of core.
 */
export const THEME_IDS = [
  "rosewood",
  "claudette",
  "slate",
  "paper",
  "ink",
  "moss",
  "carbon",
  "dusk",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const COLOR_MODES = ["dark", "light", "system"] as const;

export type ColorMode = (typeof COLOR_MODES)[number];

export type Appearance = { theme: ThemeId; mode: ColorMode };

export const DEFAULT_APPEARANCE: Appearance = { theme: "rosewood", mode: "system" };

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function isColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && (COLOR_MODES as readonly string[]).includes(value);
}

/** The pane's font: null is the page's own mono stack; size in px. */
export type TerminalConfig = { font: string | null; size: number };

export const DEFAULT_TERMINAL_SIZE = 13;
