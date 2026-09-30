// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../test/render";
import {
  Harness,
  handlers,
  labels,
  open as openPalette,
  press,
  type,
} from "./command-palette-fixture";

let page: Rendered | null = null;

const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  page?.unmount();
  page = null;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

function open(...args: Parameters<typeof openPalette>): void {
  page = openPalette(...args);
}

describe("CommandPalette rows", () => {
  it("keeps every row when the query is only whitespace", () => {
    open({ handlers: handlers() });
    const before = labels();

    type("   ");

    expect(labels()).toEqual(before);
  });

  it("leaves Run and Recommend even when nothing else matches, given a repo", () => {
    open({ handlers: handlers() });

    type("zzz");

    expect(labels()).toEqual(["Run: zzz", "Recommend: zzz"]);
    expect(document.body.textContent).not.toContain("No command matches");
  });

  it("runs a row on mousedown, once, without waiting for a click", () => {
    const on = handlers();
    open({ handlers: on });

    const index = labels().indexOf("Stop Add the invite links");
    const row = document.querySelectorAll('[role="option"]')[index];
    act(() => {
      row?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(on.stop).toHaveBeenCalledTimes(1);
    expect(on.stop).toHaveBeenCalledWith("task9");
    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });

  it("brings the row the cursor lands on into view, including the last one ArrowUp wraps to", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    open({ handlers: handlers() });
    scroll.mockClear();

    press("ArrowUp");

    const chosen = document.querySelector('[role="option"][aria-selected="true"]');
    expect(chosen).not.toBeNull();
    expect(scroll.mock.contexts.at(-1)).toBe(chosen);
  });

  it("opens from the shortcut even inside a field that stops the keystroke from bubbling", () => {
    const textField = document.createElement("textarea");
    document.body.append(textField);
    textField.addEventListener("keydown", (event) => event.stopPropagation());
    page = render(<Harness handlers={handlers()} />);

    act(() => {
      textField.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
      );
    });

    expect(document.querySelector('input[aria-label="Command"]')).not.toBeNull();
    textField.remove();
  });

  it("unmounts its portal on close, leaving no dialog behind in the document", () => {
    open({ handlers: handlers() });
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    press("Escape");

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
