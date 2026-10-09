// @vitest-environment happy-dom
import type { EditorsResponse, HealthResponse } from "@agnostic/core";
import { expect, it, vi } from "vitest";
import { chooseOption, click, find, openSelect, optionLabels, render } from "../test/render";
import { TasksSection } from "./tasks-section";

const HEALTH: HealthResponse = {
  pid: 48102,
  port: 7431,
  startedAt: "2026-10-06T09:00:00.000Z",
  version: "1.1.0",
  home: "/Users/you/.agnostic",
};

const EDITORS: EditorsResponse = {
  editors: [
    { id: "cursor", name: "Cursor", via: "path", path: "/usr/local/bin/cursor" },
    { id: "vscode", name: "VS Code", via: "app", path: "/Applications/VS Code.app" },
  ],
  default: "cursor",
};

function section(props: Partial<Parameters<typeof TasksSection>[0]> = {}) {
  const onEditor = vi.fn();
  const onSpecFirst = vi.fn();
  const view = render(
    <TasksSection
      health={HEALTH}
      editors={EDITORS}
      editor={null}
      onEditor={onEditor}
      specFirst={false}
      onSpecFirst={onSpecFirst}
      {...props}
    />,
  );
  return { ...view, onEditor, onSpecFirst };
}

it("draws the worktree folder from the daemon's home", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain("/Users/you/.agnostic/worktrees");
  unmount();
});

it("waits rather than guessing a path before the daemon answers", () => {
  const { container, unmount } = section({ health: null });
  expect(container.textContent).not.toContain("worktrees");
  unmount();
});

it("says where the base branch and prefix are set, since they are not set here", () => {
  const { container, unmount } = section();
  expect(container.textContent).toContain(
    "Base branch and branch prefix are set per repo in .ag/agnostic.yaml.",
  );
  unmount();
});

it("writes the starting value of the spec toggle", () => {
  const { container, onSpecFirst, unmount } = section();
  const toggle = find(container, '[role="switch"]');
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  click(toggle);
  expect(onSpecFirst).toHaveBeenCalledWith(true);
  unmount();
});

it("offers the first editor found as well as each one by name", () => {
  const { onEditor, unmount } = section();
  expect(optionLabels(openSelect("Open in editor"))).toEqual([
    "First detected (Cursor)",
    "Cursor",
    "VS Code",
  ]);
  chooseOption(openSelect("Open in editor"), "VS Code");
  expect(onEditor).toHaveBeenCalledWith("vscode");
  unmount();
});

it("clears the editor when the user goes back to the first one found", () => {
  const { onEditor, unmount } = section({ editor: "vscode" });
  chooseOption(openSelect("Open in editor"), "First detected (Cursor)");
  expect(onEditor).toHaveBeenCalledWith(null);
  unmount();
});
