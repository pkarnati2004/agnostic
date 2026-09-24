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
    plan: { value: "max20", source: "detected", known: true, confirmed: true, overridden: null },
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
) {
  const response: DoctorResponse = {
    tmuxConfigStale,
    harnesses,
    profiles,
    tools,
    named,
    detectedAt: "2026-09-11T10:00:00.000Z",
    pathVar: "/opt/bin",
    plans: {},
    planOptions: [
      { vendor: "claude", id: "pro", displayName: "Pro" },
      { vendor: "claude", id: "max20", displayName: "Max 20x" },
    ],
  };
  const cli = createTestContext({ client: { doctor: () => Promise.resolve(response) } });
  return { cli, response, done: () => doctorCommand(cli.ctx).parseAsync([], { from: "user" }) };
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
      "harness      version  login      support  models      plan   path",
      "claude-code  2.0.1    logged-in  full     1 (probed)  max20  /opt/bin/claude",
      "not installed: codex, gemini (2)",
      "profiles: 1 available (agn profiles)",
      "PATH: /opt/bin",
    ]);
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
      "harness  version  login  support  models      plan  path",
      "gemini   -        -      status   1 (probed)  -     not installed",
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
        plan: null,
      }),
      report({
        harness: "gemini",
        support: "status",
        binary: "gemini",
        path: "/opt/bin/gemini",
        version: "0.4",
        login: "logged-in",
        models: [],
        modelSource: "none",
        planVendor: null,
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
        plan: null,
      }),
    ]);
    await done();
    expect(cli.out.slice(1, 5)).toEqual([
      "claude-code  2.0.1    logged-in  full     1 (probed)     max20  /opt/bin/claude",
      "pi           0.9      logged-in  full     2 (seed list)  -      /opt/bin/pi",
      "gemini       0.4      logged-in  status   none           -      /opt/bin/gemini",
      "aider        0.1      unknown    basic    none           -      /opt/bin/aider",
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
});
