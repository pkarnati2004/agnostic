import { describe, expect, it } from "vitest";
import { codexParser } from "./parse.js";

/** The id in these payloads is the shape a real Codex session reports: its rollout thread id. */
function payload(fields: Record<string, string>): unknown {
  return { session_id: "01a092b5-cc6e-7510-b038-c4e0988a9493", cwd: "/repo", ...fields };
}

describe("the Codex hook parser", () => {
  it.each([
    ["UserPromptSubmit", {}, "running"],
    ["PostToolUse", { tool_name: "shell" }, "running"],
    ["PreToolUse", { tool_name: "shell" }, "running"],
    ["PreToolUse", { tool_name: "request_user_input" }, "waiting"],
    ["PermissionRequest", { tool_name: "shell" }, "waiting"],
    ["Stop", {}, "waiting"],
  ])("maps %s to %s", (event, extra, status) => {
    expect(codexParser.parse(payload({ hook_event_name: event, ...extra })).status).toBe(status);
  });

  it("reports the session id Codex resumes by", () => {
    const parsed = codexParser.parse(
      payload({ hook_event_name: "SessionStart", source: "startup" }),
    );
    expect(parsed).toEqual({
      event: "SessionStart",
      status: null,
      sessionId: "01a092b5-cc6e-7510-b038-c4e0988a9493",
      cwd: "/repo",
    });
  });

  it("reports an event it does not know without a transition", () => {
    expect(codexParser.parse(payload({ hook_event_name: "SessionEnd" })).status).toBeNull();
  });
});
