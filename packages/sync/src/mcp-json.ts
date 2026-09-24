import { SyncError } from "./error.js";

/** One harness's MCP entries, by server name, exactly as its config file holds them. */
export type JsonEntries = Record<string, unknown>;

export function readEntries(file: string, text: string | null, key: string): JsonEntries {
  return text === null ? {} : entriesAt(file, parseObject(file, text)[key], key);
}

/**
 * agn owns the entries it names and nothing else: every other key of the file, and the order the
 * file keeps them in, survives the merge, because this is a file the user also writes in.
 */
export function withEntries(
  file: string,
  text: string | null,
  key: string,
  entries: JsonEntries,
  seed: JsonEntries,
): string {
  const root = text === null ? { ...seed } : parseObject(file, text);
  root[key] = { ...entriesAt(file, root[key], key), ...entries };
  return `${JSON.stringify(root, null, 2)}\n`;
}

function parseObject(file: string, text: string): JsonEntries {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw unreadable(file, "it is not valid JSON", cause);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw unreadable(file, "it does not hold a JSON object");
  }
  return parsed as JsonEntries;
}

function entriesAt(file: string, value: unknown, key: string): JsonEntries {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unreadable(file, `its "${key}" is not a JSON object`);
  }
  return value as JsonEntries;
}

function unreadable(file: string, because: string, cause?: unknown): SyncError {
  return new SyncError(`agn cannot write its MCP servers into ${file}: ${because}`, {
    code: "mcp-target-unreadable",
    hint: `Fix ${file}, or move it aside and run \`agn sync\` again.`,
    ...(cause === undefined ? {} : { cause }),
  });
}
