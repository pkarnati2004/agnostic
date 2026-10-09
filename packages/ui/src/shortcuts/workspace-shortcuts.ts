import { useEffect, useRef } from "react";

export type ShortcutId = "handoff" | "toggleSidebar" | "toggleChanges" | "nextTab";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/**
 * Which binding a keydown is, or null. ⌘⇧H, ⌘\ and ⌘⇧C take either modifier, so no platform is
 * hard-coded; ⌃⇥ is Control and Tab on every platform, which is why it refuses ⌘. `code` reads the
 * backslash because a layout that puts another character there still has the key.
 */
export function shortcutOf(event: ShortcutEvent): ShortcutId | null {
  if (event.altKey) {
    return null;
  }
  if (event.key === "Tab") {
    return event.ctrlKey && !event.metaKey && !event.shiftKey ? "nextTab" : null;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "h") {
      return "handoff";
    }
    return key === "c" ? "toggleChanges" : null;
  }
  return key === "\\" || event.code === "Backslash" ? "toggleSidebar" : null;
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** A pane's keys arrive through xterm's hidden textarea, which is not the user typing into a field. */
const TERMINAL_INPUT = ".xterm-helper-textarea";

/** The frame the copied shadcn dialog marks while it is up; it is also what Escape belongs to. */
const OPEN_DIALOG = '[data-slot="dialog-content"][data-state="open"]';

/** A keystroke that belongs to a field the user is typing in, not to the workspace behind it. */
function intoAField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  const field = target.closest(EDITABLE);
  return field !== null && !field.matches(TERMINAL_INPUT);
}

/**
 * Window keydown in the capture phase, like the palette's: xterm would otherwise take the
 * keystroke and send it to the pane. A match is handled here and nowhere else.
 *
 * Two keystrokes are not ours. One typed into a field is the field's, so ⌘⇧H in the Settings
 * search box does not open a handoff behind the dialog; a pane's own keys come through xterm's
 * hidden textarea, which is why that one field is excluded. And nothing fires while a dialog is up:
 * these four act on the workspace, which the user cannot see past it. The palette's ⌘K is
 * deliberately not guarded this way - opening it over a focused terminal is the point of it.
 */
export function useWorkspaceShortcuts(handlers: Record<ShortcutId, () => void>): void {
  // The page builds these closures afresh every render; the listener is registered once and reads
  // the newest set, so a keystroke never runs a handler that closed over a stale task.
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = shortcutOf(event);
      if (id === null || intoAField(event.target) || document.querySelector(OPEN_DIALOG) !== null) {
        return;
      }
      event.preventDefault();
      latest.current[id]();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
