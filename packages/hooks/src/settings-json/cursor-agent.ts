import type { HookStatus } from "@agnostic/core";
import { z } from "zod";
import {
  type HookEventParser,
  type HookPayload,
  type HookUsage,
  parseHookEvent,
} from "../hook-event-parser.js";
import type { HookInstaller } from "../hook-installer.js";
import { type SettingsJsonMember, settingsJsonInstaller } from "./member.js";

/**
 * Ported from Orca's Cursor hook service and listener (`src/main/cursor/hook-service.ts`,
 * `hook-events.ts`, `src/shared/agent-hook-listener/providers/cursor-events.ts`).
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/**
 * Cursor's own events, in its camelCase spelling. The gating ones - `preToolUse`,
 * `beforeShellExecution`, `beforeMCPExecution` - are deliberately not installed: Cursor reads a
 * permission answer off the hook's stdout, and agn reports status rather than answering for the
 * user. The cost is that a Cursor permission prompt shows as running until the user answers it.
 */
const EVENTS = [
  { event: "beforeSubmitPrompt" },
  { event: "stop" },
  { event: "postToolUse" },
  { event: "afterAgentResponse" },
];

/** Cursor fails a hook closed when it writes nothing, so every event agn installs answers. */
const REPLIES = {
  beforeSubmitPrompt: '{"continue":true}',
  stop: "{}",
  postToolUse: "{}",
  afterAgentResponse: "{}",
};

const cursorAgentMember: SettingsJsonMember = {
  harness: "cursor-agent",
  events: EVENTS,
  layout: "cursor",
  timeout: 5,
  reply: REPLIES,
  verify: null,
  userStatusLine: null,
};

export const cursorAgentInstaller: HookInstaller = settingsJsonInstaller(cursorAgentMember);

const Tokens = z.number().int().nonnegative().catch(0);

/**
 * What Cursor's `stop` payload says the turn spent. Cursor writes no tokens to disk, so this is
 * the only count there is. Verified live 2026-10-01 against cursor-agent 2026.10.01-14929f9: the
 * four counts are top-level fields, and there is no cost and no limit on the payload. The rest of
 * the payload, `user_email` included, is read by nothing and stored nowhere.
 */
const StopPayloadSchema = z.looseObject({
  generation_id: z.string().nullish(),
  model: z.string().nullish(),
  input_tokens: Tokens.optional(),
  output_tokens: Tokens.optional(),
  cache_read_tokens: Tokens.optional(),
  cache_write_tokens: Tokens.optional(),
});

/** Cursor names its session `conversation_id` and its directory `workspace_roots`, no `cwd`. */
export const cursorAgentParser: HookEventParser = {
  harness: "cursor-agent",
  parse: (payload, eventHint) =>
    parseHookEvent(payload, statusOf, {
      eventHint,
      sessionKeys: ["conversation_id"],
      cwdKeys: ["workspace_roots"],
      usage: stopUsage(payload),
    }),
};

/**
 * The tokens on a `stop` payload, or null: a payload carrying no count at all reported none, and
 * one with no `generation_id` has no key a repeat delivery could be recognised by.
 */
function stopUsage(payload: unknown): HookUsage | null {
  const parsed = StopPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const stop = parsed.data;
  const counts = [
    stop.input_tokens,
    stop.output_tokens,
    stop.cache_read_tokens,
    stop.cache_write_tokens,
  ];
  if (!stop.generation_id || counts.every((count) => count === undefined)) {
    return null;
  }
  return {
    model: pinnedModel(stop.model),
    tokensInput: stop.input_tokens ?? 0,
    tokensOutput: stop.output_tokens ?? 0,
    tokensCacheRead: stop.cache_read_tokens ?? null,
    tokensCacheWrite: stop.cache_write_tokens ?? null,
    // Cursor reports the cached part inside its input figure, as the OpenAI-shaped APIs do.
    inputIncludesCacheRead: true,
    ref: `cursor-agent:${stop.generation_id}`,
  };
}

/** Cursor writes `model: "default"` when the profile pins none, which names nothing to price. */
function pinnedModel(model: string | null | undefined): string | null {
  const name = model?.trim() ?? "";
  return name === "" || name === "default" ? null : name;
}

function statusOf(event: HookPayload): HookStatus | null {
  switch (event.hook_event_name) {
    case "beforeSubmitPrompt":
    case "postToolUse":
    case "afterAgentResponse":
      return "running";
    case "stop":
      return "waiting";
    default:
      return null;
  }
}
