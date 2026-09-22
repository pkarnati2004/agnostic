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
    const harnesses: HarnessId[] = [
      "claude-code",
      "codex",
      "pi",
      "opencode",
      "gemini",
      "grok",
      "kimi",
      "cursor-agent",
    ];
    for (const harness of harnesses) {
      expect(await login(harness, "malformed")).toEqual({ state: "unknown", billing: "unknown" });
    }
  });

  it("says unknown for a harness with no auth file to read", async () => {
    expect(await login("aider", "empty")).toEqual({ state: "unknown", billing: "unknown" });
  });

  it("reads a Google account out of Gemini CLI's OAuth file", async () => {
    expect(await login("gemini", "gemini-oauth")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    // The file holds the OAuth triple and nothing else, so a half-written one decides nothing.
    expect(await login("gemini", "gemini-empty")).toEqual({ state: "unknown", billing: "unknown" });
    expect(await login("gemini", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
  });

  it("finds Grok's session under its issuer, or under another when there is no xAI entry", async () => {
    expect(await login("grok", "grok-subscribed")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    expect(await login("grok", "grok-alt-issuer")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
  });

  it("reads the file grok logout leaves behind as signed out, not as a fault", async () => {
    expect(await login("grok", "grok-signed-out")).toEqual({
      state: "logged-out",
      billing: "unknown",
    });
    expect(await login("grok", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
  });

  it("counts a token-less xAI entry as signed out even next to a tokenised alternate issuer", async () => {
    // Orca's rule: an `auth.x.ai` entry in the file at all rules out falling back to another
    // issuer, even when that entry carries no token of its own.
    expect(await login("grok", "grok-preferred-tokenless")).toEqual({
      state: "logged-out",
      billing: "unknown",
    });
  });

  it("reads Kimi's credentials file", async () => {
    expect(await login("kimi", "kimi-logged-in")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    expect(await login("kimi", "empty")).toEqual({ state: "logged-out", billing: "unknown" });
  });

  it("takes Kimi's word for it even past the token's expiry, unlike Grok", async () => {
    // Kimi's schema checks only for an access token; agn leaves refreshing it to the CLI.
    expect(await login("kimi", "kimi-expired")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
  });

  it("takes Cursor's auth file as proof of a login and its absence as proof of nothing", async () => {
    expect(await login("cursor-agent", "cursor-auth")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    // Cursor keeps the token in the Keychain by default, which agn does not read.
    expect(await login("cursor-agent", "empty")).toEqual({ state: "unknown", billing: "unknown" });
  });

  it("reads Cursor's other two token field names the same way", async () => {
    expect(await login("cursor-agent", "cursor-access-token")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
    expect(await login("cursor-agent", "cursor-token-alias")).toEqual({
      state: "logged-in",
      billing: "subscription",
    });
  });

  it("says unknown for a Gemini expiry that is not the number the schema expects", async () => {
    // A JSON string in place of a number is a shape doctor has not seen; it says unknown, not
    // logged-in, rather than coercing a value that will not match the runtime type it was given.
    expect(await login("gemini", "gemini-expiry-string")).toEqual({
      state: "unknown",
      billing: "unknown",
    });
  });
});
