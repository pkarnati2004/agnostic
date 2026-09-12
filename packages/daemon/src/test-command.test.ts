import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTestCommand } from "./test-command.js";

let cwd: string;
let warnings: string[];

/** The one line this file cares about: what the daemon says when a suite outlives its timeout. */
const log = { warn: (msg: string) => warnings.push(msg) };

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "agn-test-command-"));
  warnings = [];
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("runTestCommand", () => {
  it("is true when the command succeeds and false when it fails", async () => {
    expect(await runTestCommand({ command: "exit 0", cwd, logFile: null, log })).toBe(true);
    expect(await runTestCommand({ command: "exit 1", cwd, logFile: null, log })).toBe(false);
  });

  it("is null when the repo has no test command", async () => {
    expect(await runTestCommand({ command: null, cwd, logFile: null, log })).toBeNull();
  });

  it("is null when the shell cannot find the command at all", async () => {
    expect(
      await runTestCommand({ command: "definitely-not-a-command", cwd, logFile: null, log }),
    ).toBeNull();
  });

  it("runs in the directory it is given and appends its output to the task log", async () => {
    const logFile = join(cwd, "logs", "task.log");
    expect(await runTestCommand({ command: "pwd && echo ran", cwd, logFile, log })).toBe(true);
    const written = await readFile(logFile, "utf8");
    expect(written).toContain("ran");
    expect(written).toContain(cwd.split("/").pop() ?? "");
  });

  it("is null and says so when the command outlives its timeout", async () => {
    const passed = await runTestCommand({
      command: "sleep 5",
      cwd,
      logFile: null,
      log,
      timeoutMs: 100,
    });
    expect(passed).toBeNull();
    expect(warnings).toEqual(["test command timed out"]);
  });
});
