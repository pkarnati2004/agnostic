import { z } from "zod";
import { IdSchema } from "./id.js";
import { HarnessIdSchema } from "./profile.js";
import { RecommendationSchema } from "./recommendation.js";

export const TaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "done",
  "failed",
  "stopped",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// A task agn started has origin "agn"; one found running in tmux and taken over is "adopted".
export const TaskOriginSchema = z.enum(["agn", "adopted"]);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

export const TaskSessionSchema = z.object({
  harness: HarnessIdSchema,
  // Null until the harness reveals its own session id; the tmux session is what agn can always see.
  sessionId: z.string().min(1).nullable(),
  tmuxSession: z.string().min(1),
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  recommendation: RecommendationSchema.optional(),
  // Set once the executor has a live session to attach to.
  session: TaskSessionSchema.optional(),
  // Set when this task was handed off from another one.
  parentTaskId: IdSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;
