import { describe, expect, it } from "vitest";
import { claudeCodeParser } from "./parse.js";

function payload(fields: Record<string, string>): unknown {
  return { session_id: "abc-123", cwd: "/repo", ...fields };
}

describe("the Claude Code hook parser", () => {
  it.each([
    ["UserPromptSubmit", {}, "running"],
    ["PostToolUse", { tool_name: "Bash" }, "running"],
    ["Stop", {}, "waiting"],
    ["PermissionRequest", { tool_name: "Bash" }, "waiting"],
    ["PreToolUse", { tool_name: "AskUserQuestion" }, "waiting"],
    ["Notification", { notification_type: "idle_prompt" }, "waiting"],
    ["Notification", { notification_type: "agent_needs_input" }, "waiting"],
  ])("maps %s to %s", (event, extra, status) => {
    const parsed = claudeCodeParser.parse(payload({ hook_event_name: event, ...extra }));
    expect(parsed).toEqual({ event, status, sessionId: "abc-123", cwd: "/repo" });
  });

  it.each([
    ["SessionStart", { source: "startup" }],
    ["PreToolUse", { tool_name: "Bash" }],
    ["Notification", { notification_type: "tip" }],
    ["PreCompact", {}],
    ["SubagentStop", {}],
  ])("reports %s without a transition", (event, extra) => {
    expect(claudeCodeParser.parse(payload({ hook_event_name: event, ...extra })).status).toBeNull();
  });

  it.each([["-x"], ["a".repeat(600)], ["  "]])("refuses %s as a session id", (sessionId) => {
    const parsed = claudeCodeParser.parse({ hook_event_name: "Stop", session_id: sessionId });
    expect(parsed.sessionId).toBeNull();
  });

  it("still maps the event when session_id and cwd are both missing", () => {
    expect(claudeCodeParser.parse({ hook_event_name: "Stop" })).toEqual({
      event: "Stop",
      status: "waiting",
      sessionId: null,
      cwd: null,
    });
  });

  it("keeps only an absolute cwd", () => {
    expect(claudeCodeParser.parse({ hook_event_name: "Stop", cwd: "repo" }).cwd).toBeNull();
  });

  it.each([["not json"], [[]], [null], [{ session_id: "abc" }]])(
    "refuses %s as a payload",
    (value) => {
      expect(() => claudeCodeParser.parse(value)).toThrow(
        expect.objectContaining({ code: "hook-payload-invalid" }),
      );
    },
  );
});
