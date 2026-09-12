import { isAbsolute } from "node:path";
import type { HarnessId, HookStatus } from "@agnostic/core";
import { z } from "zod";
import { HooksError } from "./error.js";

/** `status: null` is a payload we understand that means no transition, such as `SessionStart`. */
export type ParsedHook = {
  event: string;
  status: HookStatus | null;
  sessionId: string | null;
  cwd: string | null;
};

export interface HookEventParser {
  harness: HarnessId;
  parse(payload: unknown): ParsedHook;
}

/** The fields every harness we install hooks for puts in its payload; the rest is kept and unread. */
const HookPayloadSchema = z.looseObject({
  hook_event_name: z.string().min(1),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  tool_name: z.string().optional(),
  notification_type: z.string().optional(),
});

export type HookPayload = z.infer<typeof HookPayloadSchema>;

const SESSION_ID_MAX_LENGTH = 512;

/** The one shape check every parser runs, plus the two fields the daemon identifies a task by. */
export function parseHookEvent(
  payload: unknown,
  statusOf: (event: HookPayload) => HookStatus | null,
): ParsedHook {
  const parsed = HookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HooksError("that hook payload has no event name", {
      code: "hook-payload-invalid",
      hint: "A hook payload is a JSON object with a `hook_event_name` string.",
      cause: parsed.error,
    });
  }
  const event = parsed.data;
  return {
    event: event.hook_event_name,
    status: statusOf(event),
    sessionId: usableSessionId(event.session_id),
    // A relative cwd would match the wrong task, so only an absolute path is worth keeping.
    cwd: event.cwd !== undefined && isAbsolute(event.cwd) ? event.cwd : null,
  };
}

/**
 * The rule `agn resume` needs: an id it can pass to a harness as an argument. A leading dash would
 * read as a flag and control characters would reach the terminal raw.
 */
function usableSessionId(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
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
