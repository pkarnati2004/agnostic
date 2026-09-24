/** One row of a patch: the marker decides the colour, the two numbers fill the gutter columns. */
export type DiffLineKind = "context" | "add" | "del" | "meta";

export type DiffLine = {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
};

export type DiffHunk = { header: string; lines: DiffLine[] };

export type ParsedDiff = { hunks: DiffHunk[]; binary: boolean };

// The counts after the commas are not read: the rows are numbered as they are walked.
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

type OpenHunk = { hunk: DiffHunk; oldNo: number; newNo: number };

/**
 * git's unified output for one file. Everything before the first `@@` is the preamble - the
 * `diff --git`, `index`, mode, rename and `---`/`+++` lines - and none of it is drawn, so it is
 * skipped rather than parsed.
 */
export function parseUnifiedDiff(patch: string): ParsedDiff {
  const hunks: DiffHunk[] = [];
  let open: OpenHunk | null = null;
  let binaryLine = false;
  for (const line of bodyLines(patch)) {
    const header = HUNK.exec(line);
    if (header !== null) {
      open = startHunk(line, header);
      hunks.push(open.hunk);
      continue;
    }
    if (open === null || !appended(open, line)) {
      open = null;
      binaryLine ||= line.startsWith("Binary files");
    }
  }
  // git prints its binary marker in place of the hunks, so a patch that has hunks is not binary.
  return { hunks, binary: binaryLine && hunks.length === 0 };
}

/**
 * A patch ends with a newline, and the empty string after it is not a line of the file. A patch of
 * a file with CRLF endings carries the `\r` on every line, headers included: it is part of the
 * separator, not of the text, so the renderer never sees it.
 */
function bodyLines(patch: string): string[] {
  const lines = patch.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function startHunk(line: string, header: RegExpExecArray): OpenHunk {
  return {
    hunk: { header: line.trimEnd(), lines: [] },
    oldNo: Number(header[1]),
    newNo: Number(header[2]),
  };
}

/** False for a line that is not hunk body, which is where the hunk ends. */
function appended(open: OpenHunk, line: string): boolean {
  if (line.startsWith("\\")) {
    const text = line.replace(/^\\ ?/, "");
    open.hunk.lines.push({ kind: "meta", oldNo: null, newNo: null, text });
    return true;
  }
  const text = line.slice(1);
  if (line.startsWith("+")) {
    open.hunk.lines.push({ kind: "add", oldNo: null, newNo: open.newNo, text });
    open.newNo += 1;
    return true;
  }
  if (line.startsWith("-")) {
    open.hunk.lines.push({ kind: "del", oldNo: open.oldNo, newNo: null, text });
    open.oldNo += 1;
    return true;
  }
  // An unchanged line is " text"; an empty one survives a trailing-space trim as "".
  if (line.startsWith(" ") || line === "") {
    open.hunk.lines.push({ kind: "context", oldNo: open.oldNo, newNo: open.newNo, text });
    open.oldNo += 1;
    open.newNo += 1;
    return true;
  }
  return false;
}
