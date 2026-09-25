import type { CoreError } from "./error.js";

/**
 * A block agn owns inside a file the user owns. Two marker lines bound it, every byte outside them
 * is preserved, and anything ambiguous - a half-written block or a second one - is refused rather
 * than guessed at. Each file format brings its own markers and its own refusal.
 */
export type MarkedBlock = {
  begin: string;
  end: string;
  refuse: (why: string) => CoreError;
};

/**
 * The comment agn writes as the first line under every table header inside a block, so a later write
 * can tell its own tables from one another tool appended into the block. A tool that appends a table
 * after the last one of its kind lands inside agn's block: Codex does this with
 * `[hooks.state."<key>"]` when the user trusts a hook, and `codex mcp add` does it with
 * `[mcp_servers.<name>]`. An unmarked table moves below the end marker instead of being dropped.
 */
export const AGN_TABLE_MARKER = "# agn";

/** The block with `body` between its markers; an empty body removes the block and its markers. */
export function withMarkedBlock(text: string, block: MarkedBlock, body: string): string {
  const bounds = blockBounds(text, block);
  const before = bounds === null ? text : text.slice(0, bounds.start);
  const after = bounds === null ? "" : text.slice(bounds.end);
  if (body === "") {
    return `${before}${after}`;
  }
  const framed = `${block.begin}\n${body}${block.end}\n`;
  const moved = foreignText(bounds?.body ?? "", body, block, `${before}${after}`);
  const tail = moved === "" || after === "" ? after : `${separator(moved)}${after}`;
  return `${before}${separator(before)}${framed}${moved}${tail}`;
}

/** One blank line between the user's last line and agn's, however the file ended. */
function separator(before: string): string {
  if (before === "" || before.endsWith("\n\n")) {
    return "";
  }
  return before.endsWith("\n") ? "\n" : "\n\n";
}

export function withoutMarkedBlock(text: string, block: MarkedBlock): string {
  return withMarkedBlock(text, block, "");
}

type Group = { header: string; lines: string[] };

/**
 * What the old block held that agn did not write, re-emitted below the end marker so the next write
 * finds it outside the block and leaves it alone. The block's own body is tables, so a table header
 * after the end marker cannot change which table the lines under it belong to. Lines that move are
 * re-emitted with LF endings, whatever they arrived with.
 */
function foreignText(old: string, body: string, block: MarkedBlock, outside: string): string {
  const kept = foreignGroups(old, body, block)
    .map((group) => `${group.lines.join("\n").trimEnd()}\n`)
    .filter((text) => text.trim() !== "" && !outside.includes(text.trimEnd()));
  return kept.length === 0 ? "" : `\n${kept.join("\n")}`;
}

/**
 * The groups of the old block somebody else wrote. agn's own carry `AGN_TABLE_MARKER`, so a stale one
 * - a trust key whose handler index moved - is dropped with the rest of the old body, and a table
 * another tool appended into the block is kept.
 */
function foreignGroups(old: string, body: string, block: MarkedBlock): Group[] {
  const previous = groups(old);
  const mine = new Set(groups(body).map((group) => group.header));
  // A block an older agn wrote carries no markers at all. On the first write after the upgrade its
  // groups are agn's where agn is writing the same header, and somebody else's for the rest.
  const unmarked = !previous.some(marked);
  const foreign = previous.filter(
    (group) => !marked(group) && !(unmarked && mine.has(group.header)),
  );
  // Two tables of the same name make the file unparsable, so a foreign table agn is also writing
  // can neither move below the block nor be dropped. An `[[array]]` entry may repeat and moves.
  const clash = foreign.find(
    (group) =>
      group.header.startsWith("[") && !group.header.startsWith("[[") && mine.has(group.header),
  );
  if (clash !== undefined) {
    throw block.refuse(`its agn block holds a ${clash.header} table agn did not write`);
  }
  return foreign;
}

/** agn writes its marker as the first line under the header, so the group's second line carries it. */
function marked(group: Group): boolean {
  return group.header !== "" && group.lines[1]?.trim() === AGN_TABLE_MARKER;
}

/**
 * The body split at its table headers: one group per table, plus whatever came above the first. A
 * header is found by line, so a `[` starting a line inside a multi-line string would read as one;
 * every line in agn's blocks is machine-written and holds no multi-line string.
 */
function groups(body: string): Group[] {
  const found: Group[] = [];
  // The body ends with the newline before the end marker, so the last piece of the split is empty.
  for (const line of body.split("\n").slice(0, -1)) {
    const header = line.trimStart().startsWith("[") ? line.trim() : null;
    if (header !== null || found.length === 0) {
      found.push({ header: header ?? "", lines: [] });
    }
    found[found.length - 1]?.lines.push(line);
  }
  return found;
}

/** The byte range the block occupies, including the newline after its end marker, and its body. */
function blockBounds(
  text: string,
  block: MarkedBlock,
): { start: number; end: number; body: string } | null {
  const begin = markerLines(text, block.begin);
  const end = markerLines(text, block.end);
  if (begin.length === 0 && end.length === 0) {
    return null;
  }
  if (begin.length !== 1 || end.length !== 1 || end[0] === undefined || begin[0] === undefined) {
    throw block.refuse("its agn block is not a single begin and end pair");
  }
  const start = withSeparator(text, begin[0]);
  const endLine = text.indexOf("\n", end[0]);
  if (endLine < start) {
    throw block.refuse("its agn block ends before it begins");
  }
  const bodyStart = text.indexOf("\n", begin[0]) + 1;
  const body = bodyStart === 0 || bodyStart > end[0] ? "" : text.slice(bodyStart, end[0]);
  return { start, end: endLine === -1 ? text.length : endLine + 1, body };
}

/**
 * The blank line agn put in front of the block belongs to the block, so removing it twice in a row
 * does not leave the file a line longer each time. The newline that ends the user's own last line
 * is theirs and stays.
 */
function withSeparator(text: string, begin: number): number {
  let start = begin;
  while (start >= 2 && text[start - 1] === "\n" && text[start - 2] === "\n") {
    start -= 1;
  }
  return start;
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
