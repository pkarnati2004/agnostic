import type { Dirent } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, sep } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { harnessDefinition } from "@agnostic/registry";

/**
 * What the harness's own transcript tree says about a recorded session id. `unreadable` is not a
 * failure to report: an id agn could not check keeps the benefit of the doubt, because discarding
 * a good id costs a conversation while a wrong native launch costs one relaunch.
 */
export type SessionEvidence = "found" | "none" | "unreadable";

/** Codex's year/month/day is the deepest tree either tier-1 harness writes. */
const MAX_DEPTH = 4;

/** A tree larger than this is not walked to the end; it reads `unreadable` instead. */
const MAX_ENTRIES = 5_000;

const EXTENSION = ".jsonl";

type EvidenceInput = {
  /** The user's home, which the registry's transcripts directory hangs off. */
  home: string;
  harness: HarnessId;
  sessionId: string;
};

/**
 * Whether the harness still holds the session `--resume` would be handed, which its registry row
 * says how to check. A harness agn cannot check keeps the benefit of the doubt: the resume is
 * tried, because refusing one costs a conversation and a wrong try costs a relaunch.
 */
export async function sessionEvidence(input: EvidenceInput): Promise<SessionEvidence> {
  const def = harnessDefinition(input.harness);
  const evidence = def.resume?.evidence ?? "unchecked";
  if (evidence === "unchecked" || def.transcriptsDir === null) {
    return "unreadable";
  }
  const root = join(input.home, def.transcriptsDir);
  return evidence === "transcript-path"
    ? insideTranscripts(root, input.sessionId)
    : namedTranscript(root, input.sessionId);
}

/**
 * The session is a transcript path the harness's own hook reported (Pi). It counts only inside
 * the harness's transcript tree, after both sides are resolved, so neither a symlink nor a `..`
 * can point the resume at a file somewhere else.
 */
async function insideTranscripts(root: string, sessionId: string): Promise<SessionEvidence> {
  if (!isAbsolute(sessionId)) {
    return "none";
  }
  try {
    const [tree, file] = await Promise.all([realpath(root), realpath(sessionId)]);
    return file.startsWith(tree + sep) ? "found" : "none";
  } catch {
    // Either the tree has never been written or the file is gone; both start fresh.
    return "none";
  }
}

/**
 * Both tier-1 harnesses name the file after the id - `<project>/<id>.jsonl` for Claude Code,
 * `rollout-<ts>-<id>.jsonl` for Codex - so the names alone answer it, and no transcript is
 * opened. The id is never joined into a path, so an id carrying `../` cannot reach outside the
 * tree, and a symlinked directory is never followed, so the walk cannot loop or leave the root.
 */
async function namedTranscript(root: string, sessionId: string): Promise<SessionEvidence> {
  let level = [root];
  let budget = MAX_ENTRIES;
  // A symlinked directory the walk declined to follow: the tree holds somewhere it did not look.
  let declined = false;
  for (let depth = 1; depth <= MAX_DEPTH && level.length > 0; depth += 1) {
    const next: string[] = [];
    for (const dir of level) {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (cause) {
        // The root not being there means the harness has written nothing under this home, which
        // is the same tree `--resume` reads; anything else is a tree agn could not read.
        return dir === root && isMissing(cause) ? "none" : "unreadable";
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          next.push(join(dir, entry.name));
        } else if (namesSession(entry.name, sessionId)) {
          // A symlink counts: only the name is ever read, and `--resume` opens whatever it points at.
          return "found";
        } else if (entry.isSymbolicLink()) {
          // Following one could loop or read another volume, so it is left alone - and a tree with
          // somewhere unlooked in it cannot answer "none".
          declined = true;
        }
      }
      budget -= entries.length;
      if (budget < 0) {
        return "unreadable";
      }
    }
    level = next;
  }
  return declined ? "unreadable" : "none";
}

/**
 * On a boundary rather than a substring: one id can contain another, and a match on the wrong
 * file resumes natively with an id the harness does not hold - the launch failure this check
 * exists to stop. The two shapes are `<id>.jsonl` and `rollout-<timestamp>-<id>.jsonl`; the
 * timestamp is not matched by shape, because the day Codex changes its format that would read as
 * absence and throw away good ids.
 */
function namesSession(name: string, sessionId: string): boolean {
  const stem = name.endsWith(EXTENSION) ? name.slice(0, -EXTENSION.length) : null;
  if (stem === null) {
    return false;
  }
  return stem === sessionId || (stem.startsWith("rollout-") && stem.endsWith(`-${sessionId}`));
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
