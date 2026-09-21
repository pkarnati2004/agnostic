import type { HooksError } from "./error.js";

/**
 * A block agn owns inside a file the user owns. Two marker lines bound it, every byte outside them
 * is preserved, and anything ambiguous - a half-written block or a second one - is refused rather
 * than guessed at. Each file format brings its own markers and its own refusal.
 */
export type MarkedBlock = {
  begin: string;
  end: string;
  refuse: (why: string) => HooksError;
};

/** The block with `body` between its markers; an empty body removes the block and its markers. */
export function withMarkedBlock(text: string, block: MarkedBlock, body: string): string {
  const framed = body === "" ? "" : `${block.begin}\n${body}${block.end}\n`;
  const bounds = blockBounds(text, block);
  const before = bounds === null ? text : text.slice(0, bounds.start);
  const after = bounds === null ? "" : text.slice(bounds.end);
  if (framed === "") {
    return `${before}${after}`;
  }
  return `${before}${separator(before)}${framed}${after}`;
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

/** The byte range the block occupies, including the newline after its end marker. */
function blockBounds(text: string, block: MarkedBlock): { start: number; end: number } | null {
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
  return { start, end: endLine === -1 ? text.length : endLine + 1 };
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
