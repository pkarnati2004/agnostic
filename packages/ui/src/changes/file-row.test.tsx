// @vitest-environment happy-dom
import type { ChangedFile } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { click, find, render } from "../test/render";
import { FileRow } from "./file-row";

function file(over: Partial<ChangedFile> = {}): ChangedFile {
  return {
    path: "packages/ui/src/usage-bar.tsx",
    status: "modified",
    state: "unstaged",
    additions: 38,
    deletions: 4,
    ...over,
  };
}

function row(over: Partial<ChangedFile> = {}, selected = false) {
  const onSelect = vi.fn();
  return {
    onSelect,
    ...render(<FileRow file={file(over)} selected={selected} onSelect={onSelect} />),
  };
}

function letter(container: HTMLElement): HTMLElement {
  return find(container, "span");
}

describe("FileRow", () => {
  it("colours the status letter by what happened to the file", () => {
    for (const [status, token] of [
      ["added", "--status-running"],
      ["modified", "--warning"],
      ["deleted", "--destructive"],
      ["renamed", "--muted-foreground"],
      ["untracked", "--muted-foreground"],
    ] as const) {
      const { container, unmount } = row({ status });
      expect(letter(container).getAttribute("style")).toContain(token);
      unmount();
    }
  });

  it("puts the directory behind the file name", () => {
    const { container, unmount } = row();
    expect(container.textContent).toContain("packages/ui/src/usage-bar.tsx");
    expect(find(container, "button").getAttribute("title")).toBe("packages/ui/src/usage-bar.tsx");
    unmount();
  });

  it("counts what the file gained and lost", () => {
    const { container, unmount } = row();
    expect(container.textContent).toContain("+38");
    expect(container.textContent).toContain("−4");
    unmount();
  });

  it("says untracked and binary rather than counting them", () => {
    const untracked = row({ status: "untracked", additions: null, deletions: null });
    expect(untracked.container.textContent).toContain("untracked");
    untracked.unmount();
    const binary = row({ additions: null, deletions: null });
    expect(binary.container.textContent).toContain("binary");
    binary.unmount();
  });

  it("opens the patch for the file it was clicked on", () => {
    const { container, onSelect, unmount } = row();
    click(find(container, "button"));
    expect(onSelect).toHaveBeenCalledWith("packages/ui/src/usage-bar.tsx");
    unmount();
  });
});
