import type { Recommendation, RecommendRequest } from "@agnostic/core";
import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { renderError } from "../render-error.js";
import { createTestContext } from "../test-context.js";
import { recommendCommand } from "./recommend.js";

const recommendation: Recommendation = {
  recommended: {
    profileId: "claude-code:opus:native",
    reason: "strong debug evidence for this agent and model; included in your plan",
    evidence: "strong",
    sources: ["swe-bench-verified", "terminal-bench"],
  },
  alternative: {
    profileId: "codex:gpt-5.6-sol:native",
    reason: "related benchmarks only (general); included in your plan",
  },
  worthTrying: {
    profileId: "pi:moonshotai/kimi-k2.7-code:openrouter",
    reason: "scores 11 points higher on debug benchmarks",
    enable: "export OPENROUTER_API_KEY=<your key>",
  },
  riskNote: "touches auth; an independent review is advised",
  taskClass: {
    intent: "debug",
    scope: "small",
    risk: ["auth"],
    needsBrowser: false,
    automaticIntent: null,
  },
};

function cliWith(answer: Recommendation, sent: RecommendRequest[] = []) {
  return createTestContext({
    cwd: "/work",
    client: {
      listRepos: () =>
        Promise.resolve({
          repos: [
            {
              id: "r4k8m2qrst",
              name: "petal",
              path: "/work",
              kind: "git" as const,
              addedAt: "2026-09-01T00:00:00.000Z",
              status: "active",
              testCommand: null,
              pathPresent: true,
            },
          ],
          cursor: 0,
        }),
      recommend: (body) => {
        sent.push(body);
        return Promise.resolve({ recommendation: answer });
      },
    },
  });
}

describe("agn recommend", () => {
  it("prints the class, the pick, the alternative, what to enable and the risk", async () => {
    const cli = cliWith(recommendation);
    await recommendCommand(cli.ctx).parseAsync(["fix the flaky auth test"], { from: "user" });
    expect(cli.out).toEqual([
      "Task: debug, small, risk: auth",
      "Recommended: claude-code:opus:native - strong debug evidence for this agent and model; included in your plan · evidence: strong · sources: swe-bench-verified, terminal-bench",
      "Alternative: codex:gpt-5.6-sol:native - related benchmarks only (general); included in your plan",
      "Worth trying: pi:moonshotai/kimi-k2.7-code:openrouter - scores 11 points higher on debug benchmarks · enable: export OPENROUTER_API_KEY=<your key>",
      "Risk: touches auth; an independent review is advised",
    ]);
  });

  it("leaves out the lines it has nothing for", async () => {
    const bare: Recommendation = {
      ...recommendation,
      recommended: {
        profileId: "claude-code:default:native",
        reason: "no evidence; using your default",
        evidence: "none",
        sources: [],
      },
      alternative: null,
      worthTrying: null,
      riskNote: null,
      taskClass: { ...recommendation.taskClass, intent: "general", risk: [] },
    };
    const cli = cliWith(bare);
    await recommendCommand(cli.ctx).parseAsync(["do the thing"], { from: "user" });
    expect(cli.out).toEqual([
      "Task: general, small",
      "Recommended: claude-code:default:native - no evidence; using your default · evidence: none",
      "Alternative: none",
    ]);
  });

  it("says on the class line when the user overrode the intent, and when a browser is needed", async () => {
    const overridden: Recommendation = {
      ...recommendation,
      taskClass: {
        ...recommendation.taskClass,
        intent: "debug",
        automaticIntent: "research",
        needsBrowser: true,
      },
    };
    const cli = cliWith(overridden);
    await recommendCommand(cli.ctx).parseAsync(
      ["why is the login flow slow", "--intent", "debug"],
      { from: "user" },
    );
    expect(cli.out[0]).toBe(
      "Task: debug (--intent; the prompt reads as research), small, risk: auth, needs a browser",
    );
  });

  it("prints model-level evidence as the sentence it is", async () => {
    const modelLevel: Recommendation = {
      ...recommendation,
      recommended: { ...recommendation.recommended, evidence: "model-level", sources: [] },
    };
    const cli = cliWith(modelLevel);
    await recommendCommand(cli.ctx).parseAsync(["fix the auth test"], { from: "user" });
    expect(cli.out[1]).toContain("· evidence: model-level only");
  });

  it("sends the flags the user gave and nothing else", async () => {
    const sent: RecommendRequest[] = [];
    const cli = cliWith(recommendation, sent);
    await recommendCommand(cli.ctx).parseAsync(["fix the auth test"], { from: "user" });
    expect(sent[0]).toEqual({ repoId: "r4k8m2qrst", prompt: "fix the auth test" });

    await recommendCommand(cli.ctx).parseAsync(
      ["fix the auth test", "--subscriptions-only", "--intent", "review"],
      { from: "user" },
    );
    expect(sent[1]).toEqual({
      repoId: "r4k8m2qrst",
      prompt: "fix the auth test",
      intent: "review",
      subscriptionsOnly: true,
    });
  });

  it("refuses an intent agn does not know, before asking the daemon", async () => {
    const cli = cliWith(recommendation);
    const command = recommendCommand(cli.ctx)
      .exitOverride()
      .configureOutput({ writeErr: () => undefined });
    await expect(
      command.parseAsync(["fix it", "--intent", "vibes"], { from: "user" }),
    ).rejects.toThrow(/--intent must be one of/);
  });

  it("prints the response verbatim with --json", async () => {
    const cli = cliWith(recommendation);
    cli.ctx.json = true;
    await recommendCommand(cli.ctx).parseAsync(["fix the auth test"], { from: "user" });
    expect(JSON.parse(cli.out.join("\n"))).toEqual({ recommendation });
  });

  it("exits 1 with the daemon's hint when nothing may run the task", () => {
    const refusal = new DaemonApiError("nothing to run this task on", {
      code: "no-eligible-profile",
      hint: "Run `agn doctor` to see what is installed.",
      status: 400,
    });
    const rendered = renderError(refusal);
    expect(rendered.exitCode).toBe(1);
    expect(rendered.lines).toEqual([
      "agn: nothing to run this task on",
      "  hint: Run `agn doctor` to see what is installed.",
    ]);
  });
});
