import type { AgnosticPaths } from "@agnostic/core";
import { hookPostSource } from "../hook-post-source.js";
import { AGN_MANAGED_MARKER } from "../managed-file.js";

/**
 * OpenCode loads every plugin file in its config directory and hands each one the SDK event
 * stream. The module shape, the undefined-context rule, the event table and the closing idle are
 * ported from Orca's `src/main/opencode/hook-service.ts`, `status-plugin-factory-source.ts` and
 * `status-plugin-lifecycle-source.ts`.
 *
 * MIT License, Copyright (c) Lovecast Inc.
 */
export const OPENCODE_PLUGIN_FILE = "agn-status.js";

export function opencodePluginSource(
  paths: AgnosticPaths,
  harness: "opencode" | "mimo-code",
): string {
  return [
    AGN_MANAGED_MARKER,
    `// agn's ${harness} status plugin: it posts one event per session transition to the agn daemon.`,
    'import { readFileSync } from "node:fs";',
    "",
    hookPostSource(paths, `/hooks/${harness}`),
    statusSource(),
    factorySource(harness === "opencode"),
  ].join("\n");
}

/**
 * `session.status` is the authority; `session.idle` is the deprecated spelling of the same thing.
 * A reply to a permission or a question puts the session back to work, and `session.error` is
 * recoverable, so it says nothing about the status.
 */
function statusSource(): string {
  return `function post(name, sessionID) {
  return postHook(name, { sessionID });
}

function eventName(event) {
  if (event.type === "session.status") {
    const status = event.properties && event.properties.status && event.properties.status.type;
    if (status === "busy" || status === "retry") return "SessionBusy";
    return status === "idle" ? "SessionIdle" : null;
  }
  if (event.type === "session.idle") return "SessionIdle";
  if (event.type === "permission.asked") return "PermissionRequest";
  if (event.type === "question.asked") return "AskUserQuestion";
  if (
    event.type === "permission.replied" ||
    event.type === "question.replied" ||
    event.type === "question.rejected"
  ) {
    return "SessionBusy";
  }
  return null;
}
`;
}

function factorySource(emitSessionStart: boolean): string {
  const sessionStart = emitSessionStart
    ? `        await post("SessionStart", info.id);\n`
    : `        // Mimo Code announces no session start of its own; the first busy event reports it.\n`;
  return `// The factory argument is never destructured: OpenCode calls it with no context at start,
// and a destructuring factory throws there and takes the whole CLI down with it.
export const AgnStatusPlugin = async (_ctx) => {
  // false for a session created under a parent: its work rolls up to the one the user started.
  const roots = new Map();
  let busySession = null;
  let disposed = false;

  return {
    event: async ({ event }) => {
      if (disposed || !event || !event.type) return;
      if (event.type === "session.created") {
        const info = event.properties && event.properties.info;
        if (!info || typeof info.id !== "string") return;
        roots.set(info.id, !info.parentID);
        if (info.parentID) return;
${sessionStart}        return;
      }
      const name = eventName(event);
      const sessionID = event.properties && event.properties.sessionID;
      // A session agn has never seen is posted: the plugin can load in the middle of one.
      if (name === null || roots.get(sessionID) === false) return;
      busySession = name === "SessionBusy" ? sessionID || null : null;
      await post(name, sessionID);
    },

    dispose: async () => {
      if (disposed) return;
      disposed = true;
      // An instance that closes mid-turn must not leave the task reading as running.
      if (busySession !== null) await post("SessionIdle", busySession);
    },
  };
};

// OpenCode's other loader reads the default export and rejects a module whose default has no
// server(); the named factory is what the first loader looks for. Both name one plugin.
export default {
  id: "agn-status",
  server: AgnStatusPlugin,
};
`;
}
