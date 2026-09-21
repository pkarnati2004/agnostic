import { mkdir, writeFile } from "node:fs/promises";
import { emptyCatalog } from "@agnostic/catalog";
import {
  agPaths,
  defaultPreferences,
  type Profile,
  type RecommendResponse,
  writePreferences,
} from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "../detection-cache.js";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection, fixtureProfile } from "../test-detection.js";

let daemon: TestDaemon;

afterEach(() => daemon.close());

const byKey: Profile = {
  id: "codex:gpt-6-astra:native",
  harness: "codex",
  model: "gpt-6-astra",
  route: "native",
  billing: "api-key",
  available: true,
  evidence: "env",
  tier: 1,
};

function detection(): Detection {
  return { ...fixtureDetection(), profiles: [fixtureProfile(null), byKey] };
}

async function ask(body: Record<string, unknown>): Promise<Response> {
  return daemon.request("/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /recommend", () => {
  it("answers with the recommendation and records that it was made", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    const response = await ask({ repoId: repo.id, prompt: "fix the flaky auth test" });
    expect(response.status).toBe(200);
    const { recommendation } = (await response.json()) as RecommendResponse;
    expect(recommendation.recommended.profileId).toBe(byKey.id);
    expect(recommendation.taskClass.intent).toBe("debug");
    expect(recommendation.riskNote).toContain("touches auth");

    const made = daemon.ledger.events
      .after(0)
      .filter((event) => event.kind === "recommendation.made");
    expect(made).toHaveLength(1);
    expect(made[0]?.repoId).toBe(repo.id);
    expect(made[0]?.taskId).toBeUndefined();
    expect(made[0]?.payload).toMatchObject({ chosenProfileId: byKey.id });
  });

  it("records nothing for a dry run, which is what the workspace asks on every pause", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    const response = await ask({
      repoId: repo.id,
      prompt: "fix the flaky auth test",
      dryRun: true,
    });

    expect(response.status).toBe(200);
    const { recommendation } = (await response.json()) as RecommendResponse;
    expect(recommendation.recommended.profileId).toBe(byKey.id);
    expect(daemon.ledger.events.after(0).filter((e) => e.kind === "recommendation.made")).toEqual(
      [],
    );
  });

  it("never names a metered profile when the caller asks for subscriptions only", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    const response = await ask({
      repoId: repo.id,
      prompt: "fix the flaky auth test",
      subscriptionsOnly: true,
    });
    const { recommendation } = (await response.json()) as RecommendResponse;
    expect(recommendation.recommended.profileId).toBe("claude-code:default:native");
    expect(recommendation.recommended.reason).toBe("no evidence; using your default");
    expect(recommendation.alternative).toBeNull();
  });

  it("takes the intent the caller gave over the one the prompt suggests", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    const response = await ask({
      repoId: repo.id,
      prompt: "why is the login flow slow",
      intent: "debug",
    });
    const { recommendation } = (await response.json()) as RecommendResponse;
    expect(recommendation.taskClass.intent).toBe("debug");
    expect(recommendation.taskClass.automaticIntent).toBe("research");
  });

  it("refuses a field it does not know", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    const response = await ask({ repoId: repo.id, prompt: "ship it", optimise: "quality" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "request-invalid",
    );
  });

  it("uses the repo's own default profile and preferences", async () => {
    daemon = await createTestDaemon({
      catalog: emptyCatalog(),
      detect: () => Promise.resolve(detection()),
    });
    const repo = await daemon.addRepo({ defaultProfile: byKey.id });
    await writePreferences(repo.path, { ...defaultPreferences(), optimize: "cost" });
    const response = await ask({ repoId: repo.id, prompt: "ship it" });
    const { recommendation } = (await response.json()) as RecommendResponse;
    // Nothing to score on, so `default_profile` from .ag/agnostic.yaml decides.
    expect(recommendation.recommended.profileId).toBe(byKey.id);
  });

  it("still answers when there is no catalog to score against", async () => {
    daemon = await createTestDaemon({
      catalog: emptyCatalog(),
      detect: () => Promise.resolve(detection()),
    });
    const repo = await daemon.addRepo();
    const response = await ask({ repoId: repo.id, prompt: "ship it" });
    expect(response.status).toBe(200);
    const { recommendation } = (await response.json()) as RecommendResponse;
    expect(recommendation.recommended.evidence).toBe("none");
    expect(recommendation.worthTrying).toBeNull();
  });

  it("refuses with the malformed-file error rather than defaulting over a bad preferences.yaml", async () => {
    daemon = await createTestDaemon({ detect: () => Promise.resolve(detection()) });
    const repo = await daemon.addRepo();
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(
      agPaths(repo.path).preferencesYaml,
      "optimize: balanced\nrisk_rules:\n  - area: auth\n   keywords: [auth]\n",
      "utf8",
    );
    const response = await ask({ repoId: repo.id, prompt: "ship it" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "ag-file-malformed",
    );
  });

  it("refuses with no-eligible-profile when subscriptions-only leaves nothing to run on", async () => {
    // Only an api-key profile on this machine, so subscriptions_only rules out everything.
    daemon = await createTestDaemon({
      detect: () => Promise.resolve({ ...detection(), profiles: [byKey] }),
    });
    const repo = await daemon.addRepo();
    const response = await ask({ repoId: repo.id, prompt: "ship it", subscriptionsOnly: true });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; hint?: string } };
    expect(body.error.code).toBe("no-eligible-profile");
    expect(body.error.hint).toContain("agn doctor");
  });
});
