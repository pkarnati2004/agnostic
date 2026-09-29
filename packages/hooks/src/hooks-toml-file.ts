import { type MarkedBlock, withMarkedBlock, withoutMarkedBlock } from "@agnostic/core";
import { HooksError } from "./error.js";

/**
 * Kimi Code keeps every preference in one TOML file and reads its hooks from `[[hooks]]` tables.
 * agn vendors no TOML writer, so it owns a marked block at the end of the file: a table header is
 * valid TOML after anything, and every byte outside the block is the user's.
 *
 * Ported from Orca's `src/main/kimi/kimi-hook-config-toml.ts`.
 * MIT License, Copyright (c) Lovecast Inc.
 */
const BLOCK: MarkedBlock = {
  begin: "# >>> agn hooks: managed block, edits here are replaced >>>",
  end: "# <<< agn hooks <<<",
  refuse,
};

export type HooksTomlEntry = { event: string; command: string; timeout: number };

export function withHooksBlock(text: string, entries: HooksTomlEntry[]): string {
  return withMarkedBlock(text, BLOCK, entries.map(table).join("\n"));
}

export function withoutHooksBlock(text: string): string {
  return withoutMarkedBlock(text, BLOCK);
}

/** No `matcher`: Kimi reads one as a regex, where Claude's literal `*` is invalid, and an absent
 * matcher already matches every tool. */
function table(entry: HooksTomlEntry): string {
  return [
    "[[hooks]]",
    `event = "${entry.event}"`,
    `command = ${basicString(entry.command)}`,
    `timeout = ${entry.timeout}`,
    "",
  ].join("\n");
}

/** A TOML basic string. A control character in one makes Kimi's parser reject the whole file. */
function basicString(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}

function refuse(because: string): HooksError {
  return new HooksError(`agn will not edit this Kimi config: ${because}`, {
    code: "hook-config-unwritable",
    hint: "Delete the agn marker lines and the [[hooks]] tables between them in ~/.kimi-code/config.toml, then run `agn hooks install` again.",
  });
}
