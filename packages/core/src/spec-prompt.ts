import { type RepoStateInput, repoStateSection } from "./launch-prompt.js";
import type { TaskIntent } from "./task-intent.js";

export type SpecPromptInput = {
  /** The one-liner the user typed; it stays the task's prompt whatever the spec turns out to be. */
  prompt: string;
  intent: TaskIntent | null;
  repoState: RepoStateInput;
};

const SHAPE = `Answer in markdown and nothing else, in exactly this shape:

# <a title of at most 80 characters>

## Spec

What to change and where, as plain statements. Name files and commands where you can. Do not repeat the project instructions.

## Acceptance

A checklist, one \`- [ ]\` line per criterion, each one checkable by running or reading something.

Do not edit any file. Do not run the tests.`;

/**
 * What a headless agent is asked before a task exists. Ledger rows in, markdown out, like the
 * launch prompt: the daemon owns which rows count, this owns what they read like. The shape is
 * spelled out because the answer is parsed, and a model that ignores it costs the user a retry.
 */
export function composeSpecPrompt(input: SpecPromptInput): string {
  const task = [
    `Task: ${input.prompt}`,
    input.intent === null ? null : `Intent: ${input.intent}`,
  ].filter(present);
  const blocks = [
    "Write a task spec for this repository.",
    task.join("\n"),
    repoStateSection(input.repoState),
    SHAPE,
  ].filter(present);
  return `${blocks.join("\n\n")}\n`;
}

function present(value: string | null): value is string {
  return value !== null;
}
