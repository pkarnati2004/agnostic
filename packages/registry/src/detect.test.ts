import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectHarnesses, type HarnessStatus } from "./detect.js";
import { harnesses } from "./harness-list.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures", import.meta.url));

function detect(pathCase: string, homeCase: string, timeouts?: Record<string, number>) {
  return detectHarnesses({
    env: { PATH: `${FIXTURES}/bin/${pathCase}` },
    home: `${FIXTURES}/home/${homeCase}`,
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

  it("falls back to the seed when the harness has no list command to answer with", async () => {
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
});
