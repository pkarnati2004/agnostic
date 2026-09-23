import { z } from "zod";
import type { TaskListRow } from "./daemon-api.js";
import type { Outcome } from "./outcome.js";
import type { Billing } from "./profile.js";
import type { Task } from "./task.js";
import { TaskIntentSchema } from "./task-intent.js";
import type { UsageSum } from "./usage.js";

export const StartCompareRequestSchema = z.strictObject({
  prompt: z.string().min(1),
  /** Profile ids or bare harness ids, resolved as `RunTaskRequest.profile` is; must resolve to
   * distinct profiles. */
  profiles: z.array(z.string().min(1)).min(2).max(4),
  title: z.string().min(1).optional(),
  intent: TaskIntentSchema.optional(),
  spec: z.string().min(1).optional(),
  acceptance: z.string().min(1).optional(),
});
export type StartCompareRequest = z.infer<typeof StartCompareRequestSchema>;

/** `tasks` in the order of `profiles`, each already running. */
export type StartCompareResponse = { compareId: string; tasks: Task[] };

/** Files with a change and the line counts over them; binary files count in `files` only. */
export type CompareChanges = { files: number; additions: number; deletions: number };

export type CompareTaskRow = TaskListRow & {
  outcome: Outcome | null;
  usage: UsageSum;
  /** From the task's profile, as `GET /tasks/:id/usage` reports it; null when it cannot be
   * resolved. */
  billing: Billing | null;
  /** The working tree against the base while the worktree is there, the branch after a clean;
   * null when git could not answer (the branch is gone, the base unresolved). */
  changes: CompareChanges | null;
};

export type CompareResponse = {
  compareId: string;
  repoId: string;
  prompt: string;
  title: string;
  /** Oldest first, which is the order `profiles` was given in. */
  tasks: CompareTaskRow[];
  /** The one sibling agn has not cleaned while every other one was: what `pick` kept. Null before
   * a pick, and null again when nothing distinguishes one sibling from the rest. */
  pickedTaskId: string | null;
};

/** `taskId` is a sibling's id or the prefix of one. */
export const PickCompareRequestSchema = z.strictObject({ taskId: z.string().min(1) });
export type PickCompareRequest = z.infer<typeof PickCompareRequestSchema>;

/** `cleaned` is every other sibling as it is now, whether or not this call was the one that
 * cleaned it. */
export type PickCompareResponse = { compareId: string; kept: Task; cleaned: Task[] };
