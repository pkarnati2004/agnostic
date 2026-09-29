import { agnosticPaths, type ProcessOptions, type spawn, type Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { attachCommand } from "./attach.js";

const PATHS = agnosticPaths("/home/.agnostic");
const ARGV = ["tmux", "-u", "-L", "agn", "attach-session", "-t", "agn-t3n9v2wxyz"];

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

type Spawned = { command: string; args: string[]; opts: ProcessOptions };

/** `exit` is what the fake tmux does: a code it resolves with, or a rejection like execa's. */
function cli(exit: number | { rejects: unknown } = 0, cwd = "/work/api") {
  const spawned: Spawned[] = [];
  const fakeSpawn = ((command: string, args: string[] = [], opts: ProcessOptions = {}) => {
    spawned.push({ command, args, opts });
    const answer =
      typeof exit === "number" ? Promise.resolve({ exitCode: exit }) : Promise.reject(exit.rejects);
    return answer as unknown as ReturnType<typeof spawn>;
  }) as typeof spawn;
  const test = createTestContext({
    cwd,
    paths: PATHS,
    env: { PATH: "/usr/bin", TMUX: "/tmp/tmux-501/default,1,0", TMUX_PANE: "%3" },
    spawn: fakeSpawn,
    client: { attachInfo: () => Promise.resolve({ task, attach: { kind: "tmux", argv: ARGV } }) },
  });
  return { ...test, spawned };
}

describe("agn attach", () => {
  it("hands the terminal to tmux without agn's own TMUX variables", async () => {
    const test = cli();
    await attachCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.spawned).toHaveLength(1);
    expect(test.spawned[0]?.command).toBe("tmux");
    expect(test.spawned[0]?.args).toEqual(ARGV.slice(1));
    expect(test.spawned[0]?.opts.stdio).toBe("inherit");
    expect(test.spawned[0]?.opts.inheritEnv).toBe(false);
    expect(test.spawned[0]?.opts.env).toEqual({ PATH: "/usr/bin" });
  });

  it("exits with tmux's own code", async () => {
    const test = cli(130);
    await attachCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.ctx.exitCode).toBe(130);
  });

  it("prints the response body verbatim with --json, and spawns nothing", async () => {
    const test = cli();
    test.ctx.json = true;
    await attachCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n"))).toEqual({ task, attach: { kind: "tmux", argv: ARGV } });
    expect(test.spawned).toEqual([]);
  });

  it("exits with tmux's code when tmux fails, and says nothing of its own", async () => {
    // core's spawn is execa without `reject: false`, so a non-zero exit arrives as a rejection.
    for (const exitCode of [1, 130]) {
      const test = cli({ rejects: { exitCode } });
      await attachCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
      expect(test.ctx.exitCode).toBe(exitCode);
      expect(test.err).toEqual([]);
    }
  });

  it("exits 1 when the failure carries no code of its own", async () => {
    const test = cli({ rejects: new Error("spawn tmux ENOENT") });
    await attachCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.ctx.exitCode).toBe(1);
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli(0, "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz");
    await attachCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.spawned).toHaveLength(1);
  });

  it("is a usage error with no task and no worktree", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "attach"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("needs a task id");
    expect(test.spawned).toEqual([]);
  });
});
