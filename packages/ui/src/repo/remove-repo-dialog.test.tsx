// @vitest-environment happy-dom
import type { RepoListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { render } from "../test/render";
import { RemoveRepoDialog } from "./remove-repo-dialog";

const REPO: RepoListRow = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: false,
};

// Radix portals the dialog to `document.body`, outside the render helper's own container.
function dialog(repo: RepoListRow | null, onRemove = (_id: string) => Promise.resolve()) {
  const onOpenChange = vi.fn();
  const page = render(
    <RemoveRepoDialog repo={repo} onOpenChange={onOpenChange} onRemove={onRemove} />,
  );
  return { ...page, onOpenChange };
}

function button(label: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll("button")).find(
    (found) => found.textContent === label,
  ) as HTMLButtonElement;
}

async function clickRemove(): Promise<void> {
  await act(async () => {
    button("Remove").click();
  });
}

const BUSY = new ApiError("repo petal has a task that is still running", {
  code: "repo-busy",
  hint: "Run `agn stop task1` first.",
  status: 409,
});

describe("RemoveRepoDialog", () => {
  it("names the repo and its path, and says what goes and what stays", () => {
    const { unmount } = dialog(REPO);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Remove petal?");
    expect(text).toContain("agn deletes the task worktrees it made for this repo");
    expect(text).toContain("The folder at /Users/dev/petal is not touched.");
    expect(text).toContain("Its usage and outcome history is kept");
    expect(text).toContain("`agn add /Users/dev/petal` brings it back.");
    unmount();
  });

  it("draws nothing at all while no repo is being removed", () => {
    const { unmount } = dialog(null);
    expect(document.body.textContent).toBe("");
    unmount();
  });

  it("removes nothing when the click was Cancel", async () => {
    const onRemove = vi.fn(() => Promise.resolve());
    const { unmount } = dialog(REPO, onRemove);
    await act(async () => {
      button("Cancel").click();
    });
    expect(onRemove).not.toHaveBeenCalled();
    unmount();
  });

  it("removes the repo the dialog is about, then closes", async () => {
    const onRemove = vi.fn(() => Promise.resolve());
    const { onOpenChange, unmount } = dialog(REPO, onRemove);
    await clickRemove();
    expect(onRemove).toHaveBeenCalledWith("r1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
  });

  it("stays open with the daemon's refusal in it, and Remove ready to try again", async () => {
    const onRemove = vi.fn(() => Promise.reject(BUSY));
    const { onOpenChange, unmount } = dialog(REPO, onRemove);
    await clickRemove();
    const text = document.body.textContent ?? "";
    expect(text).toContain("repo petal has a task that is still running");
    expect(text).toContain("Run `agn stop task1` first.");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(button("Remove").disabled).toBe(false);
    unmount();
  });

  it("holds Remove flat while the daemon is still deleting", async () => {
    let settle: () => void = () => undefined;
    const onRemove = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    const { unmount } = dialog(REPO, onRemove);
    await clickRemove();
    expect(button("Remove").disabled).toBe(true);
    await act(async () => settle());
    unmount();
  });
});
