import {
  agnosticPaths,
  type RepoListRow,
  type Task,
  type TaskListRow,
  type TaskStatus,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { statusCommand } from "./status.js";

const PATHS = agnosticPaths("/home/.agnostic");

const repos: RepoListRow[] = [
  {
    id: "r7k2m4pqrs",
    path: "/work/api",
    kind: "git",
    name: "api",
    addedAt: "2026-09-11T10:00:00.000Z",
    status: "active",
    testCommand: null,
    pathPresent: true,
  },
  {
    id: "r9x4t8bcde",
    path: "/work/legacy",
    kind: "git",
    name: "legacy",
    addedAt: "2026-09-11T10:00:00.000Z",
    status: "archived",
    testCommand: null,
    pathPresent: true,
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
    baseCommit: null,
    compareId: null,
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
      listRepos: (query) => {
        const visible =
          query?.all === true ? repos : repos.filter((row) => row.status === "active");
        return Promise.resolve({ repos: visible, cursor: 0 });
      },
      listAllTasks: () => Promise.resolve({ tasks: tasks.map(listedRow), cursor: 0 }),
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

  it("names the repo of a task in a closed repo", async () => {
    const test = cli([task("q4m8n2vwxy", "done", { repoId: "r9x4t8bcde" })]);
    await parse(test.ctx, []);
    expect(test.out[1]).toContain("q4m8n2vwxy  legacy  done");
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

  it("names the task a handoff came from", async () => {
    const test = cli([task("q4m8n2vwxy", "running", { parentTaskId: "t3n9v2wxyz" })]);
    await parse(test.ctx, ["q4m8n2vwxy"]);
    expect(test.out.join("\n")).toContain("parent:   t3n9v2wxyz");
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

/** The list route answers with rows, not bare tasks: the worktree of a seeded task is there. */
function listedRow(task: Task): TaskListRow {
  return { ...task, worktreePresent: task.worktreePath !== null };
}
