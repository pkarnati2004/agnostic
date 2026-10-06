// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render } from "../test/render";
import { ShortcutsSection } from "./shortcuts-section";

it("lists what the workspace answers to, and says none of it can be rebound", () => {
  const { container, unmount } = render(<ShortcutsSection platform="MacIntel" />);
  const text = container.textContent ?? "";
  expect(text).toContain("Shortcuts can't be changed yet.");
  for (const row of ["Command palette", "Start task", "Task row menu", "Close"]) {
    expect(text).toContain(row);
  }
  expect([...container.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual([
    "⌘K",
    "⌘↵",
    "⇧F10",
    "⎋",
  ]);
  unmount();
});

it("writes the modifier the way the platform does", () => {
  const { container, unmount } = render(<ShortcutsSection platform="Win32" />);
  const keys = [...container.querySelectorAll("kbd")].map((key) => key.textContent);
  expect(keys).toEqual(["Ctrl K", "Ctrl ↵", "⇧F10", "⎋"]);
  unmount();
});
