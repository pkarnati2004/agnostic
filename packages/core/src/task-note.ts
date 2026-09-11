import { parse, stringify, YAMLParseError } from "yaml";
import { z } from "zod";
import { taskNotePath } from "./ag-layout.js";
import { describeIssues } from "./describe-issues.js";
import { ConfigError } from "./error.js";
import { IdSchema } from "./id.js";
import { ProfileIdSchema } from "./profile.js";
import { readTextFile } from "./read-text-file.js";
import { TaskStatusSchema } from "./task.js";

const INLINE = "<inline>";
const FENCE = "---";
const HANDOFF_HEADING = /^Handoff to (\S+) at (\S+)$/;
const NAMED_HEADINGS = ["Spec", "Acceptance", "Notes"];

// No `updated` key: a status change rewrites the file, and a timestamp churning every time hides
// the edits that matter in a diff.
export const TaskNoteFrontMatterSchema = z.strictObject({
  id: IdSchema,
  title: z.string().min(1),
  status: TaskStatusSchema,
  profile: ProfileIdSchema,
  created: z.iso.datetime(),
  parent: IdSchema.optional(),
});
type TaskNoteFrontMatter = z.infer<typeof TaskNoteFrontMatterSchema>;

// The body is raw markdown: the next agent receives the whole section as its first prompt.
export type TaskNoteHandoff = {
  toProfileId: string;
  at: string;
  body: string;
};

export type TaskNote = {
  id: string;
  title: string;
  status: z.infer<typeof TaskStatusSchema>;
  profileId: string;
  createdAt: string;
  parentTaskId: string | null;
  spec: string;
  acceptance: string | null;
  // Free text nobody parses, kept so a person can scribble in a machine-owned file.
  notes: string | null;
  handoffs: TaskNoteHandoff[];
};

type Section = { heading: string; body: string };

export function parseTaskNote(text: string, file: string = INLINE): TaskNote {
  const lines = text.split("\n");
  if (lines[0] !== FENCE) {
    throw invalid(file, `the note must open with a ${FENCE} front-matter fence`);
  }
  const close = lines.indexOf(FENCE, 1);
  if (close === -1) {
    throw invalid(file, `the front matter has no closing ${FENCE}`);
  }
  const front = parseFrontMatter(lines.slice(1, close).join("\n"), file);
  return buildNote(front, splitSections(lines.slice(close + 1), file), file);
}

export function formatTaskNote(note: TaskNote): string {
  const front = stringify({
    id: note.id,
    title: note.title,
    status: note.status,
    profile: note.profileId,
    created: note.createdAt,
    ...(note.parentTaskId === null ? {} : { parent: note.parentTaskId }),
  });
  const sections = [formatSection("Spec", note.spec)];
  if (note.acceptance !== null) {
    sections.push(formatSection("Acceptance", note.acceptance));
  }
  if (note.notes !== null) {
    sections.push(formatSection("Notes", note.notes));
  }
  for (const handoff of note.handoffs) {
    sections.push(
      formatSection(`Handoff to ${handoff.toProfileId} at ${handoff.at}`, handoff.body),
    );
  }
  return `${FENCE}\n${front}${FENCE}\n\n${sections.join("\n")}`;
}

export async function readTaskNote(repoPath: string, taskId: string): Promise<TaskNote | null> {
  const file = taskNotePath(repoPath, taskId);
  const text = await readTextFile(file);
  return text === null ? null : parseTaskNote(text, file);
}

function formatSection(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n`;
}

function parseFrontMatter(text: string, file: string): TaskNoteFrontMatter {
  let value: unknown;
  try {
    value = parse(text);
  } catch (cause) {
    if (!(cause instanceof YAMLParseError)) {
      throw cause;
    }
    throw invalid(file, `the front matter is not valid yaml: ${cause.message}`, cause);
  }
  const parsed = TaskNoteFrontMatterSchema.safeParse(value);
  if (!parsed.success) {
    throw invalid(
      file,
      `the front matter is not valid: ${describeIssues(parsed.error)}`,
      parsed.error,
    );
  }
  return parsed.data;
}

function splitSections(lines: string[], file: string): Section[] {
  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      sections.push({ heading: line.slice(3).trim(), lines: [] });
      continue;
    }
    const current = sections.at(-1);
    if (current) {
      current.lines.push(line);
    } else if (line.trim() !== "") {
      throw invalid(
        file,
        "text before the first ## heading would be lost when the note is rewritten",
      );
    }
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join("\n").trim(),
  }));
}

function buildNote(front: TaskNoteFrontMatter, sections: Section[], file: string): TaskNote {
  const named = new Map<string, string>();
  const handoffs: TaskNoteHandoff[] = [];
  for (const section of sections) {
    if (!NAMED_HEADINGS.includes(section.heading)) {
      handoffs.push(parseHandoff(section, file));
      continue;
    }
    if (named.has(section.heading)) {
      throw invalid(file, `there are two ## ${section.heading} sections`);
    }
    named.set(section.heading, section.body);
  }
  const spec = named.get("Spec");
  if (!spec) {
    throw invalid(file, "the note has no ## Spec section, or it is empty");
  }
  return {
    id: front.id,
    title: front.title,
    status: front.status,
    profileId: front.profile,
    createdAt: front.created,
    parentTaskId: front.parent ?? null,
    spec,
    acceptance: named.get("Acceptance") || null,
    notes: named.get("Notes") || null,
    handoffs,
  };
}

function parseHandoff(section: Section, file: string): TaskNoteHandoff {
  const match = HANDOFF_HEADING.exec(section.heading);
  if (!match) {
    const detail = section.heading.startsWith("Handoff")
      ? "a handoff heading reads `## Handoff to <profile id> at <iso timestamp>`"
      : `a task note holds ${NAMED_HEADINGS.map((heading) => `## ${heading}`).join(", ")} and handoff sections`;
    throw invalid(file, `## ${section.heading} is not a section a task note can hold; ${detail}`);
  }
  const parsed = z
    .object({ to: ProfileIdSchema, at: z.iso.datetime() })
    .safeParse({ to: match[1], at: match[2] });
  if (!parsed.success) {
    throw invalid(
      file,
      `## ${section.heading} is not a handoff heading: ${describeIssues(parsed.error)}`,
    );
  }
  return { toProfileId: parsed.data.to, at: parsed.data.at, body: section.body };
}

function invalid(file: string, message: string, cause?: unknown): ConfigError {
  return new ConfigError(`${file}: ${message}`, {
    code: "task-note-invalid",
    hint: `Fix ${file}.`,
    file,
    cause,
  });
}
