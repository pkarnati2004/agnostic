import { z } from "zod";

/**
 * What a task is for. The catalog labels benchmark rows with it and chunk 12's classifier answers
 * in the same words, so the join is one definition. `general` is a benchmark that spans intents.
 */
export const TaskIntentSchema = z.enum([
  "implement",
  "debug",
  "refactor",
  "review",
  "research",
  "ui",
  // Not an agent class at all: a design task is a worktree and a design tool, with no agent in it.
  "design",
  "general",
]);
export type TaskIntent = z.infer<typeof TaskIntentSchema>;
