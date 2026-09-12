import { fileURLToPath } from "node:url";
import type { ModelRow } from "@agnostic/catalog";
import { describe, expect, it } from "vitest";
import { detectHarnesses, type HarnessStatus } from "./detect.js";
import { harnesses } from "./harness-list.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures", import.meta.url));

/** Codex is the only harness the catalog has rows for here, so Pi has nothing to fall back on. */
const MODELS: ModelRow[] = ["gpt-6-astra", "gpt-5.6-sol"].map((model) => ({
  harness: "codex",
  model,
  route: "native",
  canonical: null,
  legacy: false,
}));

function detect(pathCase: string, homeCase: string, timeouts?: Record<string, number>) {
  return detectHarnesses({
    env: { PATH: `${FIXTURES}/bin/${pathCase}` },
    home: `${FIXTURES}/home/${homeCase}`,
    models: MODELS,
    ...timeouts,
  });
}

function status(statuses: HarnessStatus[], harness: string): HarnessStatus {
  const found = statuses.find((row) => row.harness === harness);
  if (!found) {
    throw new Error(`no status for ${harness}`);
  }
  return found;
}

describe("detectHarnesses", () => {
  it("answers for every harness in table order", async () => {
    const statuses = await detect("none", "empty");
    expect(statuses.map((row) => row.harness)).toEqual(harnesses.map((def) => def.id));
    expect(statuses.every((row) => row.path === null)).toBe(true);
    expect(statuses.every((row) => row.version === null && row.models === null)).toBe(true);
  });

  it("reads version, login and model list for the tier-1 harnesses it finds", async () => {
    const statuses = await detect("probe", "codex-chatgpt");
    expect(statuses.filter((row) => row.path !== null)).toHaveLength(4);
    expect(status(statuses, "claude-code").version).toBe("2.1.0");
    expect(status(statuses, "codex").login).toBe("logged-in");
    expect(status(statuses, "codex").billing).toBe("subscription");
    // Claude Code's account lives in the Keychain, so this home cannot say either way.
    expect(status(statuses, "claude-code").login).toBe("unknown");
    for (const harness of ["claude-code", "codex", "pi", "opencode"]) {
      expect(status(statuses, harness).models?.origin).toBe("probe");
    }
    expect(status(statuses, "claude-code").models?.models).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ]);
  });

  it("leaves tier 2 at presence only", async () => {
    const statuses = await detect("alias-only", "empty");
    expect(status(statuses, "other:kimi").path).toContain("kimi-code");
    expect(status(statuses, "other:kimi").version).toBeNull();
    expect(status(statuses, "other:kimi").models).toBeNull();
    expect(status(statuses, "other:kimi").login).toBe("unknown");
  });

  it("falls back to the catalog's rows when the harness has no list command to answer with", async () => {
    const statuses = await detect("tier1", "empty");
    for (const harness of ["claude-code", "codex", "pi", "opencode"]) {
      expect(["seed", "none"]).toContain(status(statuses, harness).models?.origin);
    }
    expect(status(statuses, "codex").models?.models).toContain("gpt-6-astra");
    expect(status(statuses, "pi").models?.origin).toBe("none");
  });

  it("does not wait for a harness that hangs", async () => {
    const started = Date.now();
    const statuses = await detect("probe-hangs", "empty", {
      versionTimeoutMs: 300,
      probeTimeoutMs: 300,
    });
    expect(status(statuses, "codex").version).toBeNull();
    expect(status(statuses, "codex").models?.origin).toBe("seed");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("reads the plan each harness's own files name, and nothing for the ones with none", async () => {
    const plus = await detect("probe", "codex-plus");
    expect(status(plus, "codex").plan).toBe("plus");
    expect(status(plus, "pi").plan).toBeNull();
    expect(status(plus, "opencode").plan).toBeNull();
    const team = await detect("probe", "codex-team");
    expect(status(team, "codex").plan).toBe("business");
    const max = await detect("probe", "claude-max");
    expect(status(max, "claude-code").plan).toBe("max20");
  });

  it("says nothing about a plan when the file cannot say", async () => {
    for (const home of ["codex-chatgpt", "malformed", "empty"]) {
      const statuses = await detect("probe", home);
      expect(status(statuses, "codex").plan).toBeNull();
      expect(status(statuses, "claude-code").plan).toBeNull();
    }
  });
});
