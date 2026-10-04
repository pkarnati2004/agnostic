// @vitest-environment happy-dom
import type { CleanTaskRequest, Task, TaskListRow } from "@agnostic/core";
import { createElement, act as reactAct } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { changesResponse, taskRow } from "../changes/changes-fixture";
import type { ActionScope, Workspace } from "../store/use-workspace";
import { render } from "../test/render";
import { stubClient } from "../test/workspace-fixture";
import { type ArchiveDelete, useArchiveDelete } from "./use-archive-delete";

const TASK: TaskListRow = taskRow({ status: "stopped" });

function refused(code: string, message: string): ApiError {
  return new ApiError(message, { code, status: 409 });
}

const UNSAVED = refused(
  "worktree-unsaved",
  "the worktree for task task1 was not removed: it has uncommitted changes",
);

const HANDOFF_FAILED: ActionScope = { taskId: "task1", action: "handoff", host: "dialog" };

/**
 * The hook with the page's own `act` around it: a failure is recorded as the task's notice, a
 * success clears whatever that task's last failure was, and the row it answered with reaches the
 * store. The real `useWorkspace` does all three, and the archive depends on each of them.
 */
function harness(client: WorkspaceClient) {
  const notices = new Map<string, ActionScope>();
  const recorded: ActionScope[] = [];
  const stored: Task[] = [];
  const resume = vi.fn(() => Promise.resolve());
  const workspaceAct: Workspace["act"] = async (scope, run) => {
    try {
      const task = await run(client);
      if (task !== undefined) {
        stored.push(task);
      }
      notices.delete(scope.taskId);
      return task;
    } catch {
      notices.set(scope.taskId, scope);
      recorded.push(scope);
      return undefined;
    }
  };
  const seen: { api: ArchiveDelete | null } = { api: null };
  const Probe = () => {
    seen.api = useArchiveDelete({ task1: TASK }, client, workspaceAct, resume);
    return null;
  };
  const page = render(createElement(Probe));
  const api = (): ArchiveDelete => {
    if (seen.api === null) {
      throw new Error("the hook never ran");
    }
    return seen.api;
  };
  return { ...page, notices, recorded, stored, resume, api };
}

/** Runs one of the hook's calls inside `act`, so what it set is on the next render. */
async function run<T>(call: () => Promise<T>): Promise<T> {
  let answer: T | undefined;
  await reactAct(async () => {
    answer = await call();
  });
  return answer as T;
}

afterEach(() => vi.useRealTimers());

describe("useArchiveDelete archive", () => {
  it("highlights the row, says so, and offers a resume", async () => {
    const page = harness(
      stubClient({ cleanTask: () => Promise.resolve({ task: TASK, removed: true }) }),
    );
    const outcome = await run(() => page.api().archive("task1"));
    expect(outcome).toEqual({ kind: "archived" });
    expect(page.api().justArchived).toBe("task1");
    expect(page.api().toast?.message).toBe("Add the invite links moved to History");
    page.api().toast?.action?.run();
    expect(page.resume).toHaveBeenCalledWith("task1", "header");
    expect(page.recorded).toEqual([]);
    page.unmount();
  });

  it("answers uncommitted work in place, with the count and no notice", async () => {
    const page = harness(
      stubClient({
        cleanTask: () => Promise.reject(UNSAVED),
        changes: () => Promise.resolve(changesResponse({ uncommitted: 3 })),
      }),
    );
    const outcome = await run(() => page.api().archive("task1"));
    expect(outcome).toEqual({
      kind: "unsaved",
      reason: "it has uncommitted changes",
      uncommitted: 3,
    });
    expect(page.api().warning?.taskId).toBe("task1");
    expect(page.api().warning?.warning.title).toBe("3 files are not committed. Archive anyway?");
    expect(page.recorded).toEqual([]);
    expect(page.api().toast).toBeNull();
    page.unmount();
  });

  it("falls back to the daemon's reason when the Changes read fails", async () => {
    const page = harness(
      stubClient({
        cleanTask: () => Promise.reject(refused("worktree-unsaved", "no colon here")),
        changes: () => Promise.reject(refused("repo-not-git", "not a git repo")),
      }),
    );
    const outcome = await run(() => page.api().archive("task1"));
    expect(outcome).toEqual({ kind: "unsaved", reason: "no colon here", uncommitted: null });
    expect(page.api().warning?.warning.title).toBe("No colon here. Archive anyway?");
    page.unmount();
  });

  it("records every other refusal as the task's notice and says so in a toast", async () => {
    const page = harness(
      stubClient({
        cleanTask: () => Promise.reject(refused("task-active", "it is still running")),
      }),
    );
    const outcome = await run(() => page.api().archive("task1"));
    expect(outcome).toEqual({ kind: "failed" });
    expect(page.recorded).toEqual([{ taskId: "task1", action: "archive", host: "header" }]);
    expect(page.api().toast).toEqual({
      message: "Archive failed for Add the invite links: it is still running",
      tone: "error",
      action: null,
    });
    page.unmount();
  });

  it("asks again with force behind Archive anyway", async () => {
    const bodies: CleanTaskRequest[] = [];
    const page = harness(
      stubClient({
        cleanTask: (_id, body) => {
          bodies.push(body);
          return Promise.resolve({ task: TASK, removed: true });
        },
      }),
    );
    await run(() => page.api().archiveAnyway("task1"));
    expect(bodies).toEqual([{ force: true }]);
    expect(page.api().warning).toBeNull();
    page.unmount();
  });

  it("leaves an older failure on the task where it is when the archive is answered in place", async () => {
    const page = harness(
      stubClient({
        cleanTask: () => Promise.reject(UNSAVED),
        changes: () => Promise.resolve(changesResponse({ uncommitted: 3 })),
      }),
    );
    page.notices.set("task1", HANDOFF_FAILED);
    await run(() => page.api().archive("task1"));
    // The refusal never reaches `act`, so it neither records a notice nor clears the one there.
    expect(page.notices.get("task1")).toEqual(HANDOFF_FAILED);
    expect(page.stored).toEqual([]);
    page.unmount();
  });

  it("clears the task's last failure and stores the row once the archive goes through", async () => {
    const page = harness(
      stubClient({ cleanTask: () => Promise.resolve({ task: TASK, removed: true }) }),
    );
    page.notices.set("task1", HANDOFF_FAILED);
    await run(() => page.api().archive("task1"));
    expect(page.notices.has("task1")).toBe(false);
    expect(page.stored).toEqual([TASK]);
    page.unmount();
  });

  it("un-highlights the row once the ten seconds are up", async () => {
    vi.useFakeTimers();
    const page = harness(
      stubClient({ cleanTask: () => Promise.resolve({ task: TASK, removed: true }) }),
    );
    await run(() => page.api().archive("task1"));
    expect(page.api().justArchived).toBe("task1");
    reactAct(() => vi.advanceTimersByTime(10_000));
    expect(page.api().justArchived).toBeNull();
    page.unmount();
  });
});

describe("useArchiveDelete delete", () => {
  it("holds the task the dialog is about until it is closed", () => {
    const page = harness(stubClient());
    expect(page.api().deleting).toBeNull();
    reactAct(() => page.api().requestDelete("task1"));
    expect(page.api().deleting).toEqual(TASK);
    reactAct(() => page.api().closeDelete());
    expect(page.api().deleting).toBeNull();
    page.unmount();
  });

  it("rejects with the refusal, which is what the dialog shows", async () => {
    const page = harness(
      stubClient({
        deleteTask: () => Promise.reject(refused("task-active", "it is still running")),
      }),
    );
    await expect(run(() => page.api().deleteTask("task1"))).rejects.toThrow("it is still running");
    expect(page.recorded).toEqual([{ taskId: "task1", action: "delete", host: "dialog" }]);
    page.unmount();
  });

  it("resolves with nothing when the daemon removed it", async () => {
    const page = harness(
      stubClient({
        deleteTask: () =>
          Promise.resolve({
            deleted: true as const,
            taskId: "task1",
            branch: "agn/invite-links-a1b2",
            removedWorktree: true,
          }),
      }),
    );
    await expect(run(() => page.api().deleteTask("task1"))).resolves.toBeUndefined();
    expect(page.recorded).toEqual([]);
    page.unmount();
  });
});
