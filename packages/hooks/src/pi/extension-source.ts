import type { AgnosticPaths } from "@agnostic/core";
import { hookPostSource } from "../hook-post-source.js";
import { AGN_MANAGED_MARKER } from "../managed-file.js";

/**
 * Pi has no hook config: an extension in its own directory registers `pi.on(...)` handlers inside
 * the running process. The events, the owner guard, the session metadata and the three turn rules
 * are ported from Orca's `src/main/pi/agent-status-extension-source.ts`,
 * `agent-status-handler-source.ts` and `agent-status-ui-prompt-source.ts`.
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */

/** Pi loads `.ts` through jiti, which runs the plain JavaScript below without a type check. */
export const PI_EXTENSION_FILE = "agn-status.ts";

/** Set to the pid that registered the handlers; a child pi inherits it and registers nothing. */
const OWNER_ENV = "AGN_PI_STATUS_OWNER";

export function piExtensionSource(paths: AgnosticPaths, kind: "pi" | "omp"): string {
  return [
    AGN_MANAGED_MARKER,
    `// agn's ${kind} status extension: it posts one event per turn boundary to the agn daemon.`,
    kind === "pi"
      ? 'import { existsSync, readFileSync } from "node:fs";'
      : 'import { readFileSync } from "node:fs";',
    "",
    hookPostSource(paths, `/hooks/${kind}`),
    sessionSource(kind),
    handlerSource(kind),
  ].join("\n");
}

/**
 * Pi announces the transcript path before it writes the file, so the path is reported only once
 * it is there: that first completed turn is what makes the session resumable. OMP resumes by id,
 * and reports both keys whatever the file is doing.
 */
function sessionSource(kind: "pi" | "omp"): string {
  const reported =
    kind === "pi"
      ? `function reportedSession() {
  if (typeof session.session_file !== "string") return session;
  try {
    if (existsSync(session.session_file)) return session;
  } catch {
    // An unreadable path is a path pi cannot resume from either.
  }
  return { session_id: session.session_id };
}`
      : `function reportedSession() {
  return session;
}`;
  return `let session = {};

function readSession(ctx) {
  session = {};
  try {
    const manager = ctx && ctx.sessionManager;
    const id = manager && manager.getSessionId ? manager.getSessionId() : null;
    const file = manager && manager.getSessionFile ? manager.getSessionFile() : null;
    if (typeof id === "string" && id && typeof file === "string" && file) {
      session = { session_id: id, session_file: file };
    }
  } catch {
    // A session manager that throws leaves the event without its session; the daemon still has
    // the task id in the header, and the status is worth more than the id.
  }
}

${reported}

function post(name, extra) {
  // The rejection of a promise nobody awaits ends a Node process, and this one is agn's alone.
  return postHook(name, { ...reportedSession(), cwd: process.cwd(), ...(extra || {}) }).catch(
    () => {},
  );
}
`;
}

function handlerSource(kind: "pi" | "omp"): string {
  return `export default function (pi) {
  const owner = process.env.${OWNER_ENV};
  const self = String(process.pid);
  // A child agent inherits this process's environment; only the process that claimed it posts.
  if (owner && owner !== self) return;
  process.env.${OWNER_ENV} = self;

  // Every handler runs inside pi's own turn, so nothing agn does may throw out of one: whatever
  // the host's session manager or an event object does, the turn carries on without the status.
  function on(name, handler) {
    pi.on(name, (event, ctx) => {
      try {
        handler(event, ctx);
      } catch {
        // The status agn missed costs the user one stale row; a throw here costs the turn.
      }
    });
  }

  // agent_settled and agent_end both end the same turn; the task moves to waiting once.
  let completed = false;

  function completeTurn() {
    if (completed) return;
    completed = true;
    post("agent_end");
  }
${kind === "pi" ? sessionStartHandler() : ""}
  on("before_agent_start", (_event, ctx) => {
    readSession(ctx);
    post("before_agent_start");
  });

  on("agent_start", (_event, ctx) => {
    readSession(ctx);
    completed = false;
    post("agent_start");
  });

  on("tool_call", (event, ctx) => {
    readSession(ctx);
    post("tool_call", { tool_name: event && event.toolName });
  });

  on("tool_execution_start", (event, ctx) => {
    readSession(ctx);
    post("tool_execution_start", { tool_name: event && event.toolName });
  });

  on("tool_execution_end", (event, ctx) => {
    readSession(ctx);
    post("tool_execution_end", { tool_name: event && event.toolName });
  });

  on("message_end", (event, ctx) => {
    readSession(ctx);
    if (!event || !event.message || event.message.role !== "assistant") return;
    post("message_end");
  });
${kind === "pi" ? uiPromptHandlers() : approvalHandlers()}
  on("agent_settled", (_event, ctx) => {
    readSession(ctx);
    completeTurn();
  });

  on("agent_end", (event, ctx) => {
    readSession(ctx);
    // A turn pi means to continue is not over; the next settle or end closes it.
    if (event && event.willContinue === true) return;
    completeTurn();
  });
}
`;
}

function sessionStartHandler(): string {
  return `
  on("session_start", (event, ctx) => {
    readSession(ctx);
    // /reload re-registers the running session: it is not a turn boundary.
    if (event && event.reason === "reload") return;
    post("session_start");
  });
`;
}

function uiPromptHandlers(): string {
  return `
  on("ui_prompt_start", (_event, ctx) => {
    readSession(ctx);
    post("ui_prompt_start");
  });

  on("ui_prompt_end", (_event, ctx) => {
    readSession(ctx);
    let idle = false;
    try {
      idle = ctx && typeof ctx.isIdle === "function" ? ctx.isIdle() === true : false;
    } catch {
      // A modal that switched sessions invalidates the runner; read that as still working.
    }
    post("ui_prompt_end", { is_idle: idle });
  });
`;
}

/** OMP's approval prompts are the only signal that it is parked on a permission question. */
function approvalHandlers(): string {
  return `
  on("tool_approval_requested", (event, ctx) => {
    readSession(ctx);
    post("tool_approval_requested", { tool_name: event && event.toolName });
  });

  on("tool_approval_resolved", (event, ctx) => {
    readSession(ctx);
    post("tool_approval_resolved", {
      tool_name: event && event.toolName,
      approved: Boolean(event && event.approved),
    });
  });
`;
}
