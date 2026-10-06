// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { changesResponse, MIXED_FILES, taskRow } from "../changes/changes-fixture";
import { render } from "../test/render";
import { REPO, stubClient } from "../test/workspace-fixture";
import { DeleteTaskDialog } from "./delete-task-dialog";

const TASK: TaskListRow = taskRow({ status: "stopped" });

const ACTIVE = new ApiError("task task1 is still running", {
  code: "task-active",
  hint: "Run `agn stop task1` first.",
  status: 409,
});

// Radix portals the dialog to `document.body`, outside the render helper's own container.
async function dialog(
  over: {
    task?: TaskListRow | null;
    onDelete?: (taskId: string) => Promise<void>;
    changes?: ReturnType<typeof stubClient>["changes"];
  } = {},
) {
  const onOpenChange = vi.fn();
  const client = stubClient(over.changes === undefined ? {} : { changes: over.changes });
  let page: ReturnType<typeof render> | null = null;
  await act(async () => {
    page = render(
      <DeleteTaskDialog
        task={over.task === undefined ? TASK : over.task}
        repo={REPO}
        client={client}
        onOpenChange={onOpenChange}
        onDelete={over.onDelete ?? (() => Promise.resolve())}
      />,
    );
  });
  return { ...(page as unknown as ReturnType<typeof render>), onOpenChange };
}

function button(label: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll("button")).find((found) =>
    found.textContent?.includes(label),
  ) as HTMLButtonElement;
}

async function clickDelete(): Promise<void> {
  await act(async () => {
    button("Delete").click();
  });
}

describe("DeleteTaskDialog", () => {
  it("draws nothing until a task is being deleted", async () => {
    const { unmount } = await dialog({ task: null });
    expect(document.querySelector("[data-slot='dialog-content']")).toBeNull();
    unmount();
  });

  it("names the task, what goes and what stays, with Cancel and Delete", async () => {
    const { unmount } = await dialog();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Delete Add the invite links?");
    expect(text).toContain("This removes the task's worktree and every agn record for it");
    expect(text).toContain("stays in petal");
    expect(text).toContain("The tokens this task used stay in the usage totals.");
    expect(button("Cancel")).toBeTruthy();
    expect(button("Delete")).toBeTruthy();
    unmount();
  });

  it("lists the uncommitted paths the removal would take with it", async () => {
    const { unmount } = await dialog({
      changes: () => Promise.resolve(changesResponse({ files: MIXED_FILES })),
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("3 uncommitted files in the worktree will be lost.");
    expect(text).toContain("src/invite.ts · docs/invites.md · +1");
    // The branch's own commits are not lost with the worktree, so they are not named.
    expect(text).not.toContain("src/links.ts");
    unmount();
  });

  it("says nothing about files when the read of them failed", async () => {
    const { unmount } = await dialog({ changes: () => Promise.reject(new Error("off")) });
    expect(document.body.textContent).not.toContain("will be lost");
    unmount();
  });

  it("names what it is doing while the daemon works, and refuses a second click", async () => {
    const { unmount } = await dialog({ onDelete: () => new Promise(() => undefined) });
    await clickDelete();
    expect(document.body.textContent).toContain("Removing the worktree…");
    expect(button("Cancel").disabled).toBe(true);
    expect(button("Delete").disabled).toBe(true);
    unmount();
  });

  it("says the rows alone are going for a task whose worktree has gone", async () => {
    const gone = taskRow({ status: "done", worktreePresent: false });
    const { unmount } = await dialog({ task: gone, onDelete: () => new Promise(() => undefined) });
    expect(document.body.textContent).toContain("This removes every agn record for the task");
    await clickDelete();
    expect(document.body.textContent).toContain("Deleting…");
    unmount();
  });

  it("keeps a refusal in the dialog, message and hint, and stays open", async () => {
    const { onOpenChange, unmount } = await dialog({ onDelete: () => Promise.reject(ACTIVE) });
    await clickDelete();
    const text = document.body.textContent ?? "";
    expect(text).toContain("task task1 is still running");
    expect(text).toContain("agn stop task1");
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();
  });

  it("closes once the daemon has removed it", async () => {
    const { onOpenChange, unmount } = await dialog();
    await clickDelete();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    unmount();
  });
});
