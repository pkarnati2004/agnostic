// Pick 2: "Success text is the daemon's JSON, pretty-printed." These tests prove the text a tool
// answers with is byte-identical to what the matching CLI command prints under --json, against the
// same stub client. agn_status and agn_task compose more than one daemon call into one object that
// no single CLI command prints, so those two are checked against writeJson directly instead - the
// same function --json calls, applied to the same composed value the tool built.
import type {
  DaemonClient,
  ProfilesResponse,
  RecommendResponse,
  UsageResponse,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { profilesCommand } from "../commands/profiles.js";
import { recommendCommand } from "../commands/recommend.js";
import { usageCommand } from "../commands/usage.js";
import { writeJson } from "../context.js";
import { createTestContext } from "../test-context.js";
import { toolResult } from "./tool.js";
import { findTool } from "./tools.js";
import { call, REPO, TASK, USAGE } from "./tools-fixture.js";

function cliOf(client: Partial<DaemonClient>) {
  return createTestContext({ client, cwd: "/work" });
}

async function mcpText(name: string, args: unknown, client: Partial<DaemonClient>) {
  const { ctx } = cliOf(client);
  const value = await call(ctx, name, args);
  return toolResult(value).content[0].text;
}

describe("agn_profiles matches agn profiles --json", () => {
  it("prints the same bytes", async () => {
    const response: ProfilesResponse = { profiles: [], detectedAt: "2026-09-11T10:00:00.000Z" };
    const client = { profiles: () => Promise.resolve(response) };
    const cli = cliOf(client);
    cli.ctx.json = true;
    await profilesCommand(cli.ctx).parseAsync([], { from: "user" });
    const text = await mcpText("agn_profiles", {}, client);
    expect(text).toBe(cli.out.join("\n"));
  });
});

describe("agn_recommend matches agn recommend --json", () => {
  it("prints the same bytes for the same resolved repo and prompt", async () => {
    const response: RecommendResponse = { recommendation: { taskClass: {} } as never };
    const client = {
      listRepos: () => Promise.resolve({ repos: [REPO], cursor: 1 }),
      recommend: () => Promise.resolve(response),
    };
    const cli = cliOf(client);
    cli.ctx.json = true;
    await recommendCommand(cli.ctx).parseAsync(["fix the auth test", "--repo", "r7k"], {
      from: "user",
    });
    const text = await mcpText(
      "agn_recommend",
      { prompt: "fix the auth test", repo: "r7k" },
      client,
    );
    expect(text).toBe(cli.out.join("\n"));
  });
});

describe("agn_usage matches agn usage --json", () => {
  it("prints the same bytes for the two-window answer outside a worktree", async () => {
    const response = { scannedAt: "now" } as unknown as UsageResponse;
    const client = { usage: () => Promise.resolve(response) };
    const cli = cliOf(client);
    cli.ctx.json = true;
    await usageCommand(cli.ctx).parseAsync([], { from: "user" });
    const text = await mcpText("agn_usage", {}, client);
    expect(text).toBe(cli.out.join("\n"));
  });

  it("prints the same bytes for one task's usage", async () => {
    const response = { task: TASK, usage: USAGE, billing: "subscription" as const };
    const client = { taskUsage: () => Promise.resolve(response) };
    const cli = cliOf(client);
    cli.ctx.json = true;
    await usageCommand(cli.ctx).parseAsync([TASK.id], { from: "user" });
    const text = await mcpText("agn_usage", { task: TASK.id }, client);
    expect(text).toBe(cli.out.join("\n"));
  });
});

describe("agn_status and agn_task against writeJson, the function --json calls", () => {
  it("formats the merged repos-and-tasks answer the way --json would", async () => {
    const client = {
      listRepos: () => Promise.resolve({ repos: [REPO], cursor: 1 }),
      listAllTasks: () =>
        Promise.resolve({ tasks: [{ ...TASK, worktreePresent: true }], cursor: 1 }),
    };
    const { ctx, out } = cliOf(client);
    const value = await call(ctx, "agn_status", {});
    writeJson({ out: (line) => out.push(line), err: () => undefined }, value);
    expect(toolResult(value).content[0].text).toBe(out.join("\n"));
  });

  it("formats the merged task-outcome-usage answer the way --json would", async () => {
    const client = {
      getTask: () => Promise.resolve({ task: TASK }),
      taskOutcome: () => Promise.resolve({ task: TASK, outcome: null }),
      taskUsage: () => Promise.resolve({ task: TASK, usage: USAGE, billing: null }),
    };
    const { ctx, out } = cliOf(client);
    const value = await call(ctx, "agn_task", { task: TASK.id });
    writeJson({ out: (line) => out.push(line), err: () => undefined }, value);
    expect(toolResult(value).content[0].text).toBe(out.join("\n"));
  });
});

describe("toolResult formatting", () => {
  it("is 2-space pretty-printed JSON with no trailing newline, for every read tool", () => {
    for (const name of ["agn_status", "agn_task", "agn_recommend", "agn_usage", "agn_profiles"]) {
      expect(findTool(name)?.readOnly).toBe(true);
    }
    const text = toolResult({ a: 1 }).content[0].text;
    expect(text).toBe('{\n  "a": 1\n}');
  });
});
