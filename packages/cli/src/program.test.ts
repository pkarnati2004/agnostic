import { readFileSync } from "node:fs";
import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "./program.js";
import { createTestContext } from "./test-context.js";

const AMBIGUOUS = new DaemonApiError("the agn daemon is not answering", {
  code: "daemon-unreachable",
  hint: "Run `agn daemon start`.",
  status: null,
});

function failing() {
  return createTestContext({
    client: {
      listRepos: () => Promise.reject(AMBIGUOUS),
    },
  });
}

describe("runMain", () => {
  it("prints the version from the package manifest under --version and exits 0", async () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const cli = createTestContext();
    const code = await runMain(["node", "agn", "--version"], cli.ctx);
    expect(code).toBe(0);
    expect(cli.out).toEqual([manifest.version]);
  });

  it("prints every command this build carries under --help and exits 0", async () => {
    const cli = createTestContext();
    const code = await runMain(["node", "agn", "--help"], cli.ctx);
    const help = cli.out.join("\n");
    expect(code).toBe(0);
    for (const command of [
      "daemon",
      "add",
      "repos",
      "doctor",
      "profiles",
      "run",
      "status",
      "attach",
      "stop",
      "clean",
    ]) {
      expect(help).toContain(command);
    }
  });

  it("treats an unknown command as a usage error", async () => {
    const cli = createTestContext();
    const code = await runMain(["node", "agn", "nope"], cli.ctx);
    expect(code).toBe(2);
    expect(cli.err.join("\n")).toContain("unknown command");
  });

  it("treats a missing required argument as a usage error, in commander's own words", async () => {
    const cli = createTestContext();
    const code = await runMain(["node", "agn", "add"], cli.ctx);
    expect(code).toBe(2);
    expect(cli.err.join("\n")).toContain("missing required argument");
    expect(cli.out).toEqual([]);
  });

  it("sets json on the context whether --json comes before or after the command", async () => {
    for (const args of [
      ["--json", "repos"],
      ["repos", "--json"],
    ]) {
      const cli = createTestContext({
        client: { listRepos: () => Promise.resolve({ repos: [], cursor: 0 }) },
      });
      const code = await runMain(["node", "agn", ...args], cli.ctx);
      expect(code).toBe(0);
      expect(cli.ctx.json).toBe(true);
      expect(JSON.parse(cli.out.join("\n"))).toEqual({ repos: [], cursor: 0 });
    }
  });

  it("renders a failed command as a message and a hint on stderr", async () => {
    const cli = failing();
    const code = await runMain(["node", "agn", "repos"], cli.ctx);
    expect(code).toBe(1);
    expect(cli.err).toEqual([
      "agn: the agn daemon is not answering",
      "  hint: Run `agn daemon start`.",
    ]);
    expect(cli.out).toEqual([]);
  });

  it("renders the same failure as one line of JSON with --json", async () => {
    const cli = failing();
    const code = await runMain(["node", "agn", "repos", "--json"], cli.ctx);
    expect(code).toBe(1);
    expect(cli.err).toHaveLength(1);
    expect(JSON.parse(cli.err[0] ?? "")).toEqual({
      error: {
        code: "daemon-unreachable",
        message: "the agn daemon is not answering",
        hint: "Run `agn daemon start`.",
      },
    });
  });
});
