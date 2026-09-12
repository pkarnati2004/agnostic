import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agnosticHome, agnosticPaths, taskLogPath, worktreePath } from "./paths.js";

describe("agnosticHome", () => {
  it("honours AGNOSTIC_HOME", () => {
    expect(agnosticHome({ AGNOSTIC_HOME: "/tmp/agnostic-test" })).toBe("/tmp/agnostic-test");
  });

  it("falls back to ~/.agnostic when the override is absent or empty", () => {
    const fallback = join(homedir(), ".agnostic");
    expect(agnosticHome({})).toBe(fallback);
    expect(agnosticHome({ AGNOSTIC_HOME: "" })).toBe(fallback);
  });
});

describe("agnosticPaths", () => {
  it("puts every file under the home directory", () => {
    const paths = agnosticPaths("/tmp/agnostic-test");
    expect(paths).toEqual({
      home: "/tmp/agnostic-test",
      db: "/tmp/agnostic-test/agnostic.db",
      authToken: "/tmp/agnostic-test/auth-token",
      config: "/tmp/agnostic-test/config.yaml",
      worktrees: "/tmp/agnostic-test/worktrees",
      logs: "/tmp/agnostic-test/logs",
      sessions: "/tmp/agnostic-test/sessions",
      daemon: "/tmp/agnostic-test/daemon.json",
    });
  });
});

describe("worktreePath", () => {
  it("nests the task under its repo", () => {
    const paths = agnosticPaths("/tmp/agnostic-test");
    expect(worktreePath(paths, "r7k2m4pqrs", "t3n9v2wxyz")).toBe(
      "/tmp/agnostic-test/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    );
  });
});

describe("taskLogPath", () => {
  it("keeps one log per task under the logs directory", () => {
    const paths = agnosticPaths("/tmp/agnostic-test");
    expect(taskLogPath(paths, "t3n9v2wxyz")).toBe("/tmp/agnostic-test/logs/tasks/t3n9v2wxyz.log");
  });
});
