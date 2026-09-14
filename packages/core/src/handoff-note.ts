import type { Task } from "./task.js";

/** What the outgoing agent left behind: diff-stat lines and `git status --porcelain` lines. */
export type FileChanges =
  | { kind: "git"; committed: string[]; uncommitted: string[]; worktreePath: string | null }
  | { kind: "folder" };

export type HandoffNoteInput = { note: string | null; from: Task; changes: FileChanges };

const GOAL = "Goal";
const DECISIONS = "Decisions";
const FILES = "Files touched";
const WHAT_FAILED = "What failed";
const SLOTS = [GOAL, DECISIONS, FILES, WHAT_FAILED];
const EMPTY = "none recorded";

// Level one and two would end the handoff section when the note is read back, so user headings
// come down to level three (ADR 006's heading rule); level four and deeper are left alone.
const HEADING = /^#{1,3} (.+)$/;
const FENCE = "```";

type Part = { heading: string | null; body: string };

/**
 * ADR 020: the note is what the user wrote plus what agn can see. Their text lands under Goal
 * unless they wrote their own `### Decisions` or `### What failed`; the files and the end state
 * are generated, because neither can be typed accurately after the fact.
 */
export function composeHandoffBody(input: HandoffNoteInput): string {
  const parts = split(input.note);
  const written = (heading: string): string | null =>
    parts.find((part) => part.heading === heading)?.body || null;
  const preamble = parts.find((part) => part.heading === null)?.body || null;
  const goal = written(GOAL) ?? preamble;
  return [
    section(GOAL, goal ?? `Continue from where ${input.from.profileId} left off.`),
    section(DECISIONS, written(DECISIONS) ?? EMPTY),
    section(FILES, filesTouched(written(FILES), input.changes)),
    section(WHAT_FAILED, whatFailed(written(WHAT_FAILED), input.from)),
    // A heading of the user's own that names no slot still belongs in the note, after the template.
    ...parts
      .filter((part) => part.heading !== null && !SLOTS.includes(part.heading))
      .map((part) => section(part.heading ?? "", part.body || EMPTY)),
  ].join("\n\n");
}

function section(heading: string, body: string): string {
  return `### ${heading}\n\n${body}`;
}

/** The end state is agn's line, always last: the user cannot know it when they write the note. */
function whatFailed(written: string | null, from: Task): string {
  const ended = `${from.profileId} ended ${from.status}.`;
  return written === null ? ended : `${written}\n\n${ended}`;
}

/** The user's own list stays above what git saw: a summary they passed whole often names one. */
function filesTouched(written: string | null, changes: FileChanges): string {
  const listed = fromGit(changes);
  return written === null ? listed : `${written}\n\n${listed}`;
}

function fromGit(changes: FileChanges): string {
  if (changes.kind === "folder") {
    return "not tracked (folder workspace)";
  }
  const blocks = [changes.committed.join("\n")];
  if (changes.uncommitted.length > 0) {
    // agn never commits, so these edits stay where they are; the next agent is told where that is.
    const where = changes.worktreePath === null ? "the worktree" : changes.worktreePath;
    blocks.push(`Uncommitted in ${where}:\n${changes.uncommitted.join("\n")}`);
  }
  const body = blocks.filter((block) => block !== "").join("\n\n");
  return body === "" ? "none" : body;
}

/**
 * The user's text, cut at its own headings, with every heading normalised to level three. A line
 * inside a fenced code block is code, not a heading: it neither cuts a section nor moves a level.
 */
function split(note: string | null): Part[] {
  const found: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];
  let fenced = false;
  for (const line of (note ?? "").split("\n")) {
    if (line.startsWith(FENCE)) {
      fenced = !fenced;
    }
    const match = fenced ? null : HEADING.exec(line);
    if (match === null) {
      found.at(-1)?.lines.push(fenced ? demoteLevelTwo(line) : line);
      continue;
    }
    found.push({ heading: (match[1] ?? "").trim(), lines: [] });
  }
  return found.map((part) => ({ heading: part.heading, body: part.lines.join("\n").trim() }));
}

/**
 * The one thing a fence cannot protect: the note parser ends a section at any `## ` line and knows
 * nothing about code blocks, so a level-two line comes down a level wherever it sits. Level one is
 * harmless to the parser, which is what keeps a shell comment a shell comment.
 */
function demoteLevelTwo(line: string): string {
  return line.startsWith("## ") ? `### ${line.slice(3)}` : line;
}
