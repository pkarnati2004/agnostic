// @vitest-environment happy-dom
import type { ChangedFile } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { FILES, MIXED_FILES } from "./changes-fixture";
import { FileList } from "./file-list";

function list(files: ChangedFile[]) {
  return render(
    <FileList files={files} selected={files[0]?.path ?? null} onSelect={() => undefined} />,
  );
}

function rows(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
}

function paths(root: ParentNode): (string | null)[] {
  return rows(root).map((row) => row.getAttribute("title"));
}

describe("FileList", () => {
  it("heads one group per state, in the order the daemon sent them", () => {
    const { container, unmount } = list(MIXED_FILES);
    const groups = Array.from(container.querySelectorAll<HTMLElement>('[role="group"]'));
    expect(groups.map((group) => group.getAttribute("data-state"))).toEqual([
      "unstaged",
      "staged",
      "committed",
    ]);
    expect(groups.map((group) => group.firstElementChild?.textContent)).toEqual([
      "Unstaged 2",
      "Staged 1",
      "Committed 2",
    ]);
    expect(groups.map(paths)).toEqual([
      ["src/invite.ts", "docs/invites.md"],
      ["src/invite.test.ts"],
      ["src/links.ts", "docs/links.md"],
    ]);
    expect(rows(container)[0]?.getAttribute("aria-selected")).toBe("true");
    unmount();
  });

  it("heads the one group a list of unstaged rows has", () => {
    const { container, unmount } = list(FILES);
    const group = container.querySelector('[role="group"][data-state="unstaged"]');
    expect(group?.firstElementChild?.textContent).toBe("Unstaged 3");
    expect(paths(container)).toEqual(["src/invite.ts", "src/invite.test.ts", "docs/invites.md"]);
    unmount();
  });

  it("heads nothing once every row is committed", () => {
    const committed = FILES.map((file) => ({ ...file, state: "committed" as const }));
    const { container, unmount } = list(committed);
    expect(paths(container)).toEqual(["src/invite.ts", "src/invite.test.ts", "docs/invites.md"]);
    expect(container.textContent).not.toContain("Committed 3");
    expect(container.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe(
      "Changed files",
    );
    unmount();
  });

  it("draws a file with both staged and unstaged edits once, under Unstaged only", () => {
    const dual: ChangedFile = {
      path: "src/dual.ts",
      status: "modified",
      state: "unstaged",
      additions: 1,
      deletions: 1,
    };
    const { container, unmount } = list([dual]);
    expect(rows(container)).toHaveLength(1);
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);
    expect(container.querySelector('[role="group"][data-state="unstaged"]')?.textContent).toContain(
      "src/dual.ts",
    );
    unmount();
  });
});
