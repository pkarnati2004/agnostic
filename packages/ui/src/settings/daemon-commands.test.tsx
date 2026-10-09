// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { click, render } from "../test/render";
import { DaemonCommands } from "./daemon-commands";

const FILE = "/Users/you/.agnostic/config.yaml";

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

function copyButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button[aria-label^='Copy']")];
}

it("lists the seven commands and the path of config.yaml", () => {
  const { container, unmount } = render(<DaemonCommands file={FILE} />);
  const text = container.textContent ?? "";
  for (const command of [
    "agn daemon start",
    "agn daemon stop",
    "agn daemon restart",
    "agn daemon status",
    "agn doctor",
    "agn catalog update",
    "agn hooks install --repo <path>",
  ]) {
    expect(text).toContain(command);
  }
  expect(text).toContain(FILE);
  expect(copyButtons(container)).toHaveLength(8);
  unmount();
});

it("copies the line of whichever row was asked", () => {
  const { container, unmount } = render(<DaemonCommands file={FILE} />);
  const buttons = copyButtons(container);
  click(buttons[0] as HTMLButtonElement);
  expect(writeText).toHaveBeenCalledWith("agn daemon start");
  click(buttons[7] as HTMLButtonElement);
  expect(writeText).toHaveBeenLastCalledWith(FILE);
  unmount();
});

it("offers no Restart: the page cannot restart the daemon that serves it", () => {
  const { container, unmount } = render(<DaemonCommands file={FILE} />);
  expect(container.textContent).not.toContain("Restart");
  unmount();
});

it("disables the path button until the daemon has named the file", () => {
  const { container, unmount } = render(<DaemonCommands file={null} />);
  expect(copyButtons(container)[7]?.disabled).toBe(true);
  unmount();
});
