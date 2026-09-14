import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrepareInput, Repo, Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runSetupCommand } from "./setup-command.js";

const repo: Repo = { id: "r7k2m4pqrs", path: "/tmp", kind: "git", name: "x", addedAt: "" };
const task: Task = {
  id: "t3n9v2wxyz",
  repoId: repo.id,
  title: "Add a --verbose flag",
  prompt: "Add a --verbose flag to the CLI.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: null,
  branch: null,
  status: "queued",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

function input(overrides: Partial<PrepareInput> = {}): PrepareInput {
  return {
    task,
    repo,
    base: null,
    branchPrefix: null,
    setupCommand: null,
    logFile: null,
    ...overrides,
  };
}

async function tempCwd(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agn-setup-command-"));
}

describe("runSetupCommand", () => {
  it("does nothing when the repo has no setup_command", async () => {
    await expect(runSetupCommand(input(), await tempCwd())).resolves.toBeUndefined();
  });

  it("runs a command with a space-containing argument as the shell line it is", async () => {
    const cwd = await tempCwd();
    await runSetupCommand(
      input({ setupCommand: 'mkdir -p "sub dir" && echo hi > "sub dir/marker file.txt"' }),
      cwd,
    );
    expect(await readFile(join(cwd, "sub dir", "marker file.txt"), "utf8")).toBe("hi\n");
  });

  it("appends its output to the task log file, in the given cwd", async () => {
    const cwd = await tempCwd();
    const logFile = join(cwd, "task.log");
    await runSetupCommand(input({ setupCommand: "pwd && echo installed", logFile }), cwd);
    expect(await readFile(logFile, "utf8")).toContain(cwd);
    expect(await readFile(logFile, "utf8")).toContain("installed");
  });

  it("fails with setup-failed, carrying the last lines of the output", async () => {
    const cwd = await tempCwd();
    const logFile = join(cwd, "task.log");
    await expect(
      runSetupCommand(input({ setupCommand: "echo no lockfile here; exit 2", logFile }), cwd),
    ).rejects.toMatchObject({
      name: "ExecutorError",
      code: "setup-failed",
      message: expect.stringContaining("no lockfile here"),
      hint: expect.stringContaining("setup_command"),
    });
  });

  it("carries the process's own stderr when there is no log file to read back", async () => {
    const cwd = await tempCwd();
    await expect(
      runSetupCommand(input({ setupCommand: "echo boom 1>&2; exit 1" }), cwd),
    ).rejects.toMatchObject({ code: "setup-failed" });
  });
});
