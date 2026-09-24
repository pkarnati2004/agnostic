// @vitest-environment happy-dom
import type { Recommendation } from "@agnostic/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { Rendered } from "../test/render";
import {
  field,
  handlers,
  labels,
  open as openPalette,
  press,
  pressAwaiting,
  RECOMMENDATION,
  type,
} from "./command-palette-fixture";

let page: Rendered | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function open(...args: Parameters<typeof openPalette>): void {
  page = openPalette(...args);
}

/** Selects "Recommend: <query>", which sits after "Run: <query>" once nothing else matches. */
async function askRecommend(query: string): Promise<void> {
  type(query);
  press("ArrowDown");
  await pressAwaiting("Enter");
}

/** Lets a promise settled outside an event handler reach the state it updates. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CommandPalette recommend answers", () => {
  it("drops an older Recommend answer once a newer one has been asked", async () => {
    const waiting: Array<(value: Recommendation) => void> = [];
    const recommend = vi.fn(
      () =>
        new Promise<Recommendation>((resolve) => {
          waiting.push(resolve);
        }),
    );
    open({ handlers: handlers(), recommend });

    type("first prompt");
    press("ArrowDown");
    press("Enter");
    expect(recommend).toHaveBeenCalledTimes(1);

    type("second prompt");
    press("ArrowDown");
    press("Enter");
    expect(recommend).toHaveBeenCalledTimes(2);
    expect(recommend).toHaveBeenNthCalledWith(1, "repo1", "first prompt");
    expect(recommend).toHaveBeenNthCalledWith(2, "repo1", "second prompt");

    waiting[0]?.(RECOMMENDATION);
    await settle();

    // The first call's answer arrived after the second was asked, so it never reaches the screen.
    expect(document.body.textContent).toContain("Asking agn which profile fits");
    expect(labels()).toEqual([]);

    const second: Recommendation = {
      ...RECOMMENDATION,
      recommended: { ...RECOMMENDATION.recommended, profileId: "gemini:pro:native" },
      alternative: null,
    };
    waiting[1]?.(second);
    await settle();

    expect(labels()).toEqual(["Run on gemini:pro:native", "Back"]);
  });

  it("keeps the prompt and shows the hint as code when the daemon refuses to start the run", async () => {
    const refused = new ApiError("that folder is in use", {
      code: "folder-busy",
      status: 409,
      hint: "Run `agn stop task1` first.",
    });
    const runOn = vi.fn(() => Promise.reject(refused));
    open({ handlers: handlers(), runOn });

    await askRecommend("port the parser");
    expect(labels()).toEqual([
      "Run on claude-code:opus:native",
      "Run on codex:gpt-5:native",
      "Back",
    ]);
    await pressAwaiting("Enter");

    expect(document.body.textContent).toContain("that folder is in use");
    expect([...document.querySelectorAll("code")].map((el) => el.textContent)).toEqual([
      "agn stop task1",
    ]);
    expect(field().value).toBe("port the parser");
    expect(document.querySelector('input[aria-label="Command"]')).not.toBeNull();
  });

  it("closes the palette and starts the tab once the daemon accepts the run", async () => {
    const runOn = vi.fn(() => Promise.resolve());
    open({ handlers: handlers(), runOn });

    await askRecommend("port the parser");
    await pressAwaiting("Enter");

    expect(runOn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });

  it("closes on Escape from the recommended view too, rather than going back first", async () => {
    open({ handlers: handlers() });

    await askRecommend("port the parser");
    expect(labels()).toEqual([
      "Run on claude-code:opus:native",
      "Run on codex:gpt-5:native",
      "Back",
    ]);

    press("Escape");
    expect(document.querySelector('input[aria-label="Command"]')).toBeNull();
  });
});
