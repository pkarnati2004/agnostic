import { fileURLToPath } from "node:url";
import type { HarnessId } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { detectLogin } from "./detect-login.js";
import { harnessDefinition } from "./harness-list.js";

const HOMES = fileURLToPath(new URL("../../../tests/fixtures/home", import.meta.url));

function login(harness: HarnessId, home: string) {
  return detectLogin(harnessDefinition(harness), `${HOMES}/${home}`);
}

describe("detectLogin", () => {
  it("reads a Claude Code account as a subscription", async () => {
    expect(await login("claude-code", "claude-oauth")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
  });

  it("says unknown for Claude Code without an account in the file", async () => {
    // macOS keeps the OAuth account in the Keychain, so the file cannot prove a logged-out state.
    expect(await login("claude-code", "claude-no-oauth")).toEqual({
      state: "unknown",
      billing: "unknown",
    });
    expect(await login("claude-code", "empty")).toEqual({ state: "unknown", billing: "unknown" });
  });

  it("tells a ChatGPT login from an API key for Codex", async () => {
    expect(await login("codex", "codex-chatgpt")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    expect(await login("codex", "codex-api-key")).toEqual({
      state: "logged-in",
      billing: "api-key",
    });
  });

  it("says logged out when the only credential store is not there", async () => {
    expect(await login("codex", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
    expect(await login("pi", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
    expect(await login("opencode", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
  });

  it("knows Pi and OpenCode are logged in but not how they are billed", async () => {
    expect(await login("pi", "pi-auth")).toEqual({ state: "logged-in", billing: "unknown" });
    expect(await login("opencode", "opencode-auth")).toEqual({
      state: "logged-in",
      billing: "unknown",
    });
  });

  it("says unknown for an auth file the harness wrote but never filled in", async () => {
    expect(await login("pi", "empty-auth")).toEqual({ state: "unknown", billing: "unknown" });
    expect(await login("opencode", "empty-auth")).toEqual({ state: "unknown", billing: "unknown" });
  });

  it("never throws on a file it cannot parse", async () => {
    for (const harness of ["claude-code", "codex", "pi", "opencode"] as HarnessId[]) {
      expect(await login(harness, "malformed")).toEqual({ state: "unknown", billing: "unknown" });
    }
  });

  it("says unknown for a harness with no auth file to read", async () => {
    expect(await login("aider", "empty")).toEqual({ state: "unknown", billing: "unknown" });
  });

  it("reads the four promoted rows' own auth file the same generic way Pi and OpenCode use", async () => {
    for (const harness of ["gemini", "grok", "kimi", "cursor-agent"] as HarnessId[]) {
      expect(await login(harness, "family-auth")).toEqual({
        state: "logged-in",
        billing: "unknown",
      });
      expect(await login(harness, "empty")).toEqual({ state: "logged-out", billing: "unknown" });
      expect(await login(harness, "family-malformed")).toEqual({
        state: "unknown",
        billing: "unknown",
      });
    }
  });
});
