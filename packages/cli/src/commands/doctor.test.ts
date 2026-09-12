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
    models: ["sonnet-4.5"],
    modelSource: "probe",
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
) {
  const response: DoctorResponse = {
    harnesses,
    profiles,
    tools,
    detectedAt: "2026-09-11T10:00:00.000Z",
    pathVar: "/opt/bin",
  };
  const cli = createTestContext({ client: { doctor: () => Promise.resolve(response) } });
  return { cli, response, done: () => doctorCommand(cli.ctx).parseAsync([], { from: "user" }) };
}

describe("agn doctor", () => {
  it("shows a missing tier-1 harness and hides a missing tier-2 one", async () => {
    const { cli, done } = run([
      report({
        harness: "codex",
        path: null,
        version: null,
        login: "unknown",
        models: [],
        modelSource: "none",
      }),
      report({
        harness: "other:aider",
        tier: 2,
        path: null,
        version: null,
        models: [],
        modelSource: "none",
      }),
    ]);
    await done();
    expect(cli.out).toEqual([
      "harness  version  login  support  models  path",
      "codex    -        -      full     none    not installed",
      "profiles: 1 available (agn profiles)",
      "PATH: /opt/bin",
    ]);
  });

  it("labels tier 2 basic and tier 1 full, and names where the models came from", async () => {
    const { cli, done } = run([
      report({}),
      report({
        harness: "pi",
        binary: "pi",
        path: "/opt/bin/pi",
        modelSource: "seed",
        models: ["a", "b"],
        version: "0.9",
      }),
      report({
        harness: "other:aider",
        tier: 2,
        binary: "aider",
        path: "/opt/bin/aider",
        version: "0.1",
        login: "unknown",
        models: [],
        modelSource: "none",
      }),
    ]);
    await done();
    expect(cli.out.slice(1, 4)).toEqual([
      "claude-code  2.0.1    logged-in  full     1 (probed)     /opt/bin/claude",
      "pi           0.9      logged-in  full     2 (seed list)  /opt/bin/pi",
      "other:aider  0.1      unknown    basic    none           /opt/bin/aider",
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

  it("prints the response verbatim with --json", async () => {
    const { cli, response, done } = run([report({})]);
    cli.ctx.json = true;
    await done();
    expect(JSON.parse(cli.out.join("\n"))).toEqual(response);
  });
});
