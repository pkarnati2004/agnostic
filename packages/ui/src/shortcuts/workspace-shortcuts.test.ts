// @vitest-environment happy-dom
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test/render";
import { type ShortcutId, shortcutOf, useWorkspaceShortcuts } from "./workspace-shortcuts";

type Keys = Partial<Parameters<typeof shortcutOf>[0]>;

function event(over: Keys): Parameters<typeof shortcutOf>[0] {
  return {
    key: "",
    code: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  };
}

describe("shortcutOf", () => {
  it("takes either modifier for the three that are written with ⌘", () => {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      expect(shortcutOf(event({ key: "h", shiftKey: true, ...modifier }))).toBe("handoff");
      expect(shortcutOf(event({ key: "\\", ...modifier }))).toBe("toggleSidebar");
      expect(shortcutOf(event({ key: "c", shiftKey: true, ...modifier }))).toBe("toggleChanges");
    }
  });

  it("reads the backslash key by position, for a layout that prints another character there", () => {
    expect(shortcutOf(event({ key: "`", code: "Backslash", metaKey: true }))).toBe("toggleSidebar");
  });

  it("takes ⌃⇥ with Control alone, never with ⌘", () => {
    expect(shortcutOf(event({ key: "Tab", ctrlKey: true }))).toBe("nextTab");
    expect(shortcutOf(event({ key: "Tab", ctrlKey: true, metaKey: true }))).toBeNull();
    expect(shortcutOf(event({ key: "Tab", metaKey: true }))).toBeNull();
    expect(shortcutOf(event({ key: "Tab", ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("refuses a shift or alt the binding does not ask for", () => {
    expect(shortcutOf(event({ key: "h", metaKey: true }))).toBeNull();
    expect(shortcutOf(event({ key: "\\", metaKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutOf(event({ key: "h", metaKey: true, shiftKey: true, altKey: true }))).toBeNull();
  });

  it("refuses a bare keystroke and a key nothing is bound to", () => {
    expect(shortcutOf(event({ key: "h", shiftKey: true }))).toBeNull();
    expect(shortcutOf(event({ key: "j", metaKey: true }))).toBeNull();
  });
});

describe("useWorkspaceShortcuts", () => {
  function listening(handlers: Record<ShortcutId, () => void>) {
    function Host() {
      useWorkspaceShortcuts(handlers);
      return null;
    }
    return render(createElement(Host));
  }

  it("runs the binding's handler and keeps the keystroke off the page", () => {
    const handlers = {
      handoff: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleChanges: vi.fn(),
      nextTab: vi.fn(),
    };
    const { unmount } = listening(handlers);
    const keydown = new KeyboardEvent("keydown", {
      key: "\\",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(keydown);
    expect(handlers.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(keydown.defaultPrevented).toBe(true);
    unmount();
  });

  const DISPATCHES: { id: ShortcutId; event: KeyboardEventInit }[] = [
    { id: "handoff", event: { key: "h", shiftKey: true, metaKey: true } },
    { id: "toggleSidebar", event: { key: "\\", metaKey: true } },
    { id: "toggleChanges", event: { key: "c", shiftKey: true, metaKey: true } },
    { id: "nextTab", event: { key: "Tab", ctrlKey: true } },
  ];

  it("fires each of the four bindings, and only its own handler, from a real keydown", () => {
    for (const { id, event: init } of DISPATCHES) {
      const handlers = {
        handoff: vi.fn(),
        toggleSidebar: vi.fn(),
        toggleChanges: vi.fn(),
        nextTab: vi.fn(),
      };
      const { unmount } = listening(handlers);
      window.dispatchEvent(
        new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }),
      );
      for (const other of Object.keys(handlers) as ShortcutId[]) {
        expect(handlers[other]).toHaveBeenCalledTimes(other === id ? 1 : 0);
      }
      unmount();
    }
  });

  it("leaves a keystroke nothing is bound to alone", () => {
    const handlers = {
      handoff: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleChanges: vi.fn(),
      nextTab: vi.fn(),
    };
    const { unmount } = listening(handlers);
    const keydown = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
    window.dispatchEvent(keydown);
    expect(keydown.defaultPrevented).toBe(false);
    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(true);
    unmount();
  });

  /** Dispatches each binding at `target` and answers how many handlers ran in total. */
  function firedFrom(target: EventTarget): number {
    const fired: ShortcutId[] = [];
    for (const { event: init } of DISPATCHES) {
      const count = (id: ShortcutId) => () => {
        fired.push(id);
      };
      const { unmount } = listening({
        handoff: count("handoff"),
        toggleSidebar: count("toggleSidebar"),
        toggleChanges: count("toggleChanges"),
        nextTab: count("nextTab"),
      });
      target.dispatchEvent(
        new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }),
      );
      unmount();
    }
    return fired.length;
  }

  it("ignores all four while the user is typing into a field", () => {
    for (const tag of ["input", "textarea"]) {
      const field = document.createElement(tag);
      document.body.append(field);
      expect(firedFrom(field)).toBe(0);
      field.remove();
    }
    const note = document.createElement("div");
    note.setAttribute("contenteditable", "true");
    document.body.append(note);
    expect(firedFrom(note)).toBe(0);
    note.remove();
  });

  it("still fires from a focused terminal, whose keys arrive through xterm's own textarea", () => {
    const pane = document.createElement("textarea");
    pane.className = "xterm-helper-textarea";
    document.body.append(pane);
    expect(firedFrom(pane)).toBe(DISPATCHES.length);
    pane.remove();
  });

  it("ignores all four while a dialog is up, wherever the keystroke came from", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("data-slot", "dialog-content");
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);
    expect(firedFrom(window)).toBe(0);
    dialog.setAttribute("data-state", "closed");
    expect(firedFrom(window)).toBe(DISPATCHES.length);
    dialog.remove();
  });

  it("stops listening once the page is gone", () => {
    const handlers = {
      handoff: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleChanges: vi.fn(),
      nextTab: vi.fn(),
    };
    listening(handlers).unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }));
    expect(handlers.nextTab).not.toHaveBeenCalled();
  });
});
