// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import { isAbsolute } from "node:path";
import type { HookStatus } from "@agnostic/core";
import { type HookEventParser, type HookPayload, parseHookEvent } from "../hook-event-parser.js";

/** Each asks its question through a tool call, and neither spells the name the same way twice. */
const QUESTION_TOOL: Record<"pi" | "omp", string> = { pi: "askuserquestion", omp: "ask" };

export function piFamilyParser(harness: "pi" | "omp"): HookEventParser {
  // Pi resumes from the transcript file it reports; OMP resumes by the id in the same payload.
  const sessionKeys = harness === "pi" ? ["session_file"] : ["session_id"];
  const question = QUESTION_TOOL[harness];
  return {
    harness,
    parse: (payload) => {
      const parsed = parseHookEvent(payload, (event) => statusOf(event, question), { sessionKeys });
      // A transcript path pi has not written yet, or a relative one, resumes nothing.
      return harness === "pi" && parsed.sessionId !== null && !isAbsolute(parsed.sessionId)
        ? { ...parsed, sessionId: null }
        : parsed;
    },
  };
}

/**
 * A turn runs from `agent_start` to `agent_end`, which is waiting rather than done because the
 * user is who ends a task. The two events that block on the user in the middle of a turn are the
 * question tool and, on Pi, the modal the `ui_prompt` pair frames.
 */
function statusOf(event: HookPayload, question: string): HookStatus | null {
  switch (event.hook_event_name) {
    case "before_agent_start":
    case "agent_start":
    case "tool_execution_end":
    case "message_end":
    case "tool_approval_resolved":
      return "running";
    case "tool_call":
    case "tool_execution_start":
      return normalized(event.tool_name) === question ? "waiting" : "running";
    case "agent_end":
    case "ui_prompt_start":
    case "tool_approval_requested":
      return "waiting";
    case "ui_prompt_end":
      return event.is_idle === true ? "waiting" : "running";
    default:
      return null;
  }
}

/** `ask_user_question` and `AskUserQuestion` are the same tool, so only the letters are compared. */
function normalized(toolName: string | undefined): string {
  return (toolName ?? "").replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}
