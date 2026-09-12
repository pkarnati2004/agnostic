import type { Outcome } from "./outcome.js";
import type { Task } from "./task.js";
import type { TaskNote, TaskNoteHandoff } from "./task-note.js";

export type DoneTask = { task: Task; outcome: Outcome | null };

export type LaunchPromptInput = {
  task: Task;
  note: TaskNote;
  done: DoneTask[];
  inFlight: Task[];
  /** The raw text of `.ag/decisions.md`, or null when the repo has none. */
  decisions: string | null;
  handoff: TaskNoteHandoff | null;
};

const DONE_LIMIT = 5;
const DECISION_LIMIT = 5;

/**
 * The first thing a harness reads. Ledger rows in, markdown out: nothing here touches the disk, so
 * the daemon owns which rows count and this owns what they read like. Project instructions are
 * deliberately absent - the harness reads the synced CLAUDE.md / AGENTS.md for those.
 */
export function composeLaunchPrompt(input: LaunchPromptInput): string {
  const sections = [
    `# Task ${input.task.id}: ${input.task.title}`,
    section("Spec", input.note.spec),
    input.note.acceptance === null ? null : section("Acceptance", input.note.acceptance),
    repoState(input),
    input.handoff === null || input.task.parentTaskId === undefined
      ? null
      : section(`Handoff from ${input.task.parentTaskId}`, input.handoff.body),
  ];
  return `${sections.filter(present).join("\n\n")}\n`;
}

export function outcomeLine(outcome: Outcome | null): string {
  if (outcome === null) {
    return "no outcome recorded";
  }
  const parts = [accepted(outcome)];
  if (outcome.testsAfter !== null) {
    parts.push(outcome.testsAfter ? "tests pass" : "tests fail");
  }
  if (outcome.humanEditRatio !== null) {
    parts.push(`human edits ${Math.round(outcome.humanEditRatio * 100)}%`);
  }
  return parts.join(", ");
}

function accepted(outcome: Outcome): string {
  if (outcome.accepted === true) {
    return "accepted";
  }
  return outcome.reverted === true ? "reverted" : "not merged";
}

function repoState(input: LaunchPromptInput): string | null {
  const blocks = [
    block(
      "Done recently",
      input.done
        .slice(0, DONE_LIMIT)
        .map((row) => `- ${row.task.title} (${where(row.task)}): ${outcomeLine(row.outcome)}`),
    ),
    block(
      "In flight",
      input.inFlight.map((task) => `- ${task.title} (${where(task)}, ${task.profileId})`),
    ),
    block(
      "Recent decisions",
      recentDecisions(input.decisions).map((line) => `- ${line}`),
    ),
  ].filter(present);
  return blocks.length === 0 ? null : section("Repo state", blocks.join("\n\n"));
}

/** A folder task has no branch, and saying so is more use to the agent than an empty pair of
 * parentheses. */
function where(task: Task): string {
  return task.branch ?? "in place";
}

function recentDecisions(decisions: string | null): string[] {
  if (decisions === null) {
    return [];
  }
  return decisions
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(-DECISION_LIMIT);
}

function block(label: string, lines: string[]): string | null {
  return lines.length === 0 ? null : `${label}:\n${lines.join("\n")}`;
}

function section(heading: string, body: string): string {
  return `## ${heading}\n\n${body}`;
}

function present(value: string | null): value is string {
  return value !== null;
}
