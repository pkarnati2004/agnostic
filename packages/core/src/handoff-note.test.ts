import { describe, expect, it } from "vitest";
import { composeHandoffBody, type FileChanges } from "./handoff-note.js";
import type { Task } from "./task.js";
import { formatTaskNote, parseTaskNote } from "./task-note.js";

const NO_CHANGES: FileChanges = {
  kind: "git",
  committed: [],
  uncommitted: [],
  worktreePath: null,
};

function from(over: Partial<Task> = {}): Task {
  return {
    id: "t3n9v2wxyz",
    repoId: "r7k2m4pqrs",
    title: "add a --verbose flag",
    prompt: "add a --verbose flag",
    profileId: "claude-code:default:native",
    worktreePath: "/w/t3n9v2wxyz",
    branch: "agn/flag-t3n9v2wxyz",
    status: "stopped",
    origin: "agn",
    createdAt: "2026-09-12T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z",
    ...over,
  };
}

function headings(body: string): string[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("### "))
    .map((line) => line.slice(4));
}

describe("composeHandoffBody", () => {
  it("keeps the four template headings in order, whatever the note says", () => {
    const body = composeHandoffBody({ note: null, from: from(), changes: NO_CHANGES });
    expect(headings(body)).toEqual(["Goal", "Decisions", "Files touched", "What failed"]);
  });

  it("stands in for a note nobody wrote, and always says how the last agent ended", () => {
    const body = composeHandoffBody({ note: null, from: from(), changes: NO_CHANGES });
    expect(body).toContain("Continue from where claude-code:default:native left off.");
    expect(body).toContain("none recorded");
    expect(body.trimEnd().endsWith("claude-code:default:native ended stopped.")).toBe(true);
  });

  it("puts plain text under Goal", () => {
    const body = composeHandoffBody({
      note: "the parser is done, the printer is not",
      from: from(),
      changes: NO_CHANGES,
    });
    expect(body.startsWith("### Goal\n\nthe parser is done, the printer is not\n\n")).toBe(true);
  });

  it("fills the slots the note names itself", () => {
    const body = composeHandoffBody({
      note: [
        "finish the printer",
        "",
        "### Decisions",
        "yaml, not json",
        "",
        "### What failed",
        "the streaming parser overran",
      ].join("\n"),
      from: from({ status: "failed", profileId: "codex:default:native" }),
      changes: NO_CHANGES,
    });
    expect(body).toContain("### Goal\n\nfinish the printer");
    expect(body).toContain("### Decisions\n\nyaml, not json");
    expect(body).toContain(
      "### What failed\n\nthe streaming parser overran\n\ncodex:default:native ended failed.",
    );
  });

  it("demotes the note's own top-level headings to level three", () => {
    const body = composeHandoffBody({
      note: "# Goal\ndrop the flag\n## Decisions\nno flag at all",
      from: from(),
      changes: NO_CHANGES,
    });
    expect(body).not.toContain("\n# ");
    expect(body).not.toContain("\n## ");
    expect(body).toContain("### Goal\n\ndrop the flag");
    expect(body).toContain("### Decisions\n\nno flag at all");
  });

  it("leaves a fenced code block alone, `# ` lines and all", () => {
    const body = composeHandoffBody({
      note: [
        "use this snippet:",
        "",
        "```sh",
        "# not a heading",
        "echo hi",
        "```",
        "",
        "the rest",
      ].join("\n"),
      from: from(),
      changes: NO_CHANGES,
    });
    expect(headings(body)).toEqual(["Goal", "Decisions", "Files touched", "What failed"]);
    expect(body).toContain("```sh\n# not a heading\necho hi\n```\n\nthe rest");
  });

  it("still brings a level-two line inside a fence down a level", () => {
    // The note parser knows nothing about fences, so a `## ` line there would end the section.
    const body = composeHandoffBody({
      note: ["run:", "", "```md", "## Release", "```"].join("\n"),
      from: from(),
      changes: NO_CHANGES,
    });
    // Still one block under Goal: a fenced line never cuts a section, whatever level it ends up.
    expect(body).toContain("### Goal\n\nrun:\n\n```md\n### Release\n```");
    expect(body.split("\n").some((line) => line.startsWith("## "))).toBe(false);
  });

  it("keeps a heading of the user's own after the template", () => {
    const body = composeHandoffBody({
      note: "carry on\n\n### Open questions\nwhich yaml library",
      from: from(),
      changes: NO_CHANGES,
    });
    expect(headings(body).at(-1)).toBe("Open questions");
    expect(body).toContain("which yaml library");
  });

  it("lists the diff stat and the edits left in the worktree", () => {
    const body = composeHandoffBody({
      note: null,
      from: from(),
      changes: {
        kind: "git",
        committed: [" src/parse.ts | 12 ++++++++----", " 1 file changed"],
        uncommitted: [" M src/print.ts"],
        worktreePath: "/w/t3n9v2wxyz",
      },
    });
    expect(body).toContain("### Files touched\n\n src/parse.ts | 12 ++++++++----");
    expect(body).toContain("Uncommitted in /w/t3n9v2wxyz:\n M src/print.ts");
  });

  it("keeps the note's own Files touched above the diff stat", () => {
    const body = composeHandoffBody({
      note: "### Files touched\nsrc/parse.ts, by hand",
      from: from(),
      changes: {
        kind: "git",
        committed: [" src/parse.ts | 2 +-"],
        uncommitted: [],
        worktreePath: null,
      },
    });
    expect(body).toContain("### Files touched\n\nsrc/parse.ts, by hand\n\n src/parse.ts | 2 +-");
  });

  it("says a folder workspace tracks nothing, and an untouched branch none", () => {
    expect(composeHandoffBody({ note: null, from: from(), changes: { kind: "folder" } })).toContain(
      "### Files touched\n\nnot tracked (folder workspace)",
    );
    expect(composeHandoffBody({ note: null, from: from(), changes: NO_CHANGES })).toContain(
      "### Files touched\n\nnone",
    );
  });

  it("survives a round trip through the task note it is written into", () => {
    const body = composeHandoffBody({
      note: "## Decisions\nsqlite it is",
      from: from(),
      changes: NO_CHANGES,
    });
    const note = {
      id: "t3n9v2wxyz",
      title: "add a --verbose flag",
      status: "stopped" as const,
      profileId: "claude-code:default:native",
      createdAt: "2026-09-12T10:00:00.000Z",
      parentTaskId: null,
      spec: "add a --verbose flag",
      acceptance: null,
      notes: null,
      handoffs: [{ toProfileId: "codex:default:native", at: "2026-09-12T11:00:00.000Z", body }],
    };
    const text = formatTaskNote(note);
    const reparsed = parseTaskNote(text);
    expect(reparsed.handoffs).toHaveLength(1);
    expect(reparsed.handoffs[0]?.body).toBe(body);
    expect(formatTaskNote(reparsed)).toBe(text);
  });
});
