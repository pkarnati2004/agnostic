import type { RepoListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { type PaletteContext, type PaletteHandlers, paletteCommands } from "./palette-commands";

const REPO: RepoListRow = {
  id: "repo1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

function handlers(): PaletteHandlers {
  return {
    newTask: vi.fn(),
    recommend: vi.fn(),
    stop: vi.fn(),
    resume: vi.fn(),
    handoff: vi.fn(),
    openInEditor: vi.fn(),
    createPr: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
    showCost: vi.fn(),
    addRepo: vi.fn(),
    sync: vi.fn(),
  };
}

function ids(ctx: Partial<PaletteContext>, on: PaletteHandlers = handlers()): string[] {
  const full = { query: "", activeTask: null, repo: REPO, uncommitted: null, ...ctx };
  return paletteCommands(full, on).map((command) => command.id);
}

describe("paletteCommands", () => {
  it("offers the page's own commands when no task is in front", () => {
    expect(ids({})).toEqual(["new-task", "cost", "add-repo", "sync"]);
  });

  it("drops Sync when the page knows of no repo", () => {
    expect(ids({ repo: null })).toEqual(["new-task", "cost", "add-repo"]);
  });

  it("offers Stop and not Resume for a running task", () => {
    expect(ids({ activeTask: taskRow({ status: "running" }) })).toEqual([
      "new-task",
      "stop",
      "handoff",
      "open",
      "pr",
      "update",
      "cost",
      "add-repo",
      "sync",
    ]);
  });

  it("offers Resume and not Stop for a task that has finished", () => {
    expect(ids({ activeTask: taskRow({ status: "done" }) })).toEqual([
      "new-task",
      "resume",
      "handoff",
      "open",
      "pr",
      "update",
      "cost",
      "add-repo",
      "sync",
    ]);
  });

  it("drops Hand off, Open and Bring up to date for a cleaned worktree, and keeps Create PR", () => {
    // The push reads the branch from the main checkout, so Create PR needs no worktree, and the
    // panel's own button is enabled here too. A resume rebuilds the worktree and the rest return.
    const rows = ids({ activeTask: taskRow({ status: "stopped", worktreePresent: false }) });
    expect(rows).toEqual(["new-task", "resume", "pr", "cost", "add-repo", "sync"]);
  });

  it("offers nothing about the branch for a cleaned worktree with no branch either", () => {
    const rows = ids({
      activeTask: taskRow({ status: "stopped", worktreePresent: false, branch: null }),
    });
    expect(rows).toEqual(["new-task", "resume", "cost", "add-repo", "sync"]);
  });

  it("keeps Hand off for a folder task and for an adopted one, which had no worktree", () => {
    const folder = taskRow({ worktreePath: null, worktreePresent: false, branch: null });
    expect(ids({ activeTask: folder })).toEqual([
      "new-task",
      "stop",
      "handoff",
      "cost",
      "add-repo",
      "sync",
    ]);
    const adopted = taskRow({ worktreePath: null, worktreePresent: false });
    expect(ids({ activeTask: adopted })).toContain("handoff");
  });

  it("offers the commit row once the panel has read uncommitted work, live or resumable", () => {
    const running = { activeTask: taskRow({ status: "running" }), uncommitted: 2 };
    expect(ids(running)).toContain("commit");
    expect(ids({ activeTask: taskRow({ status: "stopped" }), uncommitted: 2 })).toContain("commit");
  });

  it("leaves the commit row out with nothing to commit, and before the panel has read the task", () => {
    expect(ids({ activeTask: taskRow({ status: "running" }), uncommitted: 0 })).not.toContain(
      "commit",
    );
    expect(ids({ activeTask: taskRow({ status: "running" }) })).not.toContain("commit");
  });

  it("leaves the commit row out for a folder task and for an adopted one", () => {
    const folder = taskRow({ worktreePath: null, worktreePresent: false, branch: null });
    expect(ids({ activeTask: folder, uncommitted: 2 })).not.toContain("commit");
    const adopted = taskRow({ worktreePath: null, worktreePresent: false });
    expect(ids({ activeTask: adopted, uncommitted: 2 })).not.toContain("commit");
  });

  it("offers neither Create PR nor Bring up to date for a task with no branch", () => {
    const rows = ids({ activeTask: taskRow({ branch: null }) });
    expect(rows).not.toContain("pr");
    expect(rows).not.toContain("update");
    expect(rows).toContain("open");
  });

  it("builds Run and Recommend only once there is something to run", () => {
    expect(ids({ query: "   " })).not.toContain("run");
    expect(ids({ query: "add invite links", repo: null })).not.toContain("run");
    const rows = paletteCommands(
      { query: "add invite links", activeTask: null, repo: REPO, uncommitted: null },
      handlers(),
    );
    expect(rows.map((row) => row.label)).toContain("Run: add invite links");
    expect(rows.map((row) => row.label)).toContain("Recommend: add invite links");
    expect(rows.filter((row) => row.fromQuery).map((row) => row.id)).toEqual(["run", "recommend"]);
  });

  it("gives every row the handler its button calls, with the task or the repo it is about", () => {
    const on = handlers();
    const task = taskRow({ id: "task9", status: "waiting" });
    const rows = paletteCommands(
      { query: "port it", activeTask: task, repo: REPO, uncommitted: 2 },
      on,
    );
    for (const row of rows) {
      row.run();
    }
    expect(on.newTask).toHaveBeenCalledWith(null);
    expect(on.newTask).toHaveBeenCalledWith({ prompt: "port it" });
    expect(on.recommend).toHaveBeenCalledWith("repo1", "port it");
    expect(on.stop).toHaveBeenCalledWith("task9");
    expect(on.handoff).toHaveBeenCalledWith("task9");
    expect(on.openInEditor).toHaveBeenCalledWith("task9");
    expect(on.createPr).toHaveBeenCalledWith("task9");
    expect(on.update).toHaveBeenCalledWith("task9");
    expect(on.commit).toHaveBeenCalledWith("task9");
    expect(on.showCost).toHaveBeenCalledTimes(1);
    expect(on.addRepo).toHaveBeenCalledTimes(1);
    expect(on.sync).toHaveBeenCalledWith("repo1");
    expect(on.resume).not.toHaveBeenCalled();
  });

  it("puts every row in a group, with the icon its own button carries", () => {
    const task = taskRow({ title: "Add the invite links", status: "running" });
    const rows = paletteCommands(
      { query: "port the parser", activeTask: task, repo: REPO, uncommitted: 2 },
      handlers(),
    );
    expect(rows.every((row) => row.icon !== null)).toBe(true);
    expect(rows.every((row) => row.profileId === null)).toBe(true);
    const groups = new Map(rows.map((row) => [row.id, row.group]));
    expect(groups.get("new-task")).toBe("query");
    expect(groups.get("run")).toBe("query");
    expect(groups.get("recommend")).toBe("query");
    expect(groups.get("stop")).toBe("task");
    expect(groups.get("pr")).toBe("task");
    expect(groups.get("cost")).toBe("commands");
    expect(groups.get("sync")).toBe("commands");
  });

  it("names the task in the label, which is what the filter reads", () => {
    const task = taskRow({ title: "Add the invite links", status: "running" });
    const labels = paletteCommands(
      { query: "", activeTask: task, repo: REPO, uncommitted: 2 },
      handlers(),
    ).map((row) => row.label);
    expect(labels).toContain("Stop Add the invite links");
    expect(labels).toContain("Open Add the invite links in editor");
    expect(labels).toContain("Create PR for Add the invite links");
    expect(labels).toContain("Bring Add the invite links up to date");
    expect(labels).toContain("Ask Add the invite links to commit");
    expect(labels).toContain("Sync petal");
  });
});
