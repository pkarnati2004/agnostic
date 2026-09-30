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
    showCost: vi.fn(),
    addRepo: vi.fn(),
    sync: vi.fn(),
  };
}

function ids(ctx: Partial<PaletteContext>, on: PaletteHandlers = handlers()): string[] {
  const full = { query: "", activeTask: null, repo: REPO, ...ctx };
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

  it("drops Open and Bring up to date for a cleaned worktree, and keeps Create PR", () => {
    // The push reads the branch from the main checkout, so Create PR needs no worktree, and the
    // panel's own button is enabled here too.
    const rows = ids({ activeTask: taskRow({ status: "stopped", worktreePresent: false }) });
    expect(rows).toEqual(["new-task", "resume", "handoff", "pr", "cost", "add-repo", "sync"]);
  });

  it("offers nothing about the branch for a cleaned worktree with no branch either", () => {
    const rows = ids({
      activeTask: taskRow({ status: "stopped", worktreePresent: false, branch: null }),
    });
    expect(rows).toEqual(["new-task", "resume", "handoff", "cost", "add-repo", "sync"]);
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
      { query: "add invite links", activeTask: null, repo: REPO },
      handlers(),
    );
    expect(rows.map((row) => row.label)).toContain("Run: add invite links");
    expect(rows.map((row) => row.label)).toContain("Recommend: add invite links");
    expect(rows.filter((row) => row.fromQuery).map((row) => row.id)).toEqual(["run", "recommend"]);
  });

  it("gives every row the handler its button calls, with the task or the repo it is about", () => {
    const on = handlers();
    const task = taskRow({ id: "task9", status: "waiting" });
    const rows = paletteCommands({ query: "port it", activeTask: task, repo: REPO }, on);
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
    expect(on.showCost).toHaveBeenCalledTimes(1);
    expect(on.addRepo).toHaveBeenCalledTimes(1);
    expect(on.sync).toHaveBeenCalledWith("repo1");
    expect(on.resume).not.toHaveBeenCalled();
  });

  it("names the task in the label, which is what the filter reads", () => {
    const task = taskRow({ title: "Add the invite links", status: "running" });
    const labels = paletteCommands({ query: "", activeTask: task, repo: REPO }, handlers()).map(
      (row) => row.label,
    );
    expect(labels).toContain("Stop Add the invite links");
    expect(labels).toContain("Open Add the invite links in editor");
    expect(labels).toContain("Create PR for Add the invite links");
    expect(labels).toContain("Bring Add the invite links up to date");
    expect(labels).toContain("Sync petal");
  });
});
