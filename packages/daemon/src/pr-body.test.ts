import type { TaskNote } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { composePrBody } from "./pr-body.js";

function note(over: Partial<TaskNote> = {}): TaskNote {
  return {
    id: "task1",
    title: "Add the invite links",
    status: "running",
    profileId: "claude-code:sonnet-4.5:native",
    createdAt: "2026-09-20T09:00:00.000Z",
    parentTaskId: null,
    spec: "Add invite links to the settings page.",
    acceptance: null,
    notes: "not part of the description",
    handoffs: [],
    ...over,
  };
}

describe("composePrBody", () => {
  it("is the spec and the trailer when that is all the note has", () => {
    expect(composePrBody(note())).toBe(
      "## Spec\n\nAdd invite links to the settings page.\n\n---\nagn task task1",
    );
  });

  it("adds the acceptance section when the note has one", () => {
    const body = composePrBody(note({ acceptance: "- the link expires" }));
    expect(body).toContain("## Spec\n\nAdd invite links");
    expect(body).toContain("## Acceptance\n\n- the link expires");
  });

  it("takes the latest handoff, and only that one", () => {
    const body = composePrBody(
      note({
        handoffs: [
          { toProfileId: "codex:gpt-5:native", at: "2026-09-20T10:00:00.000Z", body: "first" },
          { toProfileId: "codex:gpt-5:native", at: "2026-09-20T11:00:00.000Z", body: "second" },
        ],
      }),
    );
    expect(body).toContain("## Handoff\n\nsecond");
    expect(body).not.toContain("first");
  });

  it("demotes a heading inside a section so it cannot pass for one", () => {
    expect(composePrBody(note({ spec: "## Background\n\nwhy" }))).toContain("### Background");
  });
});
