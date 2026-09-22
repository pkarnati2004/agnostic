import type { Migration } from "../migrate.js";

/**
 * Every harness agn has a registry row for has a bare id as of 2026-09-21 (ADR 035), so a stored
 * `other:<id>` that names one is rewritten once, here. The list is frozen in this file and never
 * read from the registry: a migration has to keep saying what it said on the day it ran. An
 * `other:<name>` agn has no row for is left alone, because that is still what `other:` means.
 *
 * The columns that hold a harness or profile id: `tasks.profile_id`, `$.harness` in
 * `tasks.session_json`, the three profile ids in `tasks.recommendation_json`, and `usage.harness`.
 * `events.payload_json` is history and keeps the ids it was written with; `outcomes` and `repos`
 * hold neither.
 */
const MOVED = [
  "claude-code",
  "codex",
  "pi",
  "opencode",
  "gemini",
  "droid",
  "cursor-agent",
  "kimi",
  "devin",
  "openclaude",
  "command-code",
  "omp",
  "mimo-code",
  "grok",
  "copilot",
  "autohand",
  "antigravity",
  "aider",
  "goose",
  "amp",
  "kilo",
  "kiro",
  "crush",
  "aug",
  "cline",
  "codebuff",
  "continue",
  "mistral-vibe",
  "qwen-code",
  "rovo",
  "hermes",
  "openclaw",
  "ante",
  "trae",
  "prime-agent",
  "mastracode",
  "fx",
  "deepseek",
];

/** Cursor Agent is the one row whose id changed spelling as well as losing the prefix. */
const RENAMED: [string, string][] = [["other:cursor", "cursor-agent"]];

const MOVES: [string, string][] = [
  ...MOVED.map((id): [string, string] => [`other:${id}`, id]),
  ...RENAMED,
];

const VALUES = MOVES.map(([from, to]) => `('${from}', '${to}')`).join(",\n  ");

/** A profile id starts with its harness, so the rest of the id rides along unchanged. */
function rewriteProfileId(table: string, column: string): string {
  const matches = `substr(${table}.${column}, 1, length(m.old) + 1) = m.old || ':'`;
  return `
UPDATE ${table} SET ${column} = (
  SELECT m.new || substr(${table}.${column}, length(m.old) + 1) FROM harness_id_moves m
  WHERE ${matches}
)
WHERE EXISTS (SELECT 1 FROM harness_id_moves m WHERE ${matches});`;
}

/** A profile id inside a JSON column; `json_set` rewrites the one path and reformats the rest. */
function rewriteProfileIdInJson(column: string, path: string): string {
  const stored = `json_extract(tasks.${column}, '${path}')`;
  const matches = `substr(${stored}, 1, length(m.old) + 1) = m.old || ':'`;
  return `
UPDATE tasks SET ${column} = json_set(${column}, '${path}', (
  SELECT m.new || substr(${stored}, length(m.old) + 1) FROM harness_id_moves m WHERE ${matches}
))
WHERE EXISTS (SELECT 1 FROM harness_id_moves m WHERE ${matches});`;
}

const RECOMMENDATION_PATHS = [
  "$.recommended.profileId",
  "$.alternative.profileId",
  "$.worthTrying.profileId",
];

export const harnessIds: Migration = {
  version: 5,
  name: "harness-ids",
  sql: `
CREATE TABLE harness_id_moves (old TEXT PRIMARY KEY, new TEXT NOT NULL);

INSERT INTO harness_id_moves (old, new) VALUES
  ${VALUES};

UPDATE usage SET harness = (SELECT m.new FROM harness_id_moves m WHERE m.old = usage.harness)
WHERE harness IN (SELECT old FROM harness_id_moves);

UPDATE tasks SET session_json = json_set(session_json, '$.harness', (
  SELECT m.new FROM harness_id_moves m WHERE m.old = json_extract(tasks.session_json, '$.harness')
))
WHERE json_extract(session_json, '$.harness') IN (SELECT old FROM harness_id_moves);
${rewriteProfileId("tasks", "profile_id")}
${RECOMMENDATION_PATHS.map((path) => rewriteProfileIdInJson("recommendation_json", path)).join("\n")}

DROP TABLE harness_id_moves;
`,
};
