import {
  agnosticPaths,
  type ProcessOptions,
  type ResumeTaskResponse,
  type spawn,
  type Task,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { resumeCommand } from "./resume.js";

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
};

function cli(via: ResumeTaskResponse["via"]) {
  const spawned: { command: string; opts: ProcessOptions }[] = [];
  const fakeSpawn = ((command: string, _args: string[] = [], opts: ProcessOptions = {}) => {
    spawned.push({ command, opts });
    return Promise.resolve({ exitCode: 0 }) as unknown as ReturnType<typeof spawn>;
  }) as typeof spawn;
  const test = createTestContext({
    cwd: "/work/api",
    paths: PATHS,
    spawn: fakeSpawn,
    client: {
      resumeTask: () => Promise.resolve({ task, via, attach: { kind: "tmux", argv: ARGV } }),
    },
  });
  return { ...test, spawned };
}

describe("agn resume", () => {
  it("says history was not recoverable only when the harness started fresh", async () => {
    const fresh = cli("fresh");
    await resumeCommand(fresh.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(fresh.err).toEqual([
      "agn: history was not recoverable; started claude-code fresh with the task context",
    ]);
    expect(fresh.spawned).toHaveLength(1);

    for (const via of ["live", "native"] as const) {
      const quiet = cli(via);
      await resumeCommand(quiet.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
      expect(quiet.err).toEqual([]);
      expect(quiet.spawned).toHaveLength(1);
    }
  });

  it("hands the terminal to tmux the way attach does", async () => {
    const test = cli("live");
    await resumeCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(test.spawned[0]?.command).toBe("tmux");
    expect(test.spawned[0]?.opts.stdio).toBe("inherit");
  });

  it("prints the response body verbatim with --json, and spawns nothing", async () => {
    const test = cli("fresh");
    test.ctx.json = true;
    await resumeCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" });
    expect(JSON.parse(test.out.join("\n")).via).toBe("fresh");
    expect(test.err).toEqual([]);
    expect(test.spawned).toEqual([]);
  });

  it("takes the task from the worktree it is run in", async () => {
    const test = cli("live");
    test.ctx.cwd = "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz";
    await resumeCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.spawned).toHaveLength(1);
  });
});
