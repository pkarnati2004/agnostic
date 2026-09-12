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
  "general",
]);
export type TaskIntent = z.infer<typeof TaskIntentSchema>;
