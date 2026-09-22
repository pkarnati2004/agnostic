import type { UpdateTaskResponse } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "./changes-fixture";
import { updateLine } from "./update-result";

function response(over: Partial<UpdateTaskResponse> = {}): UpdateTaskResponse {
  return {
    task: taskRow(),
    mode: "rebase",
    via: "live",
    base: "main",
    prompt: "Fetch `main`.",
    ...over,
  };
}

describe("updateLine", () => {
  it("says what the agent was asked, and nothing more when it was already running", () => {
    expect(updateLine(response())).toBe("Asked the agent to rebase onto `main`.");
    expect(updateLine(response({ mode: "merge" }))).toBe("Asked the agent to merge `main` in.");
  });

  it("says the session was resumed when the prompt started one", () => {
    expect(updateLine(response({ via: "native" }))).toBe(
      "Asked the agent to rebase onto `main`. The session was resumed.",
    );
    expect(updateLine(response({ mode: "merge", via: "fresh" }))).toBe(
      "Asked the agent to merge `main` in. The session was resumed.",
    );
  });
});
