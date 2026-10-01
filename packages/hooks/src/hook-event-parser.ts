import { isAbsolute } from "node:path";
import type { HarnessId, HookStatus } from "@agnostic/core";
import { z } from "zod";
import { HooksError } from "./error.js";

/**
 * What a hook payload said this turn spent, for a harness that writes its tokens nowhere else.
 * The daemon prices it and records it; the parser reads the numbers and nothing more.
 */
export type HookUsage = {
  model: string | null;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  /** True when the harness counts cache reads inside its input figure; the daemon splits them
   * before storing or pricing. */
  inputIncludesCacheRead: boolean;
  /** The ledger's dedupe key, so the same payload sent twice records one row. */
  ref: string;
};

/** `status: null` is a payload we understand that means no transition, such as `SessionStart`. */
export type ParsedHook = {
  event: string;
  status: HookStatus | null;
  sessionId: string | null;
  cwd: string | null;
  /** Null for every harness that writes its tokens to a file agn reads instead. */
  usage: HookUsage | null;
};

export interface HookEventParser {
  harness: HarnessId;
  /** The hint is the event agn installed the hook under, for a harness that sends no event name. */
  parse(payload: unknown, eventHint?: string): ParsedHook;
}

/** The fields the harnesses we install hooks for put in a payload; the rest is kept and unread. */
const HookPayloadSchema = z.looseObject({
  hook_event_name: z.string().min(1).optional(),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  tool_name: z.string().optional(),
  notification_type: z.string().optional(),
  /** Droid says what it is waiting for in prose rather than in a notification type. */
  message: z.string().optional(),
});

export type HookPayload = z.infer<typeof HookPayloadSchema>;

export type ParseOptions = {
  eventHint?: string;
  /** What this payload spent, for the one harness whose hook is its only usage source. */
  usage?: HookUsage | null;
  /** The keys the event name may be under, in order. Grok spells it `hookEventName`. */
  eventKeys?: string[];
  /** In order of preference; the first usable value wins. Defaults to Claude's `session_id`. */
  sessionKeys?: string[];
  /** A key may name an array of directories, such as Cursor's `workspace_roots`. */
  cwdKeys?: string[];
};

const SESSION_ID_MAX_LENGTH = 512;

/** The one shape check every parser runs, plus the two fields the daemon identifies a task by. */
export function parseHookEvent(
  payload: unknown,
  statusOf: (event: HookPayload) => HookStatus | null,
  opts: ParseOptions = {},
): ParsedHook {
  const parsed = HookPayloadSchema.safeParse(payload);
  const event = parsed.success
    ? (payloadString(parsed.data, opts.eventKeys ?? ["hook_event_name"]) ?? usableHint(opts))
    : undefined;
  if (!parsed.success || event === undefined) {
    throw new HooksError("that hook payload has no event name", {
      code: "hook-payload-invalid",
      hint: "A hook payload is a JSON object with a `hook_event_name` string.",
      ...(parsed.success ? {} : { cause: parsed.error }),
    });
  }
  return {
    event,
    // The hint stands in for the name the payload did not carry, for the status table as well.
    status: statusOf({ ...parsed.data, hook_event_name: event }),
    sessionId: firstSessionId(parsed.data, opts.sessionKeys ?? ["session_id"]),
    cwd: firstDirectory(parsed.data, opts.cwdKeys ?? ["cwd"]),
    usage: opts.usage ?? null,
  };
}

/** The hook script sends the header whether or not it was given an event, so blank is no hint. */
function usableHint(opts: ParseOptions): string | undefined {
  const hint = opts.eventHint?.trim();
  return hint === undefined || hint === "" ? undefined : hint;
}

function firstSessionId(payload: HookPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    const usable = typeof value === "string" ? usableSessionId(value) : null;
    if (usable !== null) {
      return usable;
    }
  }
  return null;
}

/** A relative cwd would match the wrong task, so only an absolute path is worth keeping. */
function firstDirectory(payload: HookPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    const directory = Array.isArray(value) ? value[0] : value;
    if (typeof directory === "string" && isAbsolute(directory)) {
      return directory;
    }
  }
  return null;
}

/** The value of the first of these keys the payload holds a non-empty string under. */
export function payloadString(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

/** Tool names differ by case and punctuation between releases; `ask_user` and `AskUser` are one. */
export function isTool(name: string | undefined, canonical: string): boolean {
  return name !== undefined && comparableToolName(name) === comparableToolName(canonical);
}

/** The form two spellings of one tool share: `AskUser`, `ask_user` and `Ask-User` all reduce here. */
export function comparableToolName(name: string): string {
  return name.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * The rule `agn resume` needs: an id it can pass to a harness as an argument. A leading dash would
 * read as a flag and control characters would reach the terminal raw.
 */
function usableSessionId(value: string): string | null {
  const trimmed = value.trim();
  const usable =
    trimmed.length > 0 &&
    trimmed.length <= SESSION_ID_MAX_LENGTH &&
    !trimmed.startsWith("-") &&
    ![...trimmed].some((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
  return usable ? trimmed : null;
}
