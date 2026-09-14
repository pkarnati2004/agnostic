import type { Catalog } from "@agnostic/catalog";
import type { HarnessId, Profile } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { fixtureCatalog, fixtureProfile } from "./test-detection.js";
import { worthTryingCandidates } from "./worth-trying-candidates.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

const installed = new Set<HarnessId>(["claude-code"]);
const onPro = { claude: "pro" } as const;

function enableFor(candidates: { profile: Profile; enable: string }[], id: string): string | null {
  return candidates.find((candidate) => candidate.profile.id === id)?.enable ?? null;
}

describe("worthTryingCandidates", () => {
  it("names the install command for a harness that is not here", () => {
    const candidates = worthTryingCandidates(catalog, [], installed, onPro);
    expect(enableFor(candidates, "codex:gpt-6-astra:native")).toBe("npm i -g @openai/codex");
  });

  it("names the key a gateway route needs", () => {
    const candidates = worthTryingCandidates(catalog, [], installed, onPro);
    expect(enableFor(candidates, "claude-code:kimi-k2.6:anthropic-gateway")).toBe(
      "export MOONSHOT_API_KEY=<your key>",
    );
  });

  it("names the plan a model needs when the user's own plan does not carry it", () => {
    const candidates = worthTryingCandidates(catalog, [], installed, onPro);
    expect(enableFor(candidates, "claude-code:opus:native")).toBe(
      "upgrade your claude plan: opus is unavailable on pro",
    );
    // Fable is metered on Pro rather than out of reach, which is still a step the user can take.
    expect(enableFor(candidates, "claude-code:fable:native")).toBe(
      "upgrade your claude plan: fable is credits on pro",
    );
  });

  it("says nothing about a model the user's plan already includes", () => {
    const onMax = worthTryingCandidates(catalog, [], installed, { claude: "max20" });
    expect(enableFor(onMax, "claude-code:fable:native")).toBeNull();
    // Nor about a plan the catalog has never heard of: agn does not guess what it includes.
    const unknownPlan = worthTryingCandidates(catalog, [], installed, { claude: "ultra" });
    expect(enableFor(unknownPlan, "claude-code:opus:native")).toBeNull();
  });

  it("leaves out what this machine can already run, and what agn would not suggest", () => {
    const available: Profile[] = [{ ...fixtureProfile("opus"), id: "claude-code:opus:native" }];
    const candidates = worthTryingCandidates(catalog, available, installed, onPro);
    expect(enableFor(candidates, "claude-code:opus:native")).toBeNull();

    const legacy = {
      ...catalog,
      models: catalog.models.map((row) =>
        row.model === "gpt-6-astra" ? { ...row, legacy: true } : row,
      ),
    };
    const withoutLegacy = worthTryingCandidates(legacy, [], installed, onPro);
    expect(enableFor(withoutLegacy, "codex:gpt-6-astra:native")).toBeNull();
  });
});
