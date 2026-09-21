import type { HarnessId } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { HarnessDefinition, HookMechanism } from "./harness-definition.js";
import { harnessSupport } from "./harness-support.js";

const HOOKS: HookMechanism = { container: "hooks-dir", dir: ".stub/hooks" };

/** A definition with every field a real row carries, so only `hooks` and `transcriptsDir` move. */
function stub(over: Partial<HarnessDefinition>): HarnessDefinition {
  return {
    id: "stub" as HarnessId,
    name: "Stub",
    binary: "stub",
    aliases: [],
    processNames: ["stub"],
    launch: [],
    headless: null,
    prompt: { kind: "type-after-start" },
    modelFlag: null,
    modelSource: null,
    routes: ["native"],
    resume: null,
    sessionCapture: null,
    hooks: null,
    authFile: null,
    planSource: null,
    transcriptsDir: null,
    tier: 1,
    ...over,
  };
}

describe("harnessSupport", () => {
  it("is full when a hook makes status live and a transcript directory makes tokens countable", () => {
    expect(harnessSupport(stub({ hooks: HOOKS, transcriptsDir: ".stub/sessions" }))).toBe("full");
  });

  it("is status when a harness is hooked but agn reads no transcript for it", () => {
    expect(harnessSupport(stub({ hooks: HOOKS, transcriptsDir: null }))).toBe("status");
  });

  it("is basic when there is no hook, whatever the transcript directory says", () => {
    expect(harnessSupport(stub({ hooks: null, transcriptsDir: null }))).toBe("basic");
    // A transcript directory agn never got to by a hook is not enough on its own.
    expect(harnessSupport(stub({ hooks: null, transcriptsDir: ".stub/sessions" }))).toBe("basic");
  });

  it("is basic for an id agn knows nothing about, which the registry never hooks", () => {
    expect(harnessSupport(stub({ id: "other:mytool" as HarnessId, hooks: null }))).toBe("basic");
  });
});
