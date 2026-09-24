import { describe, expect, it, vi } from "vitest";
import { ProcessError } from "./error.js";
import { launchDetached } from "./launch-detached.js";
import type { ProcessOptions, spawn } from "./process.js";

const LOG = "/home/.agnostic/logs/agn-ui.log";
const ENV = { PATH: "/usr/bin" };

type Spawned = { command: string; args: string[]; opts: ProcessOptions };

/** `exit` is what the child does: exit at once, fail at once, or keep running. */
function context(exit: "now" | "never" | { rejects: unknown }) {
  const spawned: Spawned[] = [];
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
  return { spawn: fakeSpawn, spawned, firstSpawn, unrefs: () => unrefs };
}

describe("launchDetached", () => {
  it("starts the command detached, in the caller's environment, with its output in a log", async () => {
    const test = context("now");
    await launchDetached(test.spawn, ["open", "https://example.test"], { env: ENV, logFile: LOG });
    expect(test.spawned).toEqual([
      {
        command: "open",
        args: ["https://example.test"],
        opts: { detached: true, inheritEnv: false, env: ENV, logFile: LOG },
      },
    ]);
  });

  it("throws what the child printed when it dies inside the window", async () => {
    const test = context({
      rejects: new ProcessError("open exited with code 2", {
        code: "process-failed",
        command: "open",
        args: [],
        exitCode: 2,
        stderr: "Unable to find application",
      }),
    });
    await expect(
      launchDetached(test.spawn, ["open", "x"], { env: ENV, logFile: LOG }),
    ).rejects.toThrow("Unable to find application");
  });

  it("throws the failure itself when the child left no output", async () => {
    const test = context({ rejects: new Error("spawn xdg-open ENOENT") });
    await expect(
      launchDetached(test.spawn, ["xdg-open", "x"], { env: ENV, logFile: LOG }),
    ).rejects.toThrow("ENOENT");
  });

  it("lets go of a child that is still running when the window closes", async () => {
    vi.useFakeTimers();
    try {
      const test = context("never");
      const launched = launchDetached(test.spawn, ["open", "x"], { env: ENV, logFile: LOG });
      await test.firstSpawn;
      await vi.advanceTimersByTimeAsync(3_000);
      await launched;
      expect(test.unrefs()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses an empty argv rather than spawning the shell's idea of one", async () => {
    const test = context("now");
    await expect(launchDetached(test.spawn, [], { env: ENV, logFile: LOG })).rejects.toThrow(
      "no command to run",
    );
    expect(test.spawned).toEqual([]);
  });
});
