import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HookStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { ParsedHook } from "../hook-event-parser.js";
import { copilotParser } from "./copilot.js";

/**
 * Orca has no listener test for Copilot, so these payloads are derived from the field names its
 * readers look for (`copilot-tool-fields.ts`, MIT), not captured from a run. None of them carries
 * `hook_event_name`: agn's own hook command names the event. Unverified live.
 */
const PAYLOADS = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/copilot/", import.meta.url),
);

const SESSION_ID = "01996f2c-6a4b-7b31-9f2e-2c1a7d4e88aa";

const STATUS: Array<[string, string, HookStatus | null]> = [
  ["session-start", "SessionStart", null],
  ["user-prompt-submit", "UserPromptSubmit", "running"],
  ["pre-tool-use-shell", "PreToolUse", "running"],
  ["pre-tool-use-ask-user", "PreToolUse", "waiting"],
  ["permission-request", "PermissionRequest", "running"],
  ["notification-permission-prompt", "Notification", "waiting"],
  ["notification-other", "Notification", null],
  ["stop", "Stop", "waiting"],
  ["error-recoverable", "ErrorOccurred", "running"],
  ["error-fatal", "ErrorOccurred", "waiting"],
  ["session-end", "SessionEnd", null],
];

async function parse(name: string, event: string): Promise<ParsedHook> {
  const payload: unknown = JSON.parse(await readFile(join(PAYLOADS, `${name}.json`), "utf8"));
  return copilotParser.parse(payload, event);
}

describe("the Copilot hook parser", () => {
  it.each(STATUS)("reads %s, hinted %s, as %s", async (name, event, status) => {
    const parsed = await parse(name, event);
    expect(parsed).toEqual({
      event,
      status,
      sessionId: SESSION_ID,
      cwd: "/tmp/workspace",
      usage: null,
    });
  });

  it("does not call a permission request a wait, because Copilot has not yet asked", async () => {
    // Copilot fires PermissionRequest before it decides between allow, ask and deny.
    expect((await parse("permission-request", "PermissionRequest")).status).toBe("running");
    const asking: unknown = JSON.parse(
      await readFile(join(PAYLOADS, "pre-tool-use-ask-user.json"), "utf8"),
    );
    expect(copilotParser.parse(asking, "PermissionRequest").status).toBe("waiting");
  });

  it("reads the question tool out of toolCalls when the payload does not name it", async () => {
    expect((await parse("pre-tool-use-ask-user", "PreToolUse")).status).toBe("waiting");
  });

  it("keeps working through an error Copilot calls recoverable", async () => {
    expect((await parse("error-recoverable", "ErrorOccurred")).status).toBe("running");
    expect((await parse("error-fatal", "ErrorOccurred")).status).toBe("waiting");
  });

  it("prefers the event the payload names over the hint", () => {
    const parsed = copilotParser.parse({ hook_event_name: "Stop" }, "UserPromptSubmit");
    expect(parsed).toEqual({
      event: "Stop",
      status: "waiting",
      sessionId: null,
      cwd: null,
      usage: null,
    });
  });

  it("treats a toolCalls entry that is not an object as no tool named, not a crash", () => {
    const parsed = copilotParser.parse({ toolCalls: ["ask_user"] }, "PreToolUse");
    expect(parsed.status).toBe("running");
    const withNull = copilotParser.parse({ toolCalls: [null] }, "PermissionRequest");
    expect(withNull.status).toBe("running");
  });

  it("refuses a payload with neither a hint nor an event name", async () => {
    const payload: unknown = JSON.parse(await readFile(join(PAYLOADS, "stop.json"), "utf8"));
    expect(() => copilotParser.parse(payload)).toThrowError(
      expect.objectContaining({ code: "hook-payload-invalid" }),
    );
  });
});
