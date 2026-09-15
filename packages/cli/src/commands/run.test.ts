import { DaemonApiError, type RunTaskRequest, type Task } from "@agnostic/core";
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
  status: "active" as const,
  testCommand: null as string | null,
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
    baseCommit: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    session: {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: null,
      pid: null,
      cwd: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
      lastSeenAt: "2026-09-11T10:00:00.000Z",
    },
    ...over,
  };
}

/** The daemon reads `.ag/agnostic.yaml`; the CLI only ever sees the command on the repo row. */
const REPO_WITH_TESTS = { ...REPO, testCommand: "pnpm test" };

function cli(over: Partial<Task> = {}, repo = REPO) {
  const sent: { repoId: string; body: RunTaskRequest }[] = [];
  const test = createTestContext({
    cwd: repo.path,
    client: {
      listRepos: () => Promise.resolve({ repos: [repo], cursor: 0 }),
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

  it("explains the wait when the repo runs its tests before the agent starts", async () => {
    const test = cli({}, REPO_WITH_TESTS);
    await parse(runCommand(test.ctx), ["add a --verbose flag", "--repo", REPO.id]);
    expect(test.out[0]).toBe("running the tests first: pnpm test");
  });

  it("skips that run, and says so to the daemon, with --skip-tests", async () => {
    const test = cli({}, REPO_WITH_TESTS);
    await parse(runCommand(test.ctx), ["add a --verbose flag", "--skip-tests", "--repo", REPO.id]);
    expect(test.out[0]).toBe("started t3n9v2wxyz add a --verbose flag");
    expect(test.sent[0]?.body.skipTests).toBe(true);
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

  it("passes --intent through, and refuses one agn does not know", async () => {
    const test = cli();
    await parse(runCommand(test.ctx), ["why is the login flow slow", "--intent", "debug"]);
    expect(test.sent[0]?.body.intent).toBe("debug");
    const command = runCommand(test.ctx)
      .exitOverride()
      .configureOutput({ writeErr: () => undefined });
    await expect(parse(command, ["ship it", "--intent", "vibes"])).rejects.toThrow(
      /--intent must be one of/,
    );
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

  it("renders the daemon's refusal for a closed repo, and exits 1", async () => {
    const test = createTestContext({
      cwd: REPO.path,
      client: {
        listRepos: () => Promise.resolve({ repos: [REPO], cursor: 0 }),
        runTask: () =>
          Promise.reject(
            new DaemonApiError("repo api is closed", {
              code: "repo-closed",
              status: 409,
              hint: "Run `agn repo open r7k2m4pqrs` first.",
            }),
          ),
      },
    });
    const code = await runMain(["node", "agn", "run", "add a --verbose flag"], test.ctx);
    expect(code).toBe(1);
    expect(test.err).toEqual([
      "agn: repo api is closed",
      "  hint: Run `agn repo open r7k2m4pqrs` first.",
    ]);
    expect(test.out).toEqual([]);
  });

  it("prints the daemon's body with --json", async () => {
    const test = cli();
    test.ctx.json = true;
    await parse(runCommand(test.ctx), ["ship it"]);
    expect(JSON.parse(test.out.join("\n"))).toEqual({ task: task() });
  });
});
