import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveDaemonEntry, runDaemonCommand } from "./daemon-entry.js";
import { stubEntry } from "./test-context.js";

describe("resolveDaemonEntry", () => {
  it("points at a daemon entry that is on disk, run by this node", () => {
    const entry = resolveDaemonEntry();
    expect(entry.argv[0]).toBe(process.execPath);
    expect(existsSync(entry.argv[entry.argv.length - 1] ?? "")).toBe(true);
  });

  it("resolves the development condition's source file under vitest, not the built one", () => {
    // Only the suffix is asserted: the absolute path is a machine-specific temp/workspace location.
    const entry = resolveDaemonEntry();
    expect(entry.argv[entry.argv.length - 1]).toMatch(/\/src\/main\.ts$/);
  });
});

describe("runDaemonCommand", () => {
  it("returns the child's exit code and both streams instead of throwing", async () => {
    const result = await runDaemonCommand(stubEntry(), ["status"], {
      env: { AGND_STUB_EXIT: "2", AGND_STUB_STDERR: "stale" },
    });
    expect(result).toEqual({ exitCode: 2, stdout: "agnd-stub status", stderr: "stale" });
  });

  it("hands back what the daemon printed when it succeeds", async () => {
    const result = await runDaemonCommand(stubEntry(), ["start", "--port", "0"]);
    expect(result).toEqual({ exitCode: 0, stdout: "agnd-stub start --port 0", stderr: "" });
  });
});
