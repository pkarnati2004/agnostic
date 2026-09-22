import type { Catalog } from "@agnostic/catalog";
import type { Profile } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import type { DaemonError } from "./error.js";
import { chooseSpecWriter, type SpecWriterChoice } from "./spec-writer.js";
import { fixtureCatalog, fixtureProfile } from "./test-detection.js";

// Priced in the fixture catalog: haiku 4×1+5 = 9, gpt-6-mini 4×2+10 = 18, fable and
// gpt-6-astra 4×10+50 = 90.
let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

function choose(profiles: Profile[], override: string | null = null): string {
  return chooseSpecWriter({ profiles, catalog, override }).profile.id;
}

function codeOf(pick: () => unknown): DaemonError {
  try {
    pick();
  } catch (error) {
    return error as DaemonError;
  }
  throw new Error("expected a DaemonError");
}

describe("chooseSpecWriter", () => {
  it("takes the cheapest subscription-billed model with a pricing row", () => {
    expect(
      choose([
        fixtureProfile("fable"),
        fixtureProfile("gpt-6-mini", { harness: "codex" }),
        fixtureProfile("gpt-6-astra", { harness: "codex" }),
      ]),
    ).toBe("codex:gpt-6-mini:native");
  });

  it("puts Claude Code first when two profiles cost the same", () => {
    expect(
      choose([fixtureProfile("gpt-6-astra", { harness: "codex" }), fixtureProfile("fable")]),
    ).toBe("claude-code:fable:native");
  });

  it("never picks a credits-billed model, however cheap", () => {
    expect(
      choose([
        fixtureProfile("haiku", { billing: "credits" }),
        fixtureProfile("gpt-6-mini", { harness: "codex" }),
      ]),
    ).toBe("codex:gpt-6-mini:native");
  });

  it("skips everything agn cannot bill to a subscription or price", () => {
    const skipped: Profile[] = [
      fixtureProfile("haiku", { billing: "api-key" }),
      fixtureProfile("haiku", { billing: "local" }),
      { ...fixtureProfile("haiku", { billing: "unknown" }), evidence: "unknown-plan" },
      { ...fixtureProfile("haiku"), available: false },
      // The default profile resolves to whatever the harness picks, which has no row.
      fixtureProfile(null),
      fixtureProfile("a-model-the-catalog-never-heard-of"),
    ];
    expect(choose([...skipped, fixtureProfile("fable")])).toBe("claude-code:fable:native");
    const error = codeOf(() => choose(skipped));
    expect(error.code).toBe("spec-writer-unavailable");
    expect(error.message).toBe("no subscription-billed agent can write specs on this machine");
    expect(error.hint).toContain("spec_writer: <profile id> in ~/.agnostic/config.yaml");
  });

  it("takes the profile spec_writer names, even one billed on credits", () => {
    const profiles = [fixtureProfile("haiku", { billing: "credits" }), fixtureProfile("fable")];
    expect(choose(profiles, "claude-code:haiku:native")).toBe("claude-code:haiku:native");
  });

  it("says which key to fix when spec_writer names something that is not here", () => {
    const error = codeOf(() => choose([fixtureProfile("fable")], "codex:gpt-6-mini:native"));
    expect(error.code).toBe("spec-writer-unavailable");
    expect(error.message).toBe(
      "spec_writer in config.yaml names codex:gpt-6-mini:native, which is not available now",
    );
    expect(error.hint).toContain("spec_writer");
  });

  it("refuses a named profile that is present but not available", () => {
    const unavailable = { ...fixtureProfile("fable"), available: false };
    const error = codeOf(() => choose([unavailable], unavailable.id));
    expect(error.code).toBe("spec-writer-unavailable");
    expect(error.message).toBe(
      `spec_writer in config.yaml names ${unavailable.id}, which is not available now`,
    );
  });

  it("refuses a named profile on a harness with no headless form", () => {
    const aider: Profile = {
      ...fixtureProfile(null, { harness: "aider" }),
      tier: 2,
    };
    expect(codeOf(() => choose([aider], aider.id)).code).toBe("spec-writer-unavailable");
  });

  it("refuses a named profile on a local route, which has no headless form", () => {
    const local: Profile = {
      ...fixtureProfile("fable"),
      id: "claude-code:fable:local",
      route: "local",
    };
    const error = codeOf(() => choose([local], local.id));
    expect(error.code).toBe("spec-writer-unavailable");
    expect(error.message).toBe(
      "spec_writer in config.yaml names claude-code:fable:local, which runs on a local server",
    );
    expect(error.hint).toContain("cannot write specs");
  });

  it("reports the price it ranked on, so a tie is visible", () => {
    const choice: SpecWriterChoice = chooseSpecWriter({
      profiles: [fixtureProfile("fable")],
      catalog,
      override: null,
    });
    expect(choice).toEqual({ profile: fixtureProfile("fable"), price: 90 });
  });
});
