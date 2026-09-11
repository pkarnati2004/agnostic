import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parse, stringify, YAMLParseError } from "yaml";
import type { z } from "zod";
import { describeIssues } from "./describe-issues.js";
import { ConfigError } from "./error.js";
import { readTextFile } from "./read-text-file.js";

/**
 * Reads one yaml file under `.ag/` through its schema. A bad file never falls back to defaults:
 * `subscriptions_only: ture` must be an error, not a silent `false`.
 */
export async function readYamlFile<T>(
  file: string,
  schema: z.ZodType<T>,
  hint: string,
): Promise<T | null> {
  const text = await readTextFile(file);
  if (text === null) {
    return null;
  }
  const parsed = schema.safeParse(parseYaml(file, text, hint));
  if (!parsed.success) {
    throw new ConfigError(`${file} is not valid: ${describeIssues(parsed.error)}`, {
      code: "ag-file-invalid",
      hint,
      file,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export async function writeYamlFile(
  file: string,
  value: Record<string, unknown>,
  header: string,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `# ${header}\n${stringify(value)}`, "utf8");
}

function parseYaml(file: string, text: string, hint: string): unknown {
  try {
    // An empty file is an empty mapping, so every key falls back to its schema default.
    return parse(text) ?? {};
  } catch (cause) {
    if (!(cause instanceof YAMLParseError)) {
      throw cause;
    }
    throw new ConfigError(`${file} is not valid yaml: ${cause.message}`, {
      code: "ag-file-malformed",
      hint,
      file,
      cause,
    });
  }
}
