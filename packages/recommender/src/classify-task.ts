import {
  type RiskRule,
  type TaskClass,
  type TaskIntent,
  TaskIntentSchema,
  type TaskScope,
} from "@agnostic/core";
import { z } from "zod";
import { RecommenderError } from "./error.js";
import keywords from "./task-keywords.json" with { type: "json" };

const Keyword = z.string().min(1);

/**
 * The classifier's whole vocabulary, as data rather than code so that a word can be added without
 * reading a function. `intents` is in priority order: the first intent with a match wins.
 */
const KeywordTablesSchema = z.strictObject({
  intents: z
    .array(z.strictObject({ intent: TaskIntentSchema, keywords: z.array(Keyword).min(1) }))
    .min(1),
  breadth: z.array(Keyword).min(1),
  browser: z.array(Keyword).min(1),
});
export type KeywordTables = z.infer<typeof KeywordTablesSchema>;

/** Above this, a prompt is describing more than one change even without a breadth word. */
const SMALL_MAX_WORDS = 15;

/** Validated as the module loads: a shipped table that does not parse is a broken build. */
export const KEYWORD_TABLES: KeywordTables = parseTables(keywords);

function parseTables(raw: unknown): KeywordTables {
  const parsed = KeywordTablesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RecommenderError("task-keywords.json is not a keyword table", {
      code: "keywords-invalid",
      hint: "Reinstall agn: the keyword table ships with it.",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * What a prompt is asking for, by rule and never by guess, so that the same words always give the
 * same answer and a user who disagrees can say `--intent` instead of rewording.
 */
export function classifyTask(
  prompt: string,
  riskRules: RiskRule[],
  tables: KeywordTables = KEYWORD_TABLES,
): TaskClass {
  const words = wordsIn(prompt);
  return {
    intent: intentOf(words, tables),
    scope: scopeOf(words, tables),
    risk: riskRules.filter((rule) => matches(words, rule.keywords)).map((rule) => rule.area),
    needsBrowser: matches(words, tables.browser),
    automaticIntent: null,
  };
}

/** `--intent`: the class keeps what the rules found, so the task records both. */
export function withIntent(taskClass: TaskClass, intent: TaskIntent): TaskClass {
  if (intent === taskClass.intent) {
    return taskClass;
  }
  return { ...taskClass, intent, automaticIntent: taskClass.intent };
}

function intentOf(words: string[], tables: KeywordTables): TaskIntent {
  // `general` is the honest answer to a prompt none of the lists recognise, not a default.
  return tables.intents.find((row) => matches(words, row.keywords))?.intent ?? "general";
}

function scopeOf(words: string[], tables: KeywordTables): TaskScope {
  if (matches(words, tables.breadth)) {
    return "large";
  }
  return words.length < SMALL_MAX_WORDS ? "small" : "medium";
}

/** A keyword matches at a word start: "auth" is in "authentication" and not in "oauth". */
function matches(words: string[], keywords: string[]): boolean {
  return words.some((word) => keywords.some((keyword) => word.startsWith(keyword.toLowerCase())));
}

function wordsIn(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}
