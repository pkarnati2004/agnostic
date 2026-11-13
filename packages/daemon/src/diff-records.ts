import type { ChangedFileStatus } from "@agnostic/core";

/** C is a copy: nothing was there before, so the panel reads it as a new file. */
export function statusOf(code: string): ChangedFileStatus {
  const letter = code[0] ?? "M";
  if (letter === "A" || letter === "C") {
    return "added";
  }
  if (letter === "D") {
    return "deleted";
  }
  return letter === "R" ? "renamed" : "modified";
}

type NameStatus = { code: string; path: string; from: string | null };

/** `-z` writes the status and the path as separate records; a rename or a copy writes two paths. */
export function parseNameStatus(stdout: string | null): NameStatus[] {
  const fields = (stdout ?? "").split("\0").filter((field) => field !== "");
  const entries: NameStatus[] = [];
  for (let index = 0; index < fields.length; ) {
    const code = fields[index++] ?? "";
    const first = fields[index++] ?? "";
    const renamed = code.startsWith("R") || code.startsWith("C");
    const second = renamed ? (fields[index++] ?? "") : "";
    entries.push(renamed ? { code, path: second, from: first } : { code, path: first, from: null });
  }
  return entries;
}

type Counts = { additions: number | null; deletions: number | null };

/** A rename's record ends with an empty path field, and its two paths follow as their own. */
export function parseNumstat(stdout: string | null): Map<string, Counts> {
  const fields = (stdout ?? "").split("\0");
  const counts = new Map<string, Counts>();
  for (let index = 0; index < fields.length; ) {
    const [additions, deletions, path] = (fields[index++] ?? "").split("\t");
    if (path === undefined) {
      continue;
    }
    if (path !== "") {
      counts.set(path, { additions: lineCount(additions), deletions: lineCount(deletions) });
      continue;
    }
    // A rename: its old path follows, then the name the file has now, which is the row's.
    index += 1;
    counts.set(fields[index++] ?? "", {
      additions: lineCount(additions),
      deletions: lineCount(deletions),
    });
  }
  return counts;
}

/** git writes "-" for a binary file, which is not a number of lines. */
export function lineCount(field: string | undefined): number | null {
  const value = Number(field);
  return Number.isInteger(value) ? value : null;
}
