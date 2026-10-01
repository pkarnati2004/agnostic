import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HookStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { HookEventParser } from "../hook-event-parser.js";
import { commandCodeParser } from "./command-code.js";
import { cursorAgentParser } from "./cursor-agent.js";
import { devinParser } from "./devin.js";
import { droidParser } from "./droid.js";
import { geminiParser } from "./gemini.js";
import { kimiParser } from "./kimi.js";
import { openClaudeParser } from "./openclaude.js";

/**
 * One line per payload agn has a rule for. Every payload is transcribed from an Orca listener
 * test, named per member below; none of these six was seen on a live harness (ADR 035). Cursor is
 * the exception: its event names come from Orca, but `conversation_id` and `workspace_roots` do
 * not appear there and are inferred from the handoff, so its fixtures are written, not ported.
 */
const PAYLOADS = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/", import.meta.url),
);

type Case = [file: string, status: HookStatus | null, sessionId: string | null];

// src/main/agent-hooks/server-gemini-normalization.test.ts
const GEMINI: Case[] = [
  ["before-agent.json", "running", "gemini-session-1"],
  ["before-tool.json", "running", "gemini-session-1"],
  ["after-tool.json", "running", "gemini-session-1"],
  ["after-agent.json", "waiting", "gemini-session-1"],
];

// src/main/agent-hooks/server-droid-normalization.test.ts
const DROID: Case[] = [
  ["session-start.json", null, "droid-session-1"],
  ["user-prompt-submit.json", "running", "droid-session-1"],
  ["pre-tool-use-ask-user.json", "waiting", "droid-session-1"],
  ["pre-tool-use-bash.json", "running", "droid-session-1"],
  ["permission-request.json", "waiting", "droid-session-1"],
  ["notification-permission.json", "waiting", "droid-session-1"],
  ["notification-idle.json", "waiting", "droid-session-1"],
  ["notification-other.json", null, "droid-session-1"],
  ["stop.json", "waiting", "droid-session-1"],
];

// src/shared/agent-hook-listener-interactive-prompts.test.ts for the event names. The session and
// directory keys are not in Orca; `conversation_id` and `workspace_roots` were verified live
// 2026-10-01 on a `stop` payload from cursor-agent 2026.10.01-14929f9, and the other three events
// are assumed to carry the same two keys.
const CURSOR: Case[] = [
  ["before-submit-prompt.json", "running", "cursor-conversation-1"],
  ["post-tool-use.json", "running", "cursor-conversation-1"],
  ["after-agent-response.json", "running", "cursor-conversation-1"],
  ["stop.json", "waiting", "cursor-conversation-1"],
];

// src/shared/agent-hook-listener-claude-compatible-vendors.test.ts, Kimi cases
const KIMI: Case[] = [
  ["user-prompt-submit.json", "running", "session_abc"],
  ["pre-tool-use-ask.json", "waiting", "session_abc"],
  ["pre-tool-use-bash.json", "running", "session_abc"],
  ["permission-request.json", "waiting", "session_abc"],
  ["stop.json", "waiting", "session_abc"],
  ["stop-interrupt.json", "waiting", "session_abc"],
];

// src/shared/agent-hook-listener-claude-compatible-vendors.test.ts, Devin cases
const DEVIN: Case[] = [
  ["session-start.json", null, "devin-session-1"],
  ["user-prompt-submit.json", "running", "devin-session-1"],
  ["pre-tool-use.json", "running", "devin-session-1"],
  ["permission-request.json", "waiting", "devin-session-1"],
  ["post-compaction.json", "running", "devin-session-1"],
  ["stop.json", "waiting", "devin-session-1"],
  ["session-end.json", null, "devin-session-1"],
];

// Claude Code's own payloads, read out of OpenClaude's directory, plus its StopFailure.
const OPENCLAUDE: Case[] = [
  ["user-prompt-submit.json", "running", "openclaude-session-1"],
  ["pre-tool-use-ask.json", "waiting", "openclaude-session-1"],
  ["stop.json", "waiting", "openclaude-session-1"],
  ["stop-failure.json", "waiting", "openclaude-session-1"],
];

// src/shared/agent-hook-listener-command-code-transcript.test.ts
const COMMAND_CODE: Case[] = [
  ["pre-tool-use.json", "running", null],
  ["post-tool-use.json", "running", null],
  ["stop.json", "waiting", null],
];

const MEMBERS: Array<[string, HookEventParser, Case[]]> = [
  ["gemini", geminiParser, GEMINI],
  ["droid", droidParser, DROID],
  ["cursor-agent", cursorAgentParser, CURSOR],
  ["kimi", kimiParser, KIMI],
  ["devin", devinParser, DEVIN],
  ["openclaude", openClaudeParser, OPENCLAUDE],
  ["command-code", commandCodeParser, COMMAND_CODE],
];

async function payload(member: string, file: string): Promise<unknown> {
  return JSON.parse(await readFile(join(PAYLOADS, member, file), "utf8"));
}

describe.each(MEMBERS)("the %s hook parser", (member, parser, cases) => {
  it.each(cases)("maps %s to %s", async (file, status, sessionId) => {
    const parsed = parser.parse(await payload(member, file));
    expect(parsed).toMatchObject({ status, sessionId, cwd: "/repo" });
  });

  it.each(["not json", [], null, { session_id: "abc" }])("refuses %s as a payload", (value) => {
    expect(() => parser.parse(value)).toThrow(
      expect.objectContaining({ code: "hook-payload-invalid" }),
    );
  });
});

describe("the tokens a payload carries", () => {
  /** The one payload that reports usage: Cursor writes no tokens to disk (ADR 029). */
  const CURSOR_STOP = fileURLToPath(
    new URL("../../../../tests/fixtures/usage/cursor-stop.json", import.meta.url),
  );

  it("reads Cursor's stop usage, with the cache read counted inside the input", async () => {
    const payload = JSON.parse(await readFile(CURSOR_STOP, "utf8"));

    expect(cursorAgentParser.parse(payload).usage).toEqual({
      model: "composer-2",
      tokensInput: 1200,
      tokensOutput: 300,
      tokensCacheRead: 1000,
      tokensCacheWrite: 50,
      inputIncludesCacheRead: true,
      ref: "cursor-agent:gen_01JD7Q3V9T",
    });
  });

  it("reads Cursor's `default` model as no model, so nothing prices it", async () => {
    const payload = { ...JSON.parse(await readFile(CURSOR_STOP, "utf8")), model: "default" };

    expect(cursorAgentParser.parse(payload).usage).toMatchObject({
      model: null,
      tokensInput: 1200,
    });
  });

  it("reports no usage for a stop payload that carries none", async () => {
    expect(cursorAgentParser.parse(await payload("cursor-agent", "stop.json")).usage).toBeNull();
  });

  it("reports no usage for a payload with tokens and no generation to key them by", async () => {
    const { generation_id: _dropped, ...rest } = JSON.parse(await readFile(CURSOR_STOP, "utf8"));

    expect(cursorAgentParser.parse(rest).usage).toBeNull();
  });

  it("reports no usage for Cursor's other events", async () => {
    const parsed = cursorAgentParser.parse(
      await payload("cursor-agent", "after-agent-response.json"),
    );

    expect(parsed.usage).toBeNull();
  });

  it("reports no usage for the members that write their tokens to a file", async () => {
    for (const [member, parser, cases] of MEMBERS.filter(([name]) => name !== "cursor-agent")) {
      const [file] = cases[0] ?? [];
      expect(parser.parse(await payload(member, file ?? "stop.json")).usage, member).toBeNull();
    }
  });
});

describe("what one member reads that the others do not", () => {
  it("reads Cursor's directory out of the first workspace root", async () => {
    const parsed = cursorAgentParser.parse(await payload("cursor-agent", "stop.json"));
    expect(parsed.cwd).toBe("/repo");
  });

  it("reads Devin's session id under either spelling", async () => {
    const parsed = devinParser.parse(await payload("devin", "user-prompt-submit.json"));
    expect(parsed.sessionId).toBe("devin-session-1");
  });

  it("takes the event from the hint when the payload names none", () => {
    expect(droidParser.parse({ cwd: "/repo" }, "Stop")).toMatchObject({
      event: "Stop",
      status: "waiting",
    });
  });

  it("prefers the event the payload names over the hint", () => {
    expect(droidParser.parse({ hook_event_name: "UserPromptSubmit" }, "Stop").status).toBe(
      "running",
    );
  });
});
