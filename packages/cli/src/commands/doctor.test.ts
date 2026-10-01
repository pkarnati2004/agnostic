import type { DoctorResponse, HarnessReport, Profile, ToolReport } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { doctorCommand } from "./doctor.js";

function report(over: Partial<HarnessReport>): HarnessReport {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/opt/bin/claude",
    version: "2.0.1",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    support: "full",
    models: ["sonnet-4.5"],
    modelSource: "probe",
    planVendor: "claude",
    limitSource: "statusline",
    usageSource: "transcripts",
    plan: { value: "max20", source: "detected", known: true, confirmed: true, overridden: null },
    limitCapture: "all-sessions",
    ...over,
  };
}

const PROFILE: Profile = {
  id: "claude-code:default:native",
  harness: "claude-code",
  model: null,
  route: "native",
  billing: "subscription",
  available: true,
  evidence: "binary",
  tier: 1,
};

function run(
  harnesses: HarnessReport[],
  profiles: Profile[] = [PROFILE],
  tools: ToolReport[] = [],
  tmuxConfigStale = false,
  named: HarnessReport["harness"][] = [],
  pathVar = "/opt/bin",
) {
  const response: DoctorResponse = {
    tmuxConfigStale,
    harnesses,
    profiles,
    tools,
    named,
    detectedAt: "2026-09-11T10:00:00.000Z",
    pathVar,
    plans: {},
    planOptions: [
      { vendor: "claude", id: "pro", displayName: "Pro" },
      { vendor: "claude", id: "max20", displayName: "Max 20x" },
    ],
  };
  const cli = createTestContext({ client: { doctor: () => Promise.resolve(response) } });
  return {
    cli,
    response,
    done: (args: string[] = []) => doctorCommand(cli.ctx).parseAsync(args, { from: "user" }),
  };
}

describe("agn doctor", () => {
  it("leaves the harnesses nobody installed out of the table, on one line under it", async () => {
    const { cli, done } = run([
      report({}),
      report({
        harness: "codex",
        path: null,
        version: null,
        login: "unknown",
        modelSource: "none",
      }),
      report({
        harness: "gemini",
        support: "status",
        path: null,
        version: null,
        login: "unknown",
        modelSource: "none",
      }),
      report({ harness: "aider", tier: 2, support: "basic", path: null, version: null }),
    ]);
    await done();
    expect(cli.out).toEqual([
      "harness      version  login      support  usage        models      plan   path",
      "claude-code  2.0.1    logged-in  full     transcripts  1 (probed)  max20  /opt/bin/claude",
      "not installed: codex, gemini (2)",
      "claude-code status-line capture: all sessions",
      "profiles: 1 available (agn profiles)",
    ]);
  });

  it("leaves the PATH out when every harness the user asked for is installed", async () => {
    const { cli, done } = run([report({})]);
    await done();
    expect(cli.out.some((line) => line.startsWith("PATH:"))).toBe(false);
  });

  it("prints the PATH when a harness the user named has no binary on it", async () => {
    const { cli, done } = run(
      [report({}), report({ harness: "codex", path: null, version: null, login: "unknown" })],
      undefined,
      undefined,
      false,
      ["codex"],
    );
    await done();
    expect(cli.out).toContain("PATH: /opt/bin");
  });

  it("prints the PATH with --verbose, missing harness or not", async () => {
    const { cli, done } = run([report({})]);
    await done(["--verbose"]);
    expect(cli.out).toContain("PATH: /opt/bin");
  });

  it("prints an empty PATH when it found no agent at all", async () => {
    const { cli, done } = run(
      [report({ path: null, version: null, login: "unknown" })],
      undefined,
      undefined,
      false,
      [],
      "",
    );
    await done();
    expect(cli.out).toContain("PATH: ");
  });

  it("keeps a row for a harness the user named, installed or not", async () => {
    const { cli, done } = run(
      [
        report({ harness: "codex", path: null, version: null, login: "unknown" }),
        report({ harness: "gemini", support: "status", path: null, version: null }),
      ],
      undefined,
      undefined,
      false,
      ["gemini"],
    );
    await done();
    expect(cli.out.slice(0, 3)).toEqual([
      "harness  version  login  support  usage  models      plan  path",
      "gemini   -        -      status   -      1 (probed)  -     not installed",
      "not installed: codex (1)",
    ]);
  });

  it("says nothing about what is missing when everything is installed", async () => {
    const { cli, done } = run([report({})]);
    await done();
    expect(cli.out.some((line) => line.startsWith("not installed:"))).toBe(false);
  });

  it("prints the support each harness has, and names where the models came from", async () => {
    const { cli, done } = run([
      report({}),
      report({
        harness: "pi",
        binary: "pi",
        path: "/opt/bin/pi",
        modelSource: "seed",
        models: ["a", "b"],
        version: "0.9",
        planVendor: null,
        limitSource: null,
        plan: null,
      }),
      report({
        harness: "cursor-agent",
        support: "full",
        binary: "cursor-agent",
        path: "/opt/bin/cursor-agent",
        version: "0.4",
        login: "logged-in",
        models: [],
        modelSource: "none",
        planVendor: null,
        limitSource: null,
        usageSource: "hook",
        plan: null,
      }),
      report({
        harness: "aider",
        tier: 2,
        support: "basic",
        binary: "aider",
        path: "/opt/bin/aider",
        version: "0.1",
        login: "unknown",
        models: [],
        modelSource: "none",
        planVendor: null,
        limitSource: null,
        usageSource: null,
        plan: null,
      }),
    ]);
    await done();
    expect(cli.out.slice(1, 5)).toEqual([
      "claude-code   2.0.1    logged-in  full     transcripts    1 (probed)     max20  /opt/bin/claude",
      "pi            0.9      logged-in  full     transcripts    2 (seed list)  -      /opt/bin/pi",
      "cursor-agent  0.4      logged-in  full     hook           none           -      /opt/bin/cursor-agent",
      "aider         0.1      unknown    basic    not available  none           -      /opt/bin/aider",
    ]);
  });

  it("prints gh under the table, with its version and login", async () => {
    const { cli, done } = run([report({})], undefined, [
      { tool: "gh", path: "/usr/local/bin/gh", version: "2.96.0", login: "logged-in" },
    ]);
    await done();
    expect(cli.out).toContain("tools: gh 2.96.0 (logged-in)");
  });

  it("prints gh as missing when it is not installed", async () => {
    const { cli, done } = run([report({})], undefined, [
      { tool: "gh", path: null, version: null, login: "unknown" },
    ]);
    await done();
    expect(cli.out).toContain("tools: gh not installed");
  });

  it("warns when agn's tmux server started before the settings agn writes now", async () => {
    const { cli, done } = run([report({})], undefined, [], true);
    await done();
    expect(cli.out).toContain(
      "tmux server predates the current config; stop every task or run tmux -L agn kill-server",
    );
  });

  it("says nothing about tmux when the running server is on the current settings", async () => {
    const { cli, done } = run([report({})]);
    await done();
    expect(cli.out.some((line) => line.includes("tmux"))).toBe(false);
  });

  it("prints the response verbatim with --json", async () => {
    const { cli, response, done } = run([report({})]);
    cli.ctx.json = true;
    await done();
    expect(JSON.parse(cli.out.join("\n"))).toEqual(response);
  });

  it("names which sessions of a status-line harness report their limits, in all three states", async () => {
    const all = run([report({ limitCapture: "all-sessions" })]);
    await all.done();
    expect(all.cli.out).toContain("claude-code status-line capture: all sessions");

    const tasks = run([report({ limitCapture: "agn-tasks" })]);
    await tasks.done();
    expect(tasks.cli.out).toContain(
      "claude-code status-line capture: agn tasks only (hooks.claude_statusline: repo)",
    );

    const none = run([report({ limitCapture: "none" })]);
    await none.done();
    expect(none.cli.out).toContain(
      "claude-code status-line capture: none yet - run agn hooks install, or start a task",
    );
  });

  it("says nothing about a status line for a harness that reports its limits elsewhere", async () => {
    const { cli, done } = run([
      report({ harness: "codex", planVendor: null, plan: null, limitSource: "rollout" }),
      report({ harness: "pi", planVendor: null, plan: null, limitSource: null }),
    ]);
    await done();
    expect(cli.out.some((line) => line.includes("status-line capture"))).toBe(false);
  });

  it("carries the capture state per harness with --json", async () => {
    const { cli, done } = run([report({ limitCapture: "all-sessions" })]);
    cli.ctx.json = true;
    await done();
    const body = JSON.parse(cli.out.join("\n")) as { harnesses: { limitCapture: string }[] };
    expect(body.harnesses[0]?.limitCapture).toBe("all-sessions");
  });

  it("carries each harness's limit source in --json, so a script can see what agn can read", async () => {
    const { cli, done } = run([report({}), report({ harness: "pi", limitSource: null })]);
    cli.ctx.json = true;
    await done();
    const body = JSON.parse(cli.out.join("\n")) as {
      harnesses: { harness: string; limitSource: string | null }[];
    };
    expect(body.harnesses.map((row) => [row.harness, row.limitSource])).toEqual([
      ["claude-code", "statusline"],
      ["pi", null],
    ]);
  });
});
