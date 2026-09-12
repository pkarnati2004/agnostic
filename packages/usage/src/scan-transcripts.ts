// Walking the transcript roots for `*.jsonl`, and skipping a file whose size and mtime have not
// changed, come from stablyai/orca `src/main/claude-usage/transcript-file-discovery.ts` and
// `scanner.ts` (MIT © Lovecast Inc.).
import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { UsageError } from "./error.js";
import { transcriptParser } from "./harness-transcripts.js";
import type { TranscriptTurn } from "./transcript-parser.js";

export type TranscriptRoot = { harness: HarnessId; dir: string };

/** What a file looked like when it was last parsed; one memo lives for the life of the process. */
export type ScanMemo = Map<string, { size: number; mtimeMs: number }>;

export type ScanResult = {
  turns: TranscriptTurn[];
  parsedFiles: number;
  /** Usage events read that carried no per-bucket split, so no row could be built from them. */
  skipped: number;
  problems: UsageError[];
};

/**
 * Every turn the harnesses have written that agn has not already read. A file whose size and
 * mtime match the memo is not opened, so a scan over an unchanged tree costs one stat per file.
 * `modifiedSince` bounds the first scan, which would otherwise read years of history.
 */
export async function scanTranscripts(opts: {
  roots: TranscriptRoot[];
  memo: ScanMemo;
  modifiedSince: number | null;
}): Promise<ScanResult> {
  const turns: TranscriptTurn[] = [];
  const problems: UsageError[] = [];
  let parsedFiles = 0;
  let skipped = 0;
  for (const root of opts.roots) {
    const parser = transcriptParser(root.harness);
    if (parser === null) {
      continue;
    }
    for (const path of (await walk(root.dir, problems)).sort()) {
      if (!parser.isTranscript(path)) {
        continue;
      }
      const info = await stat(path).catch(() => null);
      if (info === null || !changed(opts, path, info.size, info.mtimeMs)) {
        continue;
      }
      try {
        const parsed = await parser.parse(path);
        turns.push(...parsed.turns);
        skipped += parsed.skipped;
        parsedFiles += 1;
        opts.memo.set(path, { size: info.size, mtimeMs: info.mtimeMs });
      } catch (cause) {
        // One unreadable transcript is not a reason to report no usage at all.
        problems.push(unreadable(path, cause));
      }
    }
  }
  return { turns, parsedFiles, skipped, problems };
}

function changed(
  opts: { memo: ScanMemo; modifiedSince: number | null },
  path: string,
  size: number,
  mtimeMs: number,
): boolean {
  const seen = opts.memo.get(path);
  if (seen !== undefined) {
    return seen.size !== size || seen.mtimeMs !== mtimeMs;
  }
  return opts.modifiedSince === null || mtimeMs >= opts.modifiedSince;
}

/** A root that does not exist is a harness that has never run here, not a problem to report. */
async function walk(dir: string, problems: UsageError[]): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if (isMissing(cause)) {
      return [];
    }
    problems.push(unreadable(dir, cause));
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    // Claude Code keeps a session's sub-agent transcripts in a directory beside its own file.
    if (entry.isDirectory()) {
      files.push(...(await walk(path, problems)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

function unreadable(path: string, cause: unknown): UsageError {
  return new UsageError(`${path} could not be read`, {
    code: "transcript-unreadable",
    hint: "Check that the file is readable; agn counts the rest of the transcripts either way.",
    cause,
  });
}
