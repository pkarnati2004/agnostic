import { useEffect } from "react";

type ShortcutEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** Cmd-K on a Mac, Ctrl-K elsewhere. Either modifier opens it, so no platform is hard-coded. */
export function isPaletteShortcut(event: ShortcutEvent): boolean {
  if (event.key.toLowerCase() !== "k") {
    return false;
  }
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

/**
 * The capture phase, on the window: the palette opens from a focused terminal too, because xterm
 * would otherwise take the keystroke and send it to the pane.
 */
export function usePaletteShortcut(onToggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isPaletteShortcut(event)) {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onToggle]);
}
