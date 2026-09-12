import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectPlan, parseClaudePlan, parseCodexPlan, planVendor } from "./detect-plan.js";
import { harnessDefinition } from "./harness-list.js";

const HOMES = fileURLToPath(new URL("../../../tests/fixtures/home", import.meta.url));

const plan = (harness: "claude-code" | "codex" | "pi", home: string) =>
  detectPlan(harnessDefinition(harness), `${HOMES}/${home}`);

describe("planVendor", () => {
  it("names the two harnesses billed by plan and nothing else", () => {
    expect(planVendor("claude-code")).toBe("claude");
    expect(planVendor("codex")).toBe("chatgpt");
    expect(planVendor("pi")).toBeNull();
    expect(planVendor("opencode")).toBeNull();
    expect(planVendor("other:aider")).toBeNull();
  });
});

describe("detectPlan", () => {
  it("reads the plan claim out of Codex's id token", async () => {
    expect(await plan("codex", "codex-plus")).toBe("plus");
  });

  it("writes Codex's team the way the plan page writes it", async () => {
    expect(await plan("codex", "codex-team")).toBe("business");
  });

  it("reads the tier out of Claude Code's account block", async () => {
    expect(await plan("claude-code", "claude-max")).toBe("max20");
  });

  it("says nothing rather than guessing", async () => {
    expect(await plan("codex", "codex-chatgpt")).toBeNull();
    expect(await plan("codex", "codex-api-key")).toBeNull();
    expect(await plan("codex", "malformed")).toBeNull();
    expect(await plan("codex", "empty")).toBeNull();
    expect(await plan("claude-code", "claude-oauth")).toBeNull();
    expect(await plan("claude-code", "malformed")).toBeNull();
  });

  it("has nothing to read for a harness billed per provider key", async () => {
    expect(await plan("pi", "pi-auth")).toBeNull();
  });
});

describe("the plan parsers", () => {
  it("take the claim from either the namespaced or the bare id token payload", () => {
    const token = (payload: unknown) =>
      `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
    expect(parseCodexPlan({ tokens: { id_token: token({ chatgpt_plan_type: "PRO" }) } })).toBe(
      "pro",
    );
    expect(
      parseCodexPlan({
        tokens: {
          id_token: token({ "https://api.openai.com/auth": { chatgpt_plan_type: "plus" } }),
        },
      }),
    ).toBe("plus");
  });

  it("refuse a token that is not three segments, and a payload that is not JSON", () => {
    expect(parseCodexPlan({ tokens: { id_token: "not-a-jwt" } })).toBeNull();
    expect(parseCodexPlan({ tokens: { id_token: "header.***.signature" } })).toBeNull();
    expect(parseCodexPlan({})).toBeNull();
  });

  it("pass a Claude tier the catalog has never seen through untouched", () => {
    const tier = (organizationRateLimitTier: string) => ({
      oauthAccount: { organizationRateLimitTier },
    });
    expect(parseClaudePlan(tier("default_claude_max_50x"))).toBe("max50");
    expect(parseClaudePlan(tier("default_claude_startup"))).toBe("startup");
    expect(parseClaudePlan(tier("pro"))).toBe("pro");
  });

  it("fall back to the user's own tier when the organisation has none", () => {
    expect(
      parseClaudePlan({
        oauthAccount: { organizationRateLimitTier: null, userRateLimitTier: "default_claude_pro" },
      }),
    ).toBe("pro");
    expect(parseClaudePlan({ oauthAccount: {} })).toBeNull();
    expect(parseClaudePlan({})).toBeNull();
  });
});
