import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Billing } from "@agnostic/core";
import { z } from "zod";
import type { HarnessDefinition, LoginState } from "./harness-definition.js";

export type LoginDetection = { state: LoginState; billing: Billing };

const UNKNOWN: LoginDetection = { state: "unknown", billing: "unknown" };
const LOGGED_OUT: LoginDetection = { state: "logged-out", billing: "unknown" };

const ClaudeAuthSchema = z.looseObject({ oauthAccount: z.looseObject({}).optional() });
const CodexAuthSchema = z.looseObject({
  tokens: z.looseObject({}).nullish(),
  OPENAI_API_KEY: z.string().min(1).nullish(),
});
const AnyAuthSchema = z.record(z.string(), z.unknown());

/** A missing file and an unreadable one mean different things, so the reader keeps them apart. */
type AuthFile = { found: false } | { found: true; contents: unknown };

/**
 * Reads the harness's own auth file. `unknown` whenever the file cannot decide: Claude Code keeps
 * its OAuth account in the macOS Keychain, so a `.claude.json` without one proves nothing.
 */
export async function detectLogin(def: HarnessDefinition, home: string): Promise<LoginDetection> {
  if (!def.authFile) {
    return UNKNOWN;
  }
  const file = await readAuthFile(join(home, def.authFile));
  if (def.id === "claude-code") {
    return claudeLogin(file);
  }
  if (!file.found) {
    // Every other harness keeps its credentials in this file alone, so missing means logged out.
    return LOGGED_OUT;
  }
  if (def.id === "codex") {
    return codexLogin(file.contents);
  }
  // An empty object is a file the harness wrote but never filled in; it proves no login.
  const auth = AnyAuthSchema.safeParse(file.contents);
  return auth.success && Object.keys(auth.data).length > 0
    ? { state: "logged-in", billing: "unknown" }
    : UNKNOWN;
}

function claudeLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return UNKNOWN;
  }
  const auth = ClaudeAuthSchema.safeParse(file.contents);
  return auth.success && auth.data.oauthAccount
    ? { state: "logged-in", billing: "subscription" }
    : UNKNOWN;
}

function codexLogin(contents: unknown): LoginDetection {
  const auth = CodexAuthSchema.safeParse(contents);
  if (!auth.success) {
    return UNKNOWN;
  }
  if (auth.data.tokens) {
    return { state: "logged-in", billing: "subscription" };
  }
  return auth.data.OPENAI_API_KEY ? { state: "logged-in", billing: "api-key" } : UNKNOWN;
}

async function readAuthFile(path: string): Promise<AuthFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { found: false };
  }
  try {
    return { found: true, contents: JSON.parse(text) };
  } catch {
    // The file is there and unusable: that is a state the reader reports as unknown, not absent.
    return { found: true, contents: undefined };
  }
}
