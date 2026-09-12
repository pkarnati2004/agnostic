import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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

/**
 * Writes through a temporary file in the same directory and renames it into place, so a reader
 * sees the old file or the new one and never half of either: `agn doctor --plan` rewrites the
 * user's config.yaml, and a crash mid-write would otherwise cost them the file.
 */
export async function writeYamlFile(
  file: string,
  value: Record<string, unknown>,
  header: string,
): Promise<void> {
  const directory = dirname(file);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.${basename(file)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `# ${header}\n${stringify(value)}`, "utf8");
    const mode = await modeOf(file);
    if (mode !== null) {
      // rename does not carry the old file's permissions over, and this one is the user's.
      await chmod(temporary, mode);
    }
    await rename(temporary, file);
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  }
}

async function modeOf(file: string): Promise<number | null> {
  return stat(file).then(
    (info) => info.mode,
    () => null,
  );
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
