import type { CleanTaskRequest, Task, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { cleanCommand } from "./clean.js";

function task(id: string, status: TaskStatus, worktreePath: string | null): Task {
  return {
    id,
    repoId: "r7k2m4pqrs",
    title: "add a --verbose flag",
    prompt: "p",
    profileId: "claude-code:default:native",
    worktreePath,
    branch: "agn/flag",
    status,
    origin: "agn",
    baseCommit: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
  };
}

function cli(tasks: Task[]) {
  const asked: { id: string; body: CleanTaskRequest }[] = [];
  const test = createTestContext({
    client: {
      listAllTasks: () => Promise.resolve({ tasks, cursor: 0 }),
      cleanTask: (id, body) => {
        asked.push({ id, body });
        const found = tasks.find((row) => row.id === id) ?? task(id, "done", null);
        return Promise.resolve({ task: found, removed: found.worktreePath !== null });
      },
    },
  });
  return { ...test, asked };
}

describe("agn clean", () => {
  it("cleans every closed task when given none", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "stopped", null)]);
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.asked.map((call) => call.id)).toEqual(["t3n9v2wxyz", "q4m8n2vwxy"]);
    expect(test.out).toEqual(["cleaned t3n9v2wxyz /w/one", "nothing to clean for q4m8n2vwxy"]);
  });

  it("says so when there is nothing to clean", async () => {
    const test = cli([]);
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.out).toEqual(["nothing to clean"]);
  });

  it("passes --delete-branch through for the tasks it was given", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one")]);
    await cleanCommand(test.ctx).parseAsync(["t3n9v2wxyz", "--delete-branch"], { from: "user" });
    expect(test.asked).toEqual([{ id: "t3n9v2wxyz", body: { deleteBranch: true } }]);
  });

  it("prints an array of the daemon's responses with --json", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "stopped", null)]);
    test.ctx.json = true;
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    const printed = JSON.parse(test.out.join("\n"));
    expect(Array.isArray(printed)).toBe(true);
    expect(printed).toHaveLength(2);
    expect(printed[0]).toMatchObject({ task: { id: "t3n9v2wxyz" }, removed: true });
    expect(printed[1]).toMatchObject({ task: { id: "q4m8n2vwxy" }, removed: false });
  });
});
