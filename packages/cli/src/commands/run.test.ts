import type { RunTaskRequest, Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { runCommand } from "./run.js";

const REPO = {
  id: "r7k2m4pqrs",
  path: "/work/api",
  kind: "git" as const,
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
};

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t3n9v2wxyz",
    repoId: REPO.id,
    title: "add a --verbose flag",
    prompt: "add a --verbose flag",
    profileId: "claude-code:default:native",
    worktreePath: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    branch: "agn/add-a-verbose-flag-t3n9v2wxyz",
    status: "running",
    origin: "agn",
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    session: {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      cwd: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
      lastSeenAt: "2026-09-11T10:00:00.000Z",
    },
    ...over,
  };
}

function cli(over: Partial<Task> = {}) {
  const sent: { repoId: string; body: RunTaskRequest }[] = [];
  const test = createTestContext({
    cwd: REPO.path,
    client: {
      listRepos: () => Promise.resolve({ repos: [REPO] }),
      runTask: (repoId, body) => {
        sent.push({ repoId, body });
        return Promise.resolve({ task: task(over) });
      },
    },
  });
  return { ...test, sent };
}

function parse(command: ReturnType<typeof runCommand>, args: string[]): Promise<unknown> {
  return command.parseAsync(args, { from: "user" });
}

describe("agn run", () => {
  it("sends the prompt and prints where the work is happening", async () => {
    const test = cli();
    await parse(runCommand(test.ctx), ["add a --verbose flag"]);
    expect(test.sent).toEqual([{ repoId: REPO.id, body: { prompt: "add a --verbose flag" } }]);
    expect(test.out).toEqual([
      "started t3n9v2wxyz add a --verbose flag",
      "worktree: /home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
      "branch:   agn/add-a-verbose-flag-t3n9v2wxyz",
      "attach:   agn attach t3n9v2wxyz",
    ]);
  });

  it("says where a folder task runs instead of naming a branch", async () => {
    const test = cli({ worktreePath: null, branch: null });
    await parse(runCommand(test.ctx), ["do it here"]);
    expect(test.out[1]).toBe("in place: /home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz");
  });

  it("carries every flag into the request body", async () => {
    const test = cli();
    await parse(runCommand(test.ctx), [
      "ship it",
      "--harness",
      "other:aider",
      "--model",
      "haiku",
      "--title",
      "ship it",
      "--base",
      "main",
      "--repo",
      "r7k",
    ]);
    expect(test.sent[0]).toEqual({
      repoId: "r7k",
      body: {
        prompt: "ship it",
        title: "ship it",
        profile: "other:aider",
        model: "haiku",
        base: "main",
      },
    });
  });

  it("refuses --profile and --harness together", async () => {
    const test = cli();
    const code = await runMain(
      ["node", "agn", "run", "x", "--profile", "codex", "--harness", "other:aider"],
      test.ctx,
    );
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("not both");
  });

  it("prints the daemon's body with --json", async () => {
    const test = cli();
    test.ctx.json = true;
    await parse(runCommand(test.ctx), ["ship it"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual({ task: task() });
  });
});
