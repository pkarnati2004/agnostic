import type { SyncTarget, SyncWrite } from "@agnostic/core";
import {
  isGenerated,
  renderTarget,
  targetBody,
  withoutTrailingNewlines,
} from "./generated-header.js";

/** The v0 table (ADR 017): Claude Code reads CLAUDE.md, Codex, OpenCode and Pi read AGENTS.md. */
const SYNC_TARGETS: SyncTarget[] = ["CLAUDE.md", "AGENTS.md"];

export type SyncInputs = { instructions: string; existing: Record<SyncTarget, string | null> };

/**
 * One file sync would write, and the one case where a file without the header may still be taken
 * over: `adoptable` answers "this is what sync would have written anyway".
 */
export type PlannedTarget = {
  file: string;
  content: string;
  adoptable?: (existing: string) => boolean;
};

/** ADR 017's decision for every target. Nothing here touches a file; the caller applies it. */
export function planWrites(
  targets: PlannedTarget[],
  existing: Record<string, string | null>,
  opts: { force: boolean },
): SyncWrite[] {
  return targets.map((target) => planTarget(target, existing[target.file] ?? null, opts));
}

/** One write per instruction target, in table order. */
export function planSync(inputs: SyncInputs, opts: { force: boolean }): SyncWrite[] {
  const targets = SYNC_TARGETS.map((target) => ({
    file: target,
    content: renderTarget(target, inputs.instructions),
    adoptable: (existing: string) => isUnheadered(target, existing, inputs.instructions),
  }));
  return planWrites(targets, inputs.existing, opts);
}

function planTarget(
  target: PlannedTarget,
  existing: string | null,
  opts: { force: boolean },
): SyncWrite {
  const write = { file: target.file, content: target.content };
  if (existing === null) {
    return { ...write, action: "create", reason: null };
  }
  if (existing === target.content) {
    return { ...write, action: "unchanged", reason: null };
  }
  // The header is the only record of what the last sync wrote: a file carrying it is agn's.
  if (isGenerated(existing)) {
    return { ...write, action: "update", reason: null };
  }
  if (target.adoptable?.(existing) === true) {
    return { ...write, action: "update", reason: "no header, same content" };
  }
  if (opts.force) {
    return { ...write, action: "update", reason: "overwritten with --force" };
  }
  return { ...write, action: "conflict", reason: "no header, hand-edited" };
}

/**
 * `agn init` leaves the file it seeded `instructions.md` from in place, so a target that still
 * holds exactly that text - or exactly what sync would put under the header - gains the header
 * and loses nothing.
 */
function isUnheadered(target: SyncTarget, existing: string, instructions: string): boolean {
  return sameText(existing, instructions) || sameText(existing, targetBody(target, instructions));
}

/** Only the trailing newline is forgiven; a file someone saved as CRLF is a different file. */
function sameText(a: string, b: string): boolean {
  return withoutTrailingNewlines(a) === withoutTrailingNewlines(b);
}
