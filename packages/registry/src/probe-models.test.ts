import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { harnessDefinition } from "./harness-list.js";
import { probeModels } from "./probe-models.js";

const BIN = fileURLToPath(new URL("../../../tests/fixtures/bin", import.meta.url));

const tier1 = ["claude-code", "codex", "pi", "opencode"] as const;

/** The rows the catalog holds for Claude Code; every other harness is probed with none. */
const CLAUDE_SEEDS = ["fable", "opus", "sonnet", "haiku"];
const CODEX_SEEDS = ["gpt-6-astra", "gpt-5.6-sol"];

function stub(harness: (typeof tier1)[number], dir: string) {
  const def = harnessDefinition(harness);
  return { def, path: `${BIN}/${dir}/${def.binary}` };
}

describe("probeModels", () => {
  it("asks each tier-1 harness for its own list", async () => {
    for (const harness of tier1) {
      const { def, path } = stub(harness, "probe");
      const result = await probeModels(def, { path, seeds: [] });
      expect(result.origin).toBe("probe");
      expect(result.error).toBeNull();
      expect(result.models.length).toBeGreaterThan(0);
    }
  });

  it("sends Claude Code the list_models request on stdin", async () => {
    const { def, path } = stub("claude-code", "probe");
    const result = await probeModels(def, { path, seeds: [] });
    // The stub copies stdin to stderr, and stdout still answers, so the payload is what we sent.
    expect(result.models).toEqual(["fable", "opus", "sonnet", "haiku"]);
  });

  it("falls back to the seed rows it was given when the harness fails, and says why", async () => {
    const { def, path } = stub("claude-code", "probe-fails");
    const result = await probeModels(def, { path, seeds: CLAUDE_SEEDS });
    expect(result.origin).toBe("seed");
    expect(result.models).toEqual(CLAUDE_SEEDS);
    expect(result.error).toContain("boom");
  });

  it("reports no models at all when the harness fails and has no seed", async () => {
    const { def, path } = stub("pi", "probe-fails");
    const result = await probeModels(def, { path, seeds: [] });
    expect(result).toEqual({ models: [], origin: "none", error: expect.stringContaining("boom") });
  });

  it("gives up on a harness that hangs", async () => {
    const started = Date.now();
    const { def, path } = stub("codex", "probe-hangs");
    const result = await probeModels(def, { path, timeoutMs: 300, seeds: CODEX_SEEDS });
    expect(result.origin).toBe("seed");
    expect(result.error).toContain("timed out");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("treats an empty answer and a version line as no answer", async () => {
    for (const dir of ["probe-empty", "tier1"]) {
      const { def, path } = stub("codex", dir);
      const result = await probeModels(def, { path, seeds: CODEX_SEEDS });
      expect(result.origin).toBe("seed");
      expect(result.error).toContain("listed no models");
    }
  });

  it("names the binary when it is not there", async () => {
    const { def } = stub("codex", "none");
    const result = await probeModels(def, { path: `${BIN}/none/codex`, seeds: CODEX_SEEDS });
    expect(result.origin).toBe("seed");
    expect(result.error).toContain("codex");
  });

  it("does not spawn anything for a harness with no list command", async () => {
    const def = harnessDefinition("aider");
    const result = await probeModels(def, { path: "/definitely/not/here/aider", seeds: [] });
    expect(result).toEqual({ models: [], origin: "none", error: expect.stringContaining("Aider") });
  });

  it("refuses to parse a flood", async () => {
    const { def, path } = stub("codex", "probe-flood");
    const result = await probeModels(def, { path, timeoutMs: 10_000, seeds: CODEX_SEEDS });
    expect(result.origin).toBe("seed");
    expect(result.error).toContain("1 MiB");
  });
});
