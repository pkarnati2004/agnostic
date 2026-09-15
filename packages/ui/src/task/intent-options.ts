import type { TaskIntent } from "@agnostic/core";

/**
 * What the Intent select offers: the classifier's own intents, with "automatic" for leaving the
 * prompt to be read. `satisfies` is what keeps the list from drifting from core's enum.
 */
export const INTENT_OPTIONS = [
  "automatic",
  "implement",
  "debug",
  "refactor",
  "review",
  "research",
  "ui",
  "general",
] as const satisfies readonly (TaskIntent | "automatic")[];

export type IntentOption = (typeof INTENT_OPTIONS)[number];
