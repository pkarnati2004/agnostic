// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { Rendered } from "../test/render";
import {
  field,
  groupLabels,
  handlers,
  labels,
  open as openPalette,
  press,
  pressAwaiting,
  RECOMMENDATION,
  type,
} from "./command-palette-fixture";

// Radix portals the palette to `document.body`, so a test that fails mid-way would leave it there.
let page: Rendered | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function open(...args: Parameters<typeof openPalette>): void {
  page = openPalette(...args);
}

describe("CommandPalette", () => {
  it("opens on the shortcut with the input ready for the first keystroke", () => {
    open({ handlers: handlers() });

    expect(document.activeElement).toBe(field());
    expect(labels()[0]).toBe("New task");
    expect(document.body.textContent).toContain("↑↓ move · ↵ run · esc close");
  });

  it("keeps only the rows whose label holds what was typed", () => {
    open({ handlers: handlers() });
    type("sto");

    expect(labels()).toEqual(["Stop Add the invite links", "Run: sto", "Recommend: sto"]);
  });

  it("says so when nothing matches and there is no repo to run a prompt in", () => {
    open({ handlers: handlers(), repo: null });
    type("zzz");

    expect(document.body.textContent).toContain("No command matches");
  });

  it("runs the row the arrows landed on, once, and closes", () => {
    const on = handlers();
    open({ handlers: on });
    press("ArrowDown");
    press("Enter");

    expect(on.stop).toHaveBeenCalledTimes(1);
    expect(on.stop).toHaveBeenCalledWith("task9");
    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });

  it("wraps to the last row on the way up", () => {
    const on = handlers();
    open({ handlers: on });
    press("ArrowUp");
    press("Enter");

    expect(on.sync).toHaveBeenCalledWith("repo1");
  });

  it("labels each group of rows, in the order the list draws them", () => {
    open({ handlers: handlers() });

    // One heading per group, and never the same one twice: Cost and Add repo continue "Commands".
    expect(groupLabels()).toEqual(["Run", "Current task", "Commands"]);

    // The two rows a typed prompt adds join New task under the heading it already carries.
    type("port the parser");
    expect(groupLabels()).toEqual(["Run"]);
  });

  it("draws a recommended profile as a card with its mark, not as a line", async () => {
    open({ handlers: handlers() });
    type("port the parser");
    press("ArrowDown");
    await pressAwaiting("Enter");

    expect(groupLabels()).toEqual(["Recommend"]);
    const card = document.querySelector('[role="option"][aria-label="Run on claude-code · opus"]');
    expect(card?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("claude-code");
    expect(card?.textContent).toContain("strongest on refactors here");
    expect(card?.textContent).toContain("↵ Start a task with this profile");
  });

  it("answers Recommend in the palette, and runs the prompt on the profile picked there", async () => {
    const on = handlers();
    const recommend = vi.fn(() => Promise.resolve(RECOMMENDATION));
    const runOn = vi.fn(() => Promise.resolve());
    open({ handlers: on, recommend, runOn });
    type("port the parser");
    press("ArrowDown");
    await pressAwaiting("Enter");

    expect(recommend).toHaveBeenCalledWith("repo1", "port the parser");
    expect(labels()).toEqual(["Run on claude-code · opus", "Run on codex · gpt-5", "Back"]);

    await pressAwaiting("Enter");
    expect(runOn).toHaveBeenCalledWith("repo1", {
      prompt: "port the parser",
      profile: "claude-code:opus:native",
    });
    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });

  it("keeps the prompt and says why when the daemon refuses the recommendation", async () => {
    const refused = new ApiError("no profile is available", {
      code: "no-profile",
      status: 409,
    });
    open({ handlers: handlers(), recommend: () => Promise.reject(refused) });
    type("port the parser");
    press("ArrowDown");
    await pressAwaiting("Enter");

    expect(document.body.textContent).toContain("no profile is available");
    expect(field().value).toBe("port the parser");
  });

  it("closes on Escape", () => {
    open({ handlers: handlers() });
    press("Escape");

    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });
});
