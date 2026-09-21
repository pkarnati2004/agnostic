import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HookStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { ParsedHook } from "../hook-event-parser.js";
import { grokParser } from "./grok.js";

/**
 * The payloads come from Orca's Grok listener test (`src/shared/agent-hook-listener-grok.test.ts`,
 * MIT). Grok does not run on this machine, so these rows are unverified live.
 */
const PAYLOADS = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/grok/", import.meta.url),
);

const SESSION_ID = "019e37f4-5135-7b63-a4ab-6d13aa6bf528";

const STATUS: Array<[string, HookStatus | null]> = [
  ["session-start", null],
  ["session-start-snake", null],
  ["user-prompt-submit", "running"],
  ["pre-tool-use-bash", "running"],
  ["pre-tool-use-ask", "waiting"],
  ["post-tool-use", "running"],
  ["notification-routine", null],
  ["notification-permission", "waiting"],
  ["notification-idle", "waiting"],
  ["stop", "waiting"],
  ["stop-failure", "waiting"],
];

async function parse(name: string): Promise<ParsedHook> {
  const payload: unknown = JSON.parse(await readFile(join(PAYLOADS, `${name}.json`), "utf8"));
  return grokParser.parse(payload);
}

describe("the Grok hook parser", () => {
  it.each(STATUS)("reads %s as %s", async (name, status) => {
    const parsed = await parse(name);
    expect(parsed.status).toBe(status);
    expect(parsed.sessionId).toBe(SESSION_ID);
    expect(parsed.cwd).toBe("/tmp/workspace");
  });

  it("treats SessionStart and session_start as one event", async () => {
    const camel = await parse("session-start");
    const snake = await parse("session-start-snake");
    expect([camel.status, snake.status]).toEqual([null, null]);
    expect(camel.sessionId).toBe(snake.sessionId);
  });

  it("ignores the routine notification Grok fires before every tool", async () => {
    // Grok sends this even with permissions bypassed, so it is progress, not a wait.
    expect((await parse("notification-routine")).status).toBeNull();
  });

  it("waits on the notification wordings Orca captured from Grok", async () => {
    // The two fixtures carry Grok's own text: the permission prompt uses none of the words a
    // reader would guess at ("Grok needs your feedback"), and the idle line is the TUI footer.
    expect((await parse("notification-permission")).status).toBe("waiting");
    expect((await parse("notification-idle")).status).toBe("waiting");
  });

  it("waits on the plainer wordings too, which Grok has not been seen to send", () => {
    for (const message of [
      "Grok needs your permission to run Shell",
      "Grok asks permission to run Shell",
      "Approve this edit?",
    ]) {
      expect(grokParser.parse({ hookEventName: "Notification", message }).status).toBe("waiting");
    }
    for (const message of ["Grok is idle", "Waiting for input"]) {
      expect(grokParser.parse({ hookEventName: "Notification", message }).status).toBe("waiting");
    }
  });

  it("says nothing about a notification that is neither a prompt nor an idle line", () => {
    // The words a working Grok writes on its own: an offer of feedback, a question it answers
    // itself, and a report that it finished. None of them is a turn handed back to the user.
    for (const message of [
      "Ready to review your PR, any feedback?",
      "I have a clarifying question about the schema",
      "Task complete, ready for next steps",
      "Indexing files",
      "Connected",
    ]) {
      const parsed = grokParser.parse({ hookEventName: "Notification", message });
      expect(parsed.status).toBeNull();
    }
  });

  it("waits on the auto-allowed question tool and works on every other tool", async () => {
    expect((await parse("pre-tool-use-ask")).status).toBe("waiting");
    expect((await parse("pre-tool-use-bash")).status).toBe("running");
  });

  it("matches the question tool whatever its case and punctuation", async () => {
    for (const toolName of ["AskUserQuestion", "ask-user-question", "askUserQuestion"]) {
      const parsed = grokParser.parse({ hookEventName: "PreToolUse", toolName });
      expect(parsed.status).toBe("waiting");
    }
  });

  it("names the event it read, and keeps no session id it could not pass as an argument", () => {
    const parsed = grokParser.parse({ hookEventName: "Stop", sessionId: "--rm -rf" });
    expect(parsed).toEqual({ event: "Stop", status: "waiting", sessionId: null, cwd: null });
  });

  it("treats a non-string toolName as no tool named, not a crash", () => {
    const parsed = grokParser.parse({ hookEventName: "PreToolUse", toolName: 42 });
    expect(parsed.status).toBe("running");
  });

  it("refuses a payload that names no event at all", () => {
    expect(() => grokParser.parse({ sessionId: SESSION_ID })).toThrowError(
      expect.objectContaining({ code: "hook-payload-invalid" }),
    );
  });
});
