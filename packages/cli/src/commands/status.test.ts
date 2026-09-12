import { agnosticPaths, type Repo, type Task, type TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { statusCommand } from "./status.js";

const PATHS = agnosticPaths("/home/.agnostic");

const repos: Repo[] = [
  {
    id: "r7k2m4pqrs",
    path: "/work/api",
    kind: "git",
    name: "api",
    addedAt: "2026-09-11T10:00:00.000Z",
  },
];

function task(id: string, status: TaskStatus, over: Partial<Task> = {}): Task {
  return {
    id,
    repoId: repos[0]?.id ?? "",
    title: "add a --verbose flag",
    prompt: "p",
    profileId: "claude-code:default:native",
    worktreePath: `/home/.agnostic/worktrees/r7k2m4pqrs/${id}`,
    branch: `agn/flag-${id}`,
    status,
    origin: "agn",
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    ...over,
  };
}

function cli(tasks: Task[], cwd = "/work/api") {
  return createTestContext({
    cwd,
    paths: PATHS,
    client: {
      listRepos: () => Promise.resolve({ repos }),
      listAllTasks: () => Promise.resolve({ tasks }),
      getTask: (id) =>
        Promise.resolve({ task: tasks.find((row) => row.id === id) ?? task(id, "done") }),
    },
  });
}

function parse(ctx: ReturnType<typeof cli>["ctx"], args: string[]): Promise<unknown> {
  return statusCommand(ctx).parseAsync(args, { from: "user" });
}

describe("agn status", () => {
  it("lists every task as a table", async () => {
    const test = cli([task("t3n9v2wxyz", "running"), task("q4m8n2vwxy", "done")]);
    await parse(test.ctx, []);
    expect(test.out[0]).toBe(
      "id          repo  status   title                 branch               profile",
    );
    expect(test.out[1]).toContain("t3n9v2wxyz  api   running");
  });

  it("says how to start one when there are none", async () => {
    const test = cli([]);
    await parse(test.ctx, []);
    expect(test.out).toEqual(['no tasks yet; run agn run "<prompt>"']);
  });

  it("shows the task of the worktree it is run from", async () => {
    const test = cli(
      [task("t3n9v2wxyz", "running")],
      "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    );
    await parse(test.ctx, []);
    expect(test.out[0]).toBe("id:       t3n9v2wxyz");
    expect(test.out.join("\n")).toContain("status:   running");
  });

  it("lists everything from inside a worktree with --all", async () => {
    const test = cli(
      [task("t3n9v2wxyz", "running")],
      "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    );
    await parse(test.ctx, ["--all"]);
    expect(test.out[0]).toContain("status");
    expect(test.out).toHaveLength(2);
  });

  it("shows a named task with its session", async () => {
    const test = cli([
      task("t3n9v2wxyz", "running", {
        session: {
          harness: "codex",
          sessionId: null,
          tmuxSession: "agn-t3n9v2wxyz",
          tmuxSocket: "agn",
          launchId: null,
          pid: null,
          cwd: "/work/api",
          lastSeenAt: "2026-09-11T10:00:00.000Z",
        },
      }),
    ]);
    await parse(test.ctx, ["t3n9v2wxyz"]);
    const printed = test.out.join("\n");
    expect(printed).toContain("harness:  codex");
    expect(printed).toContain("tmux:     agn-t3n9v2wxyz");
    expect(printed).toContain("cwd:      /work/api");
    expect(printed).toContain("origin:   agn");
  });
});
