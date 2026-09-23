import {
  agnosticPaths,
  type EditorId,
  type OpenTaskResponse,
  ProcessError,
  type ProcessOptions,
  type spawn,
  type Task,
} from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { openCommand } from "./open.js";

const PATHS = agnosticPaths("/home/.agnostic");
const DIR = "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz";
const ARGV = ["open", "-a", "/Applications/Cursor.app", DIR];

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "p",
  profileId: "claude-code:default:native",
  worktreePath: DIR,
  branch: "agn/flag",
  baseCommit: null,
  compareId: null,
  status: "running",
  origin: "agn",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

const response: OpenTaskResponse = {
  task,
  editor: { id: "cursor", name: "Cursor", via: "app", path: "/Applications/Cursor.app" },
  dir: DIR,
  argv: ARGV,
};

type Spawned = { command: string; args: string[]; opts: ProcessOptions };

/** `exit` is what the fake editor does: exit at once, fail at once, or keep running. */
function cli(exit: "now" | "never" | { rejects: unknown } = "now", cwd = "/work/api") {
  const spawned: Spawned[] = [];
  const asked: (EditorId | undefined)[] = [];
  let unrefs = 0;
  let started: (() => void) | undefined;
  const firstSpawn = new Promise<void>((resolve) => {
    started = resolve;
  });
  const fakeSpawn = ((command: string, args: string[] = [], opts: ProcessOptions = {}) => {
    spawned.push({ command, args, opts });
    const settled =
      exit === "now"
        ? Promise.resolve({ exitCode: 0 })
        : exit === "never"
          ? new Promise(() => undefined)
          : Promise.reject(exit.rejects);
    started?.();
    return Object.assign(settled, {
      unref: () => {
        unrefs += 1;
      },
    }) as unknown as ReturnType<typeof spawn>;
  }) as typeof spawn;
  const test = createTestContext({
    cwd,
    paths: PATHS,
    env: { PATH: "/usr/bin", TERM_PROGRAM: "iTerm.app" },
    spawn: fakeSpawn,
    client: {
      openInfo: (_id: string, editor?: EditorId) => {
        asked.push(editor);
        return Promise.resolve(response);
      },
    },
  });
  return { ...test, spawned, asked, firstSpawn, unrefs: () => unrefs };
}

describe("agn open", () => {
  it("runs the daemon's argv detached, in agn's own environment", async () => {
    const test = cli();
    await openCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.spawned).toHaveLength(1);
    expect(test.spawned[0]?.command).toBe("open");
    expect(test.spawned[0]?.args).toEqual(ARGV.slice(1));
    expect(test.spawned[0]?.opts.detached).toBe(true);
    expect(test.spawned[0]?.opts.inheritEnv).toBe(false);
    expect(test.spawned[0]?.opts.env).toEqual({ PATH: "/usr/bin", TERM_PROGRAM: "iTerm.app" });
    expect(test.spawned[0]?.opts.logFile).toBe("/home/.agnostic/logs/tasks/t3n9v2wxyz.log");
    expect(test.out).toEqual([`opened ${DIR} in Cursor`]);
  });

  it("prints the response body verbatim with --json, and spawns nothing", async () => {
    const test = cli();
    test.ctx.json = true;
    await openCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual(response);
    expect(test.spawned).toEqual([]);
  });

  it("sends the id for every spelling of an editor's name", async () => {
    const test = cli();
    for (const flag of ["code", "vscode", "cursor", "zed"]) {
      await openCommand(test.ctx).parseAsync(["t3n9v2wxyz", "--editor", flag], { from: "user" });
    }
    await openCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.asked).toEqual(["vscode", "vscode", "cursor", "zed", undefined]);
  });

  it("is a usage error when --editor names no editor agn knows", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "open", "t3n9v2wxyz", "--editor", "vim"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("vscode");
    expect(test.spawned).toEqual([]);
  });

  it("fails with the editor's own output when it dies inside the window", async () => {
    const test = cli({
      rejects: new ProcessError("open exited with code 2", {
        code: "process-failed",
        command: "open",
        args: ARGV.slice(1),
        exitCode: 2,
        stderr: "Unable to find application named 'Cursor'",
      }),
    });
    const code = await runMain(["node", "agn", "open", "t3n9v2wxyz"], test.ctx);
    expect(code).toBe(1);
    expect(test.err[0]).toContain("Unable to find application named 'Cursor'");
    expect(test.err.join("\n")).toContain("tasks/t3n9v2wxyz.log");
    expect(test.out).toEqual([]);
  });

  it("lets go of an editor that is still running when the window closes", async () => {
    vi.useFakeTimers();
    try {
      const test = cli("never");
      const run = runMain(["node", "agn", "open", "t3n9v2wxyz"], test.ctx);
      await test.firstSpawn;
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await run).toBe(0);
      expect(test.unrefs()).toBe(1);
      expect(test.out).toEqual([`opened ${DIR} in Cursor`]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli("now", DIR);
    await openCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.spawned).toHaveLength(1);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "open"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("needs a task id");
    expect(test.spawned).toEqual([]);
  });
});
