import {
  AGN_TABLE_MARKER,
  type MarkedBlock,
  withMarkedBlock,
  withoutMarkedBlock,
} from "@agnostic/core";
import { HooksError } from "../error.js";

/**
 * Codex's trust entries go in the user's own `config.toml`, so agn writes them between these two
 * lines and never touches a line outside them. One of agn's tables somewhere else in the file is
 * refused rather than merged: two tables of the same name would make the config unparsable.
 */
const BLOCK: MarkedBlock = {
  begin: "# >>> agn hooks: managed block, edits here are replaced >>>",
  end: "# <<< agn hooks <<<",
  refuse,
};

export type TrustTable = { key: string; hash: string };

export function withTrustBlock(text: string, tables: TrustTable[]): string {
  assertNoStrayTables(withoutMarkedBlock(text, BLOCK), tables);
  return withMarkedBlock(text, BLOCK, tables.length === 0 ? "" : blockBody(tables));
}

/**
 * Each table carries agn's marker, so the next install replaces its own tables and keeps the one
 * Codex appends after the last `hooks.state` table in the file when the user trusts a hook.
 */
function blockBody(tables: TrustTable[]): string {
  return tables
    .map((table) => `${header(table.key)}\n${AGN_TABLE_MARKER}\ntrusted_hash = "${table.hash}"\n`)
    .join("\n");
}

function header(key: string): string {
  return `[hooks.state."${key}"]`;
}

/**
 * A table agn would write that already exists elsewhere in the file - Codex writes one when the
 * user approves a hook in `/hooks` - would be a duplicate table and make the file unparsable.
 */
function assertNoStrayTables(text: string, tables: TrustTable[]): void {
  const stray = tables.find((table) => text.includes(header(table.key)));
  if (stray !== undefined) {
    throw refuse(`it already holds a ${header(stray.key)} table outside the agn block`);
  }
}

function refuse(because: string): HooksError {
  return new HooksError(`agn will not edit this Codex config: ${because}`, {
    code: "hook-config-unwritable",
    hint: "Remove the agn hook entries from ~/.codex/config.toml, then run `agn hooks install` again.",
  });
}
