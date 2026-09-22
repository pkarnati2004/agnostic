import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Billing, HarnessId } from "@agnostic/core";
import { z } from "zod";
import { grokSession } from "./grok-auth-file.js";
import type { HarnessDefinition, LoginState } from "./harness-definition.js";

export type LoginDetection = { state: LoginState; billing: Billing };

const UNKNOWN: LoginDetection = { state: "unknown", billing: "unknown" };
const LOGGED_OUT: LoginDetection = { state: "logged-out", billing: "unknown" };
const SUBSCRIBED: LoginDetection = { state: "logged-in", billing: "subscription" };

/** A missing file and an unreadable one mean different things, so the reader keeps them apart. */
type AuthFile = { found: false } | { found: true; contents: unknown };

const AnyAuthSchema = z.record(z.string(), z.unknown());

/** The harnesses whose auth file says more than "somebody logged in here". */
const LOGIN_READERS: Partial<Record<HarnessId, (file: AuthFile) => LoginDetection>> = {
  "claude-code": claudeLogin,
  codex: codexLogin,
  gemini: geminiLogin,
  grok: grokLogin,
  kimi: kimiLogin,
  "cursor-agent": cursorLogin,
};

/**
 * Reads the harness's own auth file, and nothing else: no Keychain and no network (ADR 016 as
 * amended). `unknown` whenever the file cannot decide - Claude Code and Cursor keep the account
 * in the macOS Keychain, so a file without one proves nothing.
 */
export async function detectLogin(def: HarnessDefinition, home: string): Promise<LoginDetection> {
  if (!def.authFile) {
    return UNKNOWN;
  }
  const file = await readAuthFile(join(home, def.authFile));
  const reader = LOGIN_READERS[def.id] ?? genericLogin;
  return reader(file);
}

/** Every other harness keeps its credentials in this file alone, so a missing one is a logout. */
function genericLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return LOGGED_OUT;
  }
  // An empty object is a file the harness wrote but never filled in; it proves no login.
  const auth = AnyAuthSchema.safeParse(file.contents);
  return auth.success && Object.keys(auth.data).length > 0
    ? { state: "logged-in", billing: "unknown" }
    : UNKNOWN;
}

const ClaudeAuthSchema = z.looseObject({ oauthAccount: z.looseObject({}).optional() });

function claudeLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return UNKNOWN;
  }
  const auth = ClaudeAuthSchema.safeParse(file.contents);
  return auth.success && auth.data.oauthAccount ? SUBSCRIBED : UNKNOWN;
}

const CodexAuthSchema = z.looseObject({
  tokens: z.looseObject({}).nullish(),
  OPENAI_API_KEY: z.string().min(1).nullish(),
});

function codexLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return LOGGED_OUT;
  }
  const auth = CodexAuthSchema.safeParse(file.contents);
  if (!auth.success) {
    return UNKNOWN;
  }
  if (auth.data.tokens) {
    return SUBSCRIBED;
  }
  return auth.data.OPENAI_API_KEY ? { state: "logged-in", billing: "api-key" } : UNKNOWN;
}

const GeminiCredentialsSchema = z.looseObject({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expiry_date: z.number(),
});

/**
 * Gemini CLI writes `oauth_creds.json` when the user signs in with a Google account and keeps
 * nothing else there, so a missing file is a logout. The account runs on the Code Assist quota;
 * the file does not say which tier, so doctor asks.
 */
function geminiLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return LOGGED_OUT;
  }
  return GeminiCredentialsSchema.safeParse(file.contents).success ? SUBSCRIBED : UNKNOWN;
}

/** A token past its expiry still means an account is there: the CLI refreshes it on start. */
function grokLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return LOGGED_OUT;
  }
  if (!AnyAuthSchema.safeParse(file.contents).success) {
    return UNKNOWN;
  }
  // `grok logout` leaves the file behind with its tokens stripped, which is a logout, not a fault.
  return grokSession(file.contents) ? SUBSCRIBED : LOGGED_OUT;
}

const KimiCredentialsSchema = z.looseObject({ access_token: z.string().min(1) });

function kimiLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return LOGGED_OUT;
  }
  return KimiCredentialsSchema.safeParse(file.contents).success ? SUBSCRIBED : UNKNOWN;
}

const CursorAuthSchema = z.looseObject({
  accessToken: z.string().min(1).nullish().catch(null),
  access_token: z.string().min(1).nullish().catch(null),
  token: z.string().min(1).nullish().catch(null),
});

/**
 * Cursor keeps the token in the Keychain by default and writes `auth.json` as the fallback, so
 * the file proves a login when it is there and proves nothing when it is not. agn never reads the
 * Keychain (ADR 002: detection runs no `security` command).
 */
function cursorLogin(file: AuthFile): LoginDetection {
  if (!file.found) {
    return UNKNOWN;
  }
  const auth = CursorAuthSchema.safeParse(file.contents);
  if (!auth.success) {
    return UNKNOWN;
  }
  const token = auth.data.accessToken ?? auth.data.access_token ?? auth.data.token;
  return token ? SUBSCRIBED : UNKNOWN;
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
