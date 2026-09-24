import { agnosticPaths, type Task, type UpdateTaskResponse } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { updateCommand } from "./update.js";

const PATHS = agnosticPaths("/home/.agnostic");

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "p",
  profileId: "claude-code:default:native",
  worktreePath: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/flag",
  status: "running",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

function response(over: Partial<UpdateTaskResponse> = {}): UpdateTaskResponse {
  return {
    task,
    mode: "rebase",
    via: "live",
    base: "main",
    prompt:
      "Fetch `main`. Bring `agn/flag` up to date with it by rebasing onto it " +
      "(this branch was never pushed). Resolve conflicts. Keep the tests green. Do not push.",
    ...over,
  };
}

function cli(over: Partial<UpdateTaskResponse> = {}, cwd = "/work/api") {
  const asked: string[] = [];
  const test = createTestContext({
    cwd,
    paths: PATHS,
    client: {
      updateTask: (id: string) => {
        asked.push(id);
        return Promise.resolve(response(over));
      },
    },
  });
  return { ...test, asked };
}

describe("agn update", () => {
  it("says the prompt was sent to the live session", async () => {
    const test = cli();
    await updateCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out).toEqual([
      "sent to the live session",
      "mode: rebase (never pushed)",
      "base: main",
      "attach: agn attach t3n9v2wxyz",
    ]);
    expect(test.asked).toEqual(["t3n9v2wxyz"]);
  });

  it("says the session was resumed, and names the mode merge once the branch was pushed", async () => {
    const test = cli({ via: "fresh", mode: "merge" });
    await updateCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out).toEqual([
      "resumed (fresh) with the prompt",
      "mode: merge (pushed)",
      "base: main",
      "attach: agn attach t3n9v2wxyz",
    ]);
  });

  it("says native the same way, when the harness held the session", async () => {
    const test = cli({ via: "native" });
    await updateCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out[0]).toBe("resumed (native) with the prompt");
  });

  it("prints the response verbatim with --json, and never attaches", async () => {
    const test = cli();
    test.ctx.json = true;
    await updateCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual(response());
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli({}, "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz");
    await updateCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.asked).toEqual(["t3n9v2wxyz"]);
  });

  it("never hands the terminal over: no spawn is injected, and none is needed", async () => {
    // createTestContext's default spawn throws if a command calls it; reaching the assertions
    // below means agn update asked nothing of it, unlike resume.
    const test = cli();
    await updateCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out).toContain("attach: agn attach t3n9v2wxyz");
    expect(test.err).toEqual([]);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "update"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("needs a task id");
    expect(test.asked).toEqual([]);
  });
});
