import { type AskCommitResponse, agnosticPaths, DaemonApiError, type Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { commitCommand } from "./commit.js";

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
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

function response(over: Partial<AskCommitResponse> = {}): AskCommitResponse {
  return {
    task,
    via: "live",
    prompt: "Commit your work on `agn/flag`. Do not push.",
    ...over,
  };
}

function cli(over: Partial<AskCommitResponse> = {}, cwd = "/work/api") {
  const asked: string[] = [];
  const test = createTestContext({
    cwd,
    paths: PATHS,
    client: {
      commitTask: (id: string) => {
        asked.push(id);
        return Promise.resolve(response(over));
      },
    },
  });
  return { ...test, asked };
}

function cliFailing(fail: DaemonApiError, cwd = "/work/api") {
  const asked: string[] = [];
  const test = createTestContext({
    cwd,
    paths: PATHS,
    client: {
      commitTask: (id: string) => {
        asked.push(id);
        return Promise.reject(fail);
      },
    },
  });
  return { ...test, asked };
}

describe("agn commit", () => {
  it("says which profile was asked, and how, in one line", async () => {
    const test = cli();
    await commitCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out).toEqual(["asked claude-code:default:native to commit (live)"]);
    expect(test.asked).toEqual(["t3n9v2wxyz"]);
  });

  it("names the resume the daemon took when no session was live", async () => {
    const test = cli({ via: "fresh" });
    await commitCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.out).toEqual(["asked claude-code:default:native to commit (fresh)"]);
  });

  it("prints the response verbatim with --json, and never attaches", async () => {
    const test = cli();
    test.ctx.json = true;
    await commitCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual(response());
    expect(test.err).toEqual([]);
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli({}, "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz");
    await commitCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.asked).toEqual(["t3n9v2wxyz"]);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "commit"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("needs a task id");
    expect(test.asked).toEqual([]);
  });

  it("prints the daemon's error for a task id it does not know, and exits 1", async () => {
    const test = cliFailing(
      new DaemonApiError("no task with id q4m8n2vwxy", {
        code: "task-not-found",
        status: 404,
        hint: "Run `agn tasks` to see the tasks agn knows about.",
      }),
    );
    const code = await runMain(["node", "agn", "commit", "q4m8n2vwxy"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: no task with id q4m8n2vwxy",
      "  hint: Run `agn tasks` to see the tasks agn knows about.",
    ]);
    expect(test.out).toEqual([]);
  });
});
