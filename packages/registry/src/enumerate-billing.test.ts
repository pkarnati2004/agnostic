import type { EntitlementRow, PlanRow } from "@agnostic/catalog";
import type { Plans } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { HarnessStatus } from "./detect.js";
import { enumerateProfiles } from "./enumerate-profiles.js";

const PLANS: PlanRow[] = [
  { vendor: "claude", id: "pro", displayName: "Pro", confirmedAt: "2026-09-01" },
  { vendor: "claude", id: "max20", displayName: "Max 20x", confirmedAt: "2026-09-01" },
  { vendor: "google", id: "ai-pro", displayName: "Google AI Pro", confirmedAt: "2026-09-21" },
];

const entitled = (
  model: string,
  plan: string,
  access: EntitlementRow["access"],
): EntitlementRow => ({ harness: "claude-code", model, vendor: "claude", plan, access });

/** Fable is metered on Pro and included on Max 20x; Opus cannot run on Pro at all (ADR 016). */
const ENTITLEMENTS: EntitlementRow[] = [
  entitled("fable", "pro", "credits"),
  entitled("fable", "max20", "included"),
  entitled("opus", "pro", "unavailable"),
];

function loggedIn(plan: string | null, models: string[]): HarnessStatus {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/fixture/bin/claude",
    version: "2.0.0",
    login: "logged-in",
    billing: "subscription",
    models: { models, origin: "probe", error: null },
    plan,
    tier: 1,
  };
}

function billing(status: HarnessStatus, configPlans: Plans = {}) {
  const profiles = enumerateProfiles({
    statuses: [status],
    env: {},
    servers: [],
    models: [],
    entitlements: ENTITLEMENTS,
    catalogPlans: PLANS,
    configPlans,
  });
  return profiles.map((profile) => [profile.model, profile.billing, profile.evidence]);
}

describe("enumerateProfiles billing", () => {
  it("says the plan is unknown rather than guessing what it includes", () => {
    expect(billing(loggedIn(null, ["fable", "opus"]))).toEqual([
      [null, "subscription", "unknown-plan"],
      ["fable", "subscription", "unknown-plan"],
      ["opus", "subscription", "unknown-plan"],
    ]);
  });

  it("bills a model the plan includes as the subscription it runs on", () => {
    expect(billing(loggedIn("max20", ["fable"]))).toEqual([
      [null, "subscription", "binary"],
      ["fable", "subscription", "binary"],
    ]);
  });

  it("bills a listed but metered model as credits", () => {
    expect(billing(loggedIn("pro", ["fable"]))).toEqual([
      [null, "subscription", "binary"],
      ["fable", "credits", "binary"],
    ]);
  });

  it("drops a model the plan cannot run, and keeps the default profile", () => {
    expect(billing(loggedIn("pro", ["opus", "fable"])).map((row) => row[0])).toEqual([
      null,
      "fable",
    ]);
  });

  it("treats a model the table says nothing about as included", () => {
    expect(billing(loggedIn("max20", ["haiku"]))).toEqual([
      [null, "subscription", "binary"],
      ["haiku", "subscription", "binary"],
    ]);
  });

  it("falls back to the configured plan, and prefers the detected one", () => {
    expect(billing(loggedIn(null, ["fable"]), { claude: "pro" }).map((row) => row[1])).toEqual([
      "subscription",
      "credits",
    ]);
    expect(billing(loggedIn("max20", ["fable"]), { claude: "pro" }).map((row) => row[1])).toEqual([
      "subscription",
      "subscription",
    ]);
  });

  it("bills unknown for a plan the catalog has never heard of", () => {
    expect(billing(loggedIn("max50", ["fable"]))).toEqual([
      [null, "unknown", "unknown-plan"],
      ["fable", "unknown", "unknown-plan"],
    ]);
  });

  it("bills the configured plan when the detected one is not in the catalog", () => {
    expect(billing(loggedIn("max50", ["fable"]), { claude: "max20" })).toEqual([
      [null, "subscription", "binary"],
      ["fable", "subscription", "binary"],
    ]);
  });

  it("leaves a harness that is not billed by plan alone", () => {
    const pi: HarnessStatus = {
      ...loggedIn(null, ["a"]),
      harness: "pi",
      name: "Pi",
      binary: "pi",
      path: "/fixture/bin/pi",
    };
    expect(billing(pi)).toEqual([
      [null, "subscription", "binary"],
      ["a", "subscription", "binary"],
    ]);
  });
});

/** Google names no tier on disk, so the plan comes from config.yaml or doctor asks for it. */
function gemini(overrides: Partial<HarnessStatus> = {}): HarnessStatus {
  return {
    harness: "gemini",
    name: "Gemini CLI",
    binary: "gemini",
    path: "/fixture/bin/gemini",
    version: "0.9.0",
    login: "logged-in",
    billing: "subscription",
    models: { models: ["gemini-3-pro"], origin: "probe", error: null },
    plan: null,
    tier: 1,
    ...overrides,
  };
}

describe("enumerateProfiles for a vendor whose files name no tier", () => {
  it("bills a config plan the catalog knows as the subscription it is", () => {
    expect(billing(gemini(), { google: "ai-pro" })).toEqual([
      [null, "subscription", "binary"],
      ["gemini-3-pro", "subscription", "binary"],
    ]);
  });

  it("says the plan is unknown when neither the file nor config.yaml names one", () => {
    expect(billing(gemini())).toEqual([
      [null, "subscription", "unknown-plan"],
      ["gemini-3-pro", "subscription", "unknown-plan"],
    ]);
  });

  it("bills by API key when the login says nothing and GEMINI_API_KEY is set", () => {
    const profiles = enumerateProfiles({
      statuses: [gemini({ login: "unknown", billing: "unknown" })],
      env: { GEMINI_API_KEY: "key" },
      servers: [],
      models: [],
      entitlements: ENTITLEMENTS,
      catalogPlans: PLANS,
      configPlans: {},
    });
    expect(profiles.map((profile) => [profile.billing, profile.evidence])).toEqual([
      ["api-key", "binary"],
      ["api-key", "binary"],
    ]);
  });
});
