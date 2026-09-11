import { z } from "zod";
import { IdSchema } from "./id.js";
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

export const TaskSchema = z.object({
  id: IdSchema,
  repoId: IdSchema,
  title: z.string().min(1),
  prompt: z.string(),
  profileId: z.string().min(1),
  worktreePath: z.string().nullable(),
  branch: z.string().nullable(),
  status: TaskStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  recommendation: RecommendationSchema.optional(),
  // Set when this task was handed off from another one.
  parentTaskId: IdSchema.optional(),
});
export type Task = z.infer<typeof TaskSchema>;
