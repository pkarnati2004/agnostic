import { z } from "zod";
import type { HarnessId } from "./profile.js";
import type { TaskIntent } from "./task-intent.js";

/** The two files `agn sync` generates from `.ag/instructions.md`, relative to the repo root. */
export type SyncTarget = "CLAUDE.md" | "AGENTS.md";

export type SyncAction = "create" | "update" | "unchanged" | "conflict";

/**
 * `content` is what sync would write, whatever the action; `reason` is set for some of them.
 * `file` is any path relative to the repo root: the two instruction files, and a workflow's
 * `.claude/agents/<role>.md` and `.claude/commands/<workflow>.md`.
 */
export type SyncWrite = {
  file: string;
  action: SyncAction;
  content: string;
  reason: string | null;
};

/** How one role of one workflow was resolved for the files this sync wrote (ADR 036 Q12). */
export type RoleResolution = {
  workflow: string;
  role: string;
  class: TaskIntent;
  /** The `profile:` the file names, or null. */
  pinned: string | null;
  /** The profile id the generated files use. */
  profile: string;
  harness: HarnessId;
  model: string | null;
  via: "pinned" | "recommended" | "replaced";
  /** Why a pin was not used; null unless `via` is replaced. */
  reason: string | null;
};

export const SyncRequestSchema = z.strictObject({
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** `applied` is false after a dry run: the plan is the same, nothing on disk changed. */
export type SyncResponse = { writes: SyncWrite[]; roles: RoleResolution[]; applied: boolean };
