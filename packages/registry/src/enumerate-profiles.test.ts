import type { ModelRow } from "@agnostic/catalog";
import { type HarnessId, ProfileSchema, parseProfileId } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { HarnessStatus } from "./detect.js";
import type { LocalServer } from "./detect-local-servers.js";
import { enumerateProfiles } from "./enumerate-profiles.js";
import { harnessDefinition } from "./harness-list.js";
import type { ModelListResult } from "./probe-models.js";

const gateway = (harness: HarnessId, model: string, route: ModelRow["route"]): ModelRow => ({
  harness,
  model,
  route,
  canonical: null,
  legacy: false,
});

/** The gateway rows the catalog holds; the native models come from the probe, not from here. */
const MODELS: ModelRow[] = [
  gateway("claude-code", "kimi-k2.7-code", "anthropic-gateway"),
  gateway("claude-code", "kimi-k2.6", "anthropic-gateway"),
  gateway("pi", "moonshotai/kimi-k2.7-code", "openrouter"),
  gateway("pi", "moonshotai/kimi-k2.6", "openrouter"),
  gateway("pi", "moonshotai/kimi-k2.5", "openrouter"),
  gateway("opencode", "moonshotai/kimi-k2.7-code", "openrouter"),
  gateway("opencode", "moonshotai/kimi-k2.6", "openrouter"),
  gateway("opencode", "moonshotai/kimi-k2.5", "openrouter"),
];

/**
 * What a machine agn knows nothing else about sees: the catalog's gateway rows, no entitlements,
 * no plans. `enumerate-billing.test.ts` is where the plan decides the answer.
 */
function enumerate(
  statuses: HarnessStatus[],
  env: Record<string, string> = {},
  servers: LocalServer[] = [],
) {
  return enumerateProfiles({
    statuses,
    env,
    servers,
    models: MODELS,
    entitlements: [],
    catalogPlans: [],
    configPlans: {},
  });
}

function installed(
  harness: HarnessId,
  overrides: Partial<HarnessStatus> & { models?: ModelListResult | null } = {},
): HarnessStatus {
  const def = harnessDefinition(harness);
  return {
    harness,
    name: def.name,
    binary: def.binary,
    path: `/fixture/bin/${def.binary}`,
    version: "1.0.0",
    login: "unknown",
    billing: "unknown",
    models: { models: [], origin: "none", error: "no answer" },
    plan: null,
    tier: def.tier,
    ...overrides,
  };
}

const probed = (models: string[]): ModelListResult => ({ models, origin: "probe", error: null });

const server: LocalServer = {
  name: "ollama",
  port: 11434,
  baseUrl: "http://127.0.0.1:11434",
  models: ["qwen3:8b", "llama4:7b"],
};

describe("enumerateProfiles", () => {
  it("offers the default profile first, then one per listed model", () => {
    const statuses = [
      installed("claude-code", {
        login: "logged-in",
        billing: "subscription",
        models: probed(["fable", "opus"]),
      }),
    ];
    const profiles = enumerate(statuses, {}, []);
    expect(profiles.map((profile) => profile.id)).toEqual([
      "claude-code:default:native",
      "claude-code:fable:native",
      "claude-code:opus:native",
    ]);
    expect(profiles.every((profile) => profile.billing === "subscription")).toBe(true);
    // The plan is unknown here, which the evidence says rather than the billing hiding it.
    expect(profiles.every((profile) => profile.evidence === "unknown-plan")).toBe(true);
  });

  it("offers the rows a harness fell back to, seeded or probed alike", () => {
    const statuses = [
      installed("codex", {
        login: "logged-in",
        billing: "subscription",
        models: {
          models: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"],
          origin: "seed",
          error: "codex listed no models",
        },
      }),
    ];
    expect(enumerate(statuses, {}, []).map((profile) => profile.model)).toEqual([
      null,
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ]);
  });

  it("still offers the default profile when nothing knows the models", () => {
    const profiles = enumerate([installed("pi")], {}, []);
    expect(profiles.map((profile) => profile.id)).toEqual(["pi:default:native"]);
    expect(profiles[0]?.billing).toBe("unknown");
  });

  it("never hides an installed harness for lack of a login", () => {
    const profiles = enumerate([installed("opencode"), installed("pi")], {}, []);
    expect(profiles.map((profile) => profile.id)).toEqual([
      "opencode:default:native",
      "pi:default:native",
    ]);
    expect(profiles.every((profile) => profile.billing === "unknown")).toBe(true);
  });

  it("bills by API key when the provider key is in the environment and no login was found", () => {
    const [profile] = enumerate([installed("codex")], { OPENAI_API_KEY: "sk-x" }, []);
    expect(profile?.billing).toBe("api-key");
  });

  it("adds the gateway profiles the environment pays for", () => {
    const statuses = [installed("claude-code"), installed("pi"), installed("codex")];
    const profiles = enumerate(
      statuses,
      { MOONSHOT_API_KEY: "moon", OPENROUTER_API_KEY: "or" },
      [],
    );
    expect(profiles.filter((profile) => profile.route === "anthropic-gateway")).toEqual([
      expect.objectContaining({ id: "claude-code:kimi-k2.7-code:anthropic-gateway" }),
      expect.objectContaining({ id: "claude-code:kimi-k2.6:anthropic-gateway" }),
    ]);
    expect(
      profiles.filter((profile) => profile.route === "openrouter").map((profile) => profile.id),
    ).toEqual([
      "pi:moonshotai/kimi-k2.7-code:openrouter",
      "pi:moonshotai/kimi-k2.6:openrouter",
      "pi:moonshotai/kimi-k2.5:openrouter",
    ]);
    for (const profile of profiles.filter((row) => row.route !== "native")) {
      expect(profile.billing).toBe("api-key");
      expect(profile.evidence).toBe("env");
    }
  });

  it("gives OpenCode OpenRouter profiles too, same as Pi", () => {
    const profiles = enumerate([installed("opencode")], { OPENROUTER_API_KEY: "or" }, []);
    expect(
      profiles.filter((profile) => profile.route === "openrouter").map((profile) => profile.id),
    ).toEqual([
      "opencode:moonshotai/kimi-k2.7-code:openrouter",
      "opencode:moonshotai/kimi-k2.6:openrouter",
      "opencode:moonshotai/kimi-k2.5:openrouter",
    ]);
  });

  it("builds ids that parseProfileId reads back into the same harness, model and route", () => {
    const statuses = [installed("claude-code", { models: probed(["fable"]) }), installed("codex")];
    const profiles = enumerate(statuses, { MOONSHOT_API_KEY: "moon" }, [server]);
    for (const p of profiles) {
      expect(parseProfileId(p.id)).toEqual({ harness: p.harness, model: p.model, route: p.route });
    }
  });

  it("adds a local profile per model a server holds, for the harness that can use one", () => {
    const profiles = enumerate([installed("codex"), installed("pi")], {}, [server]);
    expect(profiles.filter((profile) => profile.route === "local")).toEqual([
      expect.objectContaining({
        id: "codex:qwen3:8b:local",
        model: "qwen3:8b",
        billing: "local",
        evidence: "port",
      }),
      expect.objectContaining({ id: "codex:llama4:7b:local", model: "llama4:7b" }),
    ]);
  });

  it("keeps each harness's profiles together and its routes in order", () => {
    const statuses = [
      installed("claude-code", { models: probed(["opus"]) }),
      installed("pi"),
      installed("codex"),
    ];
    const profiles = enumerate(statuses, { MOONSHOT_API_KEY: "moon", OPENROUTER_API_KEY: "or" }, [
      server,
    ]);
    expect(profiles.map((profile) => profile.id)).toEqual([
      "claude-code:default:native",
      "claude-code:opus:native",
      "claude-code:kimi-k2.7-code:anthropic-gateway",
      "claude-code:kimi-k2.6:anthropic-gateway",
      "pi:default:native",
      "pi:moonshotai/kimi-k2.7-code:openrouter",
      "pi:moonshotai/kimi-k2.6:openrouter",
      "pi:moonshotai/kimi-k2.5:openrouter",
      "codex:default:native",
      "codex:qwen3:8b:local",
      "codex:llama4:7b:local",
    ]);
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(profiles.length);
    for (const profile of profiles) {
      expect(ProfileSchema.parse(profile)).toEqual(profile);
    }
  });

  it("offers nothing for a harness that is not installed, whatever the environment holds", () => {
    const missing = installed("claude-code", { path: null });
    expect(enumerate([missing], { MOONSHOT_API_KEY: "moon" }, [server])).toEqual([]);
    expect(enumerate([], { OPENROUTER_API_KEY: "or" }, [server])).toEqual([]);
  });

  it("gives a tier-2 harness its one profile and nothing else", () => {
    const profiles = enumerate([installed("aider")], { OPENROUTER_API_KEY: "or" }, [server]);
    expect(profiles).toEqual([expect.objectContaining({ id: "aider:default:native", tier: 2 })]);
  });
});
