import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ConfigError } from "./error.js";
import {
  demoteSectionHeadings,
  formatTaskNote,
  parseTaskNote,
  readTaskNote,
  type TaskNote,
  writeTaskNote,
} from "./task-note.js";

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

  it("reads a handoff that names nobody, and writes it back the same way", () => {
    const text = note("## Spec\n\nA\n\n## Handoff at 2026-09-09T09:30:00.000Z\n\nBody\n");
    const parsed = parseTaskNote(text);
    expect(parsed.handoffs).toEqual([
      { toProfileId: null, at: "2026-09-09T09:30:00.000Z", body: "Body" },
    ]);
    expect(formatTaskNote(parsed)).toBe(text);
  });

  it("round-trips a note holding both handoff forms, in file order", () => {
    const text = note(
      "## Spec\n\nA\n\n## Handoff to codex:default:native at 2026-09-09T09:30:00.000Z\n\nOne\n" +
        "\n## Handoff at 2026-09-10T09:30:00.000Z\n\nTwo\n",
    );
    const parsed = parseTaskNote(text);
    expect(parsed.handoffs.map((handoff) => handoff.toProfileId)).toEqual([
      "codex:default:native",
      null,
    ]);
    expect(formatTaskNote(parsed)).toBe(text);
  });

  it("rejects a handoff that names nobody and carries no timestamp", () => {
    const error = rejection(note("## Spec\n\nA\n\n## Handoff at yesterday\n\nBody\n"));
    expect(error.code).toBe("task-note-invalid");
    expect(error.message).toContain("not a handoff heading");
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

describe("writeTaskNote", () => {
  it("creates .ag/tasks and round-trips through readTaskNote", async () => {
    const repo = await mkdtemp(join(tmpdir(), "agn-note-"));
    try {
      const note: TaskNote = {
        id: "t3n9v2wxyz",
        title: "add a --verbose flag",
        status: "queued",
        profileId: "claude-code:default:native",
        createdAt: "2026-09-11T10:00:00.000Z",
        parentTaskId: null,
        spec: "add a --verbose flag\nmore",
        acceptance: null,
        notes: null,
        handoffs: [],
      };
      await writeTaskNote(repo, note);
      expect(await readTaskNote(repo, note.id)).toEqual(note);
      await writeTaskNote(repo, { ...note, status: "done" });
      expect((await readTaskNote(repo, note.id))?.status).toBe("done");
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

describe("demoteSectionHeadings", () => {
  it("demotes every line that would start a note section, fences included", () => {
    expect(demoteSectionHeadings("## Spec\n\ntext\n\n```\n## Acceptance\n```\n")).toBe(
      "### Spec\n\ntext\n\n```\n### Acceptance\n```\n",
    );
  });

  it("leaves deeper headings, inline hashes and indented lines alone", () => {
    expect(demoteSectionHeadings("### Notes\n#### Detail\nsee ## Spec\n  ## Indented\n")).toBe(
      "### Notes\n#### Detail\nsee ## Spec\n  ## Indented\n",
    );
  });

  it("survives a note round trip: the demoted body is one section again", () => {
    const note = {
      ...(parseTaskNote(
        `---\nid: q4m8n2vwxy\ntitle: t\nstatus: queued\nprofile: claude-code:default:native\ncreated: 2026-09-14T10:00:00.000Z\n---\n\n## Spec\n\nx\n`,
      ) as TaskNote),
      spec: demoteSectionHeadings("## Background\n\nwhy\n\n## Plan\n\nhow"),
    };
    expect(parseTaskNote(formatTaskNote(note)).spec).toBe(note.spec);
  });
});
