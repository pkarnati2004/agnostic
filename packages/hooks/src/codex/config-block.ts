import { HooksError } from "../error.js";

/**
 * Codex's trust entries go in the user's own `config.toml`, so agn writes them between two markers
 * and never touches a line outside them. Anything ambiguous - a half-written block, a second one,
 * or one of agn's tables somewhere else in the file - is refused rather than guessed at.
 */
const BEGIN = "# >>> agn hooks: managed block, edits here are replaced >>>";
const END = "# <<< agn hooks <<<";

export type TrustTable = { key: string; hash: string };

export function withTrustBlock(text: string, tables: TrustTable[]): string {
  const block = tables.length === 0 ? "" : blockText(tables);
  const bounds = blockBounds(text);
  if (bounds === null) {
    assertNoStrayTables(text, tables);
    if (block === "") {
      return text;
    }
    const separator =
      text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    return `${text}${separator}${block}`;
  }
  const before = text.slice(0, bounds.start);
  const after = text.slice(bounds.end);
  assertNoStrayTables(before + after, tables);
  return `${before}${block}${after}`;
}

function blockText(tables: TrustTable[]): string {
  const body = tables
    .map((table) => `[hooks.state."${table.key}"]\ntrusted_hash = "${table.hash}"\n`)
    .join("\n");
  return `${BEGIN}\n${body}${END}\n`;
}

/** The byte range the block occupies, including the newline after its end marker. */
function blockBounds(text: string): { start: number; end: number } | null {
  const begin = markerLines(text, BEGIN);
  const end = markerLines(text, END);
  if (begin.length === 0 && end.length === 0) {
    return null;
  }
  if (begin.length !== 1 || end.length !== 1 || end[0] === undefined || begin[0] === undefined) {
    throw refuse("its agn block is not a single begin and end pair");
  }
  const start = begin[0];
  const endLine = text.indexOf("\n", end[0]);
  if (endLine < start) {
    throw refuse("its agn block ends before it begins");
  }
  return { start, end: endLine === -1 ? text.length : endLine + 1 };
}

function markerLines(text: string, marker: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(marker); at !== -1; at = text.indexOf(marker, at + 1)) {
    // Only a marker that owns its line is one of ours; one inside a string is somebody else's.
    if (at === 0 || text[at - 1] === "\n") {
      found.push(at);
    }
  }
  return found;
}

/**
 * A table agn would write that already exists elsewhere in the file - Codex writes one when the
 * user approves a hook in `/hooks` - would be a duplicate table and make the file unparsable.
 */
function assertNoStrayTables(text: string, tables: TrustTable[]): void {
  const stray = tables.find((table) => text.includes(`[hooks.state."${table.key}"]`));
  if (stray !== undefined) {
    throw refuse(`it already holds a [hooks.state."${stray.key}"] table outside the agn block`);
  }
}

function refuse(because: string): HooksError {
  return new HooksError(`agn will not edit this Codex config: ${because}`, {
    code: "hook-config-unwritable",
    hint: "Remove the agn hook entries from ~/.codex/config.toml, then run `agn hooks install` again.",
  });
}
