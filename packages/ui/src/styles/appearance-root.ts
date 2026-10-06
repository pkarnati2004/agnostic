import {
  type Appearance,
  type ColorMode,
  DEFAULT_APPEARANCE,
  isColorMode,
  isThemeId,
  type TerminalConfig,
} from "@agnostic/core/browser";

/** Per browser, so the first paint draws the right theme before any request answers. */
const MIRROR_KEY = "agn.appearance";

export type AppearanceRoot = {
  /** Sets data-theme and the dark/light class; under "system" follows `media` until the next apply. */
  apply(appearance: Appearance): void;
  /** Sets --terminal-font and --terminal-font-size on the root; a null font removes the first. */
  applyTerminal(terminal: TerminalConfig): void;
  dispose(): void;
};

/**
 * The one writer of the theme attribute and the scheme class. Everything that follows a theme -
 * the page's own tokens, a card's swatch, an open terminal's canvas - reads them from `<html>`,
 * so a change reaches a React tree and an xterm canvas by the same route.
 */
export function createAppearanceRoot(
  root: HTMLElement,
  media: MediaQueryList,
  storage: Storage,
): AppearanceRoot {
  let unwatch: (() => void) | null = null;

  const paint = (appearance: Appearance) => {
    root.setAttribute("data-theme", appearance.theme);
    const dark = resolve(appearance.mode, media) === "dark";
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
  };

  return {
    apply: (appearance) => {
      unwatch?.();
      unwatch = null;
      paint(appearance);
      write(storage, appearance);
      if (appearance.mode !== "system") {
        return;
      }
      // Only while the user asked to follow the system: any other mode is their explicit answer.
      const onChange = () => paint(appearance);
      media.addEventListener("change", onChange);
      unwatch = () => media.removeEventListener("change", onChange);
    },
    applyTerminal: (terminal) => {
      if (terminal.font === null) {
        root.style.removeProperty("--terminal-font");
      } else {
        root.style.setProperty("--terminal-font", terminal.font);
      }
      root.style.setProperty("--terminal-font-size", `${terminal.size}px`);
    },
    dispose: () => {
      unwatch?.();
      unwatch = null;
    },
  };
}

/** The theme this browser drew last, for the paint before `GET /config` answers. */
export function readMirror(storage: Storage): Appearance {
  const raw = read(storage);
  if (raw === null) {
    return DEFAULT_APPEARANCE;
  }
  const value: unknown = parse(raw);
  if (typeof value !== "object" || value === null) {
    return DEFAULT_APPEARANCE;
  }
  const { theme, mode } = value as { theme?: unknown; mode?: unknown };
  return {
    theme: isThemeId(theme) ? theme : DEFAULT_APPEARANCE.theme,
    mode: isColorMode(mode) ? mode : DEFAULT_APPEARANCE.mode,
  };
}

function resolve(mode: ColorMode, media: MediaQueryList): "dark" | "light" {
  if (mode !== "system") {
    return mode;
  }
  return media.matches ? "dark" : "light";
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // A mirror written by an older page, or by hand: the daemon's answer replaces it in a moment.
    return null;
  }
}

function read(storage: Storage): string | null {
  try {
    return storage.getItem(MIRROR_KEY);
  } catch {
    // Storage the browser refuses is one less optimisation, not a reason to draw nothing.
    return null;
  }
}

function write(storage: Storage, appearance: Appearance): void {
  try {
    storage.setItem(MIRROR_KEY, JSON.stringify(appearance));
  } catch {
    // Same: a full or blocked storage costs the next load its first paint and nothing else.
  }
}
