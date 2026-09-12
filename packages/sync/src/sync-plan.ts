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

/** One write per target, in table order. Nothing here touches a file; the caller applies it. */
export function planSync(inputs: SyncInputs, opts: { force: boolean }): SyncWrite[] {
  return SYNC_TARGETS.map((target) => planTarget(target, inputs, opts));
}

function planTarget(target: SyncTarget, inputs: SyncInputs, opts: { force: boolean }): SyncWrite {
  const content = renderTarget(target, inputs.instructions);
  const existing = inputs.existing[target];
  if (existing === null) {
    return { file: target, action: "create", content, reason: null };
  }
  if (existing === content) {
    return { file: target, action: "unchanged", content, reason: null };
  }
  // The header is the only record of what the last sync wrote: a file carrying it is agn's.
  if (isGenerated(existing)) {
    return { file: target, action: "update", content, reason: null };
  }
  if (isUnheadered(target, existing, inputs.instructions)) {
    return { file: target, action: "update", content, reason: "no header, same content" };
  }
  if (opts.force) {
    return { file: target, action: "update", content, reason: "overwritten with --force" };
  }
  return { file: target, action: "conflict", content, reason: "no header, hand-edited" };
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
