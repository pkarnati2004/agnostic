import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError } from "./error.js";
import { formatTaskNote, parseTaskNote, readTaskNote, type TaskNote } from "./task-note.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/ag", import.meta.url));
const COMPLETE_REPO = `${FIXTURES}/complete`;
const COMPLETE_ID = "t3n9v2wxyz";
const MINIMAL_ID = "q4m8n2vwxy";

function readNoteText(repo: string, id: string): Promise<string> {
  return readFile(`${repo}/.ag/tasks/${id}.md`, "utf8");
}

function rejection(text: string): ConfigError {
  try {
    parseTaskNote(text);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected parseTaskNote to throw");
}

describe("parseTaskNote", () => {
  it("reads the front matter, the sections and the handoffs in file order", async () => {
    const note = parseTaskNote(await readNoteText(COMPLETE_REPO, COMPLETE_ID));
    expect(note.id).toBe(COMPLETE_ID);
    expect(note.title).toBe("Recommend: rank profiles for a task");
    expect(note.status).toBe("waiting");
    expect(note.profileId).toBe("claude-code:sonnet-4.5:native");
    expect(note.createdAt).toBe("2026-09-08T14:02:11.000Z");
    expect(note.parentTaskId).toBe(MINIMAL_ID);
    expect(note.spec).toBe(
      "Rank the available profiles for a task and explain the top choice in one line.",
    );
    expect(note.acceptance).toContain("agn recommend");
    expect(note.handoffs.map((handoff) => handoff.toProfileId)).toEqual([
      "codex:default:native",
      "claude-code:default:native",
    ]);
    expect(note.handoffs[0]?.at).toBe("2026-09-09T09:30:00.000Z");
    expect(note.handoffs[0]?.body.startsWith("### Goal")).toBe(true);
    expect(note.handoffs[1]?.body.endsWith("re-run the scoring tests.")).toBe(true);
  });

  it("leaves the optional sections empty on a minimal note", async () => {
    const note = parseTaskNote(await readNoteText(COMPLETE_REPO, MINIMAL_ID));
    expect(note.acceptance).toBeNull();
    expect(note.notes).toBeNull();
    expect(note.parentTaskId).toBeNull();
    expect(note.handoffs).toEqual([]);
  });

  it("exposes the free-text ## Notes section", async () => {
    const note = parseTaskNote(await readNoteText(COMPLETE_REPO, COMPLETE_ID));
    expect(note.notes).toBe(
      "The catalog numbers came from the vendor pages on 2026-09-01. Re-check them before v1.",
    );
  });

  it.each([
    ["no-closing-fence"],
    ["no-spec"],
    ["unknown-heading"],
    ["bad-status"],
    ["bad-handoff-heading"],
  ])("rejects %s", async (name) => {
    const text = await readFile(`${FIXTURES}/malformed/.ag/tasks/${name}.md`, "utf8");
    const error = rejection(text);
    expect(error.code).toBe("task-note-invalid");
    expect(error.file).toBe("<inline>");
  });
});

describe("formatTaskNote", () => {
  it.each([[COMPLETE_ID], [MINIMAL_ID]])("round-trips %s byte for byte", async (id) => {
    const text = await readNoteText(COMPLETE_REPO, id);
    expect(formatTaskNote(parseTaskNote(text))).toBe(text);
  });

  it("quotes a title that contains a colon", () => {
    const note: TaskNote = {
      id: COMPLETE_ID,
      title: "Recommend: rank profiles",
      status: "queued",
      profileId: "claude-code:default:native",
      createdAt: "2026-09-08T13:40:00.000Z",
      parentTaskId: null,
      spec: "Rank the profiles.",
      acceptance: null,
      notes: null,
      handoffs: [],
    };
    expect(parseTaskNote(formatTaskNote(note))).toEqual(note);
  });

  it("preserves a ## Notes body it never parsed", () => {
    const note: TaskNote = {
      id: COMPLETE_ID,
      title: "Add a health endpoint",
      status: "queued",
      profileId: "claude-code:default:native",
      createdAt: "2026-09-08T13:40:00.000Z",
      parentTaskId: null,
      spec: "Add GET /health.",
      acceptance: null,
      notes: "### Scratch\n\n- ask about the version string\n- the port is in daemon.json",
      handoffs: [],
    };
    const text = formatTaskNote(note);
    expect(parseTaskNote(text)).toEqual(note);
    expect(formatTaskNote(parseTaskNote(text))).toBe(text);
  });
});

describe("parseTaskNote edge cases", () => {
  const FRONT =
    "id: t3n9v2wxyz\ntitle: Add a health endpoint\nstatus: queued\n" +
    "profile: claude-code:default:native\ncreated: 2026-09-08T13:40:00.000Z\n";

  function note(body: string): string {
    return `---\n${FRONT}---\n\n${body}`;
  }

  it("rejects a duplicate section heading", () => {
    const error = rejection(note("## Spec\n\nA\n\n## Spec\n\nB\n"));
    expect(error.code).toBe("task-note-invalid");
    expect(error.message).toContain("two ## Spec sections");
  });

  it("rejects text before the first ## heading", () => {
    const error = rejection(note("Stray text that isn't inside a section.\n\n## Spec\n\nA\n"));
    expect(error.code).toBe("task-note-invalid");
    expect(error.message).toContain("would be lost");
  });

  it("parses an empty optional section as null rather than an empty string", () => {
    const parsed = parseTaskNote(note("## Spec\n\nA\n\n## Acceptance\n\n"));
    expect(parsed.acceptance).toBeNull();
  });

  it("rejects a ## Spec section that is present but empty", () => {
    const error = rejection(note("## Spec\n\n## Acceptance\n\nSomething.\n"));
    expect(error.code).toBe("task-note-invalid");
    expect(error.message).toContain("Spec");
  });

  it("rejects a handoff heading whose profile id is not a profile id", () => {
    const error = rejection(
      note("## Spec\n\nA\n\n## Handoff to not-a-profile at 2026-09-09T09:30:00.000Z\n\nBody\n"),
    );
    expect(error.code).toBe("task-note-invalid");
  });

  it("carries a hint naming the file to fix", () => {
    const error = rejection(note("## Acceptance\n\nOnly acceptance, no spec.\n"));
    expect(error.hint).toContain("<inline>");
  });
});

describe("readTaskNote", () => {
  it("reads the note for a task id", async () => {
    expect((await readTaskNote(COMPLETE_REPO, MINIMAL_ID))?.title).toBe("Add a health endpoint");
  });

  it("returns null when the task has no note", async () => {
    expect(await readTaskNote(COMPLETE_REPO, "zzzzzzzzzz")).toBeNull();
  });
});
