// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import { z } from "zod";

/** Claude Code has no listing subcommand; one control request over stream-json returns the picker. */
export const claudeModelListRequest = `${JSON.stringify({
  type: "control_request",
  request_id: "agn-model-list",
  request: { subtype: "list_models" },
})}\n`;

const ClaudeControlResponseSchema = z.object({
  type: z.literal("control_response"),
  response: z.object({
    subtype: z.literal("success"),
    response: z.object({ models: z.array(z.unknown()) }),
  }),
});

const ClaudeModelSchema = z.object({
  value: z.string().min(1),
  disabled: z.boolean().optional(),
});

/**
 * Reads the `list_models` answer out of the CLI's stream-json output. A CLI that predates the
 * request answers with a control error and still exits 0, which leaves us with no models.
 */
export function parseClaudeModelList(output: string): string[] {
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("{") || !line.includes("control_response")) {
      continue;
    }
    const parsed = ClaudeControlResponseSchema.safeParse(parseJson(line));
    if (!parsed.success) {
      continue;
    }
    const ids = unique(parsed.data.response.response.models.map(claudeModelId));
    if (ids.length > 0) {
      return ids;
    }
  }
  return [];
}

const CodexModelListSchema = z.looseObject({ models: z.array(z.unknown()).optional() });

const CodexModelSchema = z.looseObject({
  slug: z.string().min(1),
  display_name: z.string().min(1),
  visibility: z.string().optional(),
});

/**
 * `codex debug models` prints one JSON document; a row without both names is not a model, and a row
 * the CLI does not mark `"visibility": "list"` is not one a user can pick - 0.154.0 marks its
 * reserve and auto-review rows `"hide"`, and prints the field on every row it lists.
 */
export function parseCodexModelList(output: string): string[] {
  const parsed = CodexModelListSchema.safeParse(parseJson(output));
  if (!parsed.success) {
    return [];
  }
  return unique(
    (parsed.data.models ?? []).map((row) => {
      const model = CodexModelSchema.safeParse(row).data;
      return model?.visibility === "list" ? model.slug : null;
    }),
  );
}

/** OpenCode prints one id per line; anything with a space is a heading or a note, not an id. */
export function parseOpenCodeModelList(output: string): string[] {
  return unique(
    lines(output).map((line) => {
      const id = line.trim();
      return id.length === 0 || /\s/.test(id) ? null : id;
    }),
  );
}

/**
 * Cursor prints `<id> - <label>` per line, and marks the model in use with a trailing `(default)`
 * or `(current)` on the label. A line without the separator is a heading or a note, not a model.
 */
export function parseCursorModelList(output: string): string[] {
  return unique(lines(output).map((line) => /^(\S+)\s+-\s+\S/.exec(line.trim())?.[1] ?? null));
}

/** Pi prints a table whose first two columns are the provider and the model of `provider/model`. */
export function parsePiModelList(output: string): string[] {
  return unique(
    lines(output).map((line) => {
      const fields = line.trim().split(/\s+/);
      const [provider, model] = fields;
      if (fields.length < 6 || !provider || !model || provider === "provider") {
        return null;
      }
      return `${provider}/${model}`;
    }),
  );
}

const GROK_LIST_HEADER = "Available models:";

/** grok bullets the default row with `*` and every other row with `-`; both are models. */
const GROK_LIST_ROW = /^\s*[*-]\s+([^\s(]+)/;

/** grok colors the listing when it takes stdout for a terminal; the codes are not part of an id. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: an ANSI escape starts with one.
const ANSI_COLOR = /\u001b\[[0-9;]*m/g;

/**
 * `grok models` has no `--json`, so this human listing is the one machine surface. The `Default
 * model:` line and the login line above the header both hold id-shaped tokens, and a footer bullet
 * sits under the blank line that ends the section, so only the rows between the two are models.
 * Color codes go first, because they hide the header and would otherwise ride along in an id.
 */
export function parseGrokModelList(output: string): string[] {
  const rows = lines(output).map((row) => row.replaceAll(ANSI_COLOR, ""));
  const header = rows.findIndex((line) => line.trim() === GROK_LIST_HEADER);
  if (header === -1) {
    return [];
  }
  const ids: string[] = [];
  for (const row of rows.slice(header + 1)) {
    if (row.trim() === "" && ids.length > 0) {
      break;
    }
    const id = GROK_LIST_ROW.exec(row)?.[1];
    if (id !== undefined) {
      ids.push(id);
    }
  }
  return unique(ids);
}

function claudeModelId(entry: unknown): string | null {
  const model = ClaudeModelSchema.safeParse(entry);
  if (!model.success || model.data.disabled === true) {
    return null;
  }
  const id = model.data.value.trim();
  // The CLI advertises models it cannot run as disabled placeholders, and mirrors the current
  // pick as a `default` row; both send a sentinel rather than a model name to `--model`.
  return id.length === 0 || id === "default" ? null : id;
}

/** Listings come from terminals: CR, LF and CRLF all end a line. */
function lines(output: string): string[] {
  return output.split(/\r\n|\r|\n/);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A line that is not JSON fails its caller's schema, and the harness keeps its seeded ids.
    return null;
  }
}

function unique(ids: Array<string | null>): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
