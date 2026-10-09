import { z } from "zod";
import { IdSchema } from "./id.js";
import { HarnessIdSchema } from "./profile.js";
import { RecommendationSchema } from "./recommendation.js";
import { TASK_STATUSES } from "./task-status.js";

export const TaskStatusSchema = z.enum(TASK_STATUSES);

// A task agn started has origin "agn"; one found running in tmux and taken over is "adopted".
export const TaskOriginSchema = z.enum(["agn", "adopted"]);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

export const TaskSessionSchema = z.object({
  harness: HarnessIdSchema,
  // Null until the harness reveals its own session id; the tmux session is what agn can always see.
  sessionId: z.string().min(1).nullable(),
  // Null is a session that is not under tmux at all, which agn can watch but never attach to.
  tmuxSession: z.string().min(1).nullable(),
  // Null is the user's default tmux server: an adopted session agn did not create.
  tmuxSocket: z.string().min(1).nullable().default(null),
  // Which launch this session is: a resume reuses the tmux session name, so an exit reported for
  // an earlier launch must not be read as this one's. Null for adopted and pre-launchId rows.
  launchId: z.string().min(1).nullable().default(null),
  // The harness process itself, known for an adopted session and the only liveness agn has
  // when that session is not under tmux; null when agn launched it.
  pid: z.number().int().positive().nullable().default(null),
  // Where the harness runs: the worktree for git tasks, the repo for folder tasks.
  cwd: z.string().min(1),
  lastSeenAt: z.iso.datetime(),
});
export type TaskSession = z.infer<typeof TaskSessionSchema>;

export const TaskSchema = z.object({
  id: IdSchema,
  repoId: IdSchema,
  title: z.string().min(1),
  prompt: z.string(),
  profileId: z.string().min(1),
  worktreePath: z.string().nullable(),
  branch: z.string().nullable(),
  status: TaskStatusSchema,
  origin: TaskOriginSchema.default("agn"),
  // The commit the branch started from. Null for a folder task, an adopted one, and rows written
  // before agn recorded it; everything derived from the diff is null with it.
  baseCommit: z.string().nullable().default(null),
  // Shared by the siblings of one `agn compare`; null for every other task.
  compareId: IdSchema.nullable().default(null),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  recommendation: RecommendationSchema.optional(),
  // Set once the executor has a live session to attach to.
  session: TaskSessionSchema.optional(),
  // Set when this task was handed off from another one.
  parentTaskId: IdSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;
