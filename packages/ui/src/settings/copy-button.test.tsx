// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { click, render } from "../test/render";
import { CopyButton } from "./copy-button";

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function iconClass(container: HTMLElement): string | null {
  return container.querySelector("svg")?.getAttribute("class") ?? null;
}

it("writes the given text to the clipboard on click", () => {
  const { container, unmount } = render(<CopyButton text="agn doctor" label="Copy agn doctor" />);
  click(container.querySelector("button") as HTMLButtonElement);
  expect(writeText).toHaveBeenCalledWith("agn doctor");
  unmount();
});

it("shows a check for a moment, then goes back to the copy icon", async () => {
  vi.useFakeTimers();
  const { container, unmount } = render(<CopyButton text="agn doctor" label="Copy agn doctor" />);
  expect(iconClass(container)).toContain("lucide-copy");
  await act(async () => {
    click(container.querySelector("button") as HTMLButtonElement);
    await Promise.resolve();
  });
  expect(iconClass(container)).toContain("lucide-check");
  await act(async () => {
    vi.advanceTimersByTime(1_500);
  });
  expect(iconClass(container)).toContain("lucide-copy");
  unmount();
});

it("is disabled for a null text, and never touches the clipboard", () => {
  const { container, unmount } = render(<CopyButton text={null} label="Copy the path" />);
  const button = container.querySelector("button") as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  click(button);
  expect(writeText).not.toHaveBeenCalled();
  unmount();
});

it("stays on the copy icon when the clipboard refuses, with no throw", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: () => Promise.reject(new Error("denied")) },
    configurable: true,
  });
  const { container, unmount } = render(<CopyButton text="agn doctor" label="Copy agn doctor" />);
  await act(async () => {
    click(container.querySelector("button") as HTMLButtonElement);
    await Promise.resolve();
  });
  expect(iconClass(container)).toContain("lucide-copy");
  unmount();
});

it("drops its timer on unmount, so a row that is gone is never written to", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { container, unmount } = render(<CopyButton text="agn doctor" label="Copy agn doctor" />);
  await act(async () => {
    click(container.querySelector("button") as HTMLButtonElement);
    await Promise.resolve();
  });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => {
    vi.advanceTimersByTime(1_500);
  });
  expect(warn).not.toHaveBeenCalled();
  warn.mockRestore();
});
