import { z } from "zod";
import { IdSchema } from "./id.js";
import { OutcomeSchema } from "./outcome.js";
import { PlanSchema } from "./plans.js";
import { HarnessIdSchema, ProfileSchema } from "./profile.js";
import { RecommendationSchema } from "./recommendation.js";
import { RepoSchema } from "./repo.js";
import { TaskSchema, TaskSessionSchema, TaskStatusSchema } from "./task.js";

export const EventKindSchema = z.enum([
  "task.created",
  "task.status",
  "task.adopted",
  "task.cleaned",
  "task.deleted",
  "task.handoff",
  "session.captured",
  "repo.registered",
  "repo.updated",
  "usage.recorded",
  "outcome.recorded",
  "profile.detected",
  "recommendation.made",
  "plan.changed",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

const payloadSchemas = {
  "task.created": z.object({ task: TaskSchema }),
  "task.status": z.object({ from: TaskStatusSchema, to: TaskStatusSchema }),
  "task.adopted": z.object({ pid: z.number().int().positive(), cwd: z.string().min(1) }),
  // A worktree agn removed. Chunk 15 reads this: a worktree gone without one was removed by hand.
  "task.cleaned": z.object({ deletedBranch: z.boolean() }),
  // The one event that outlives the task: it is appended after the task's own events are deleted,
  // so the live feed and the cursor see the deletion the row cannot report itself.
  "task.deleted": z.object({ removedWorktree: z.boolean() }),
  "task.handoff": z.object({
    fromProfileId: z.string().min(1),
    toProfileId: z.string().min(1),
    childTaskId: IdSchema,
    note: z.string().nullable(),
  }),
  "session.captured": z.object({ session: TaskSessionSchema }),
  // Both repo kinds carry the whole row, so a consumer can upsert without a second read.
  "repo.registered": z.object({ repo: RepoSchema }),
  "repo.updated": z.object({ repo: RepoSchema }),
  "usage.recorded": z.object({
    tokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
    source: z.enum(["transcript", "hook"]),
  }),
  "outcome.recorded": z.object({ outcome: OutcomeSchema }),
  "profile.detected": z.object({ profile: ProfileSchema }),
  "recommendation.made": z.object({
    recommendation: RecommendationSchema,
    chosenProfileId: z.string().min(1),
  }),
  // `from` is null the first time agn learns a plan; `to` is null when a plan agn knew is gone.
  "plan.changed": z.object({
    harness: HarnessIdSchema,
    from: PlanSchema.nullable(),
    to: PlanSchema.nullable(),
    source: z.enum(["detected", "config"]),
  }),
} as const;

export type EventPayload = {
  [K in EventKind]: z.infer<(typeof payloadSchemas)[K]>;
};

export type EventInput<K extends EventKind = EventKind> = {
  ts: string;
  taskId?: string;
  repoId?: string;
  kind: K;
  payload: EventPayload[K];
};

// `id` is the ledger's INTEGER PRIMARY KEY, assigned on insert and used as the SSE cursor.
export type Event<K extends EventKind = EventKind> = EventInput<K> & { id: number };

const inputShape = {
  ts: z.iso.datetime(),
  taskId: IdSchema.optional(),
  repoId: IdSchema.optional(),
};

const ledgerShape = { ...inputShape, id: z.number().int().positive() };

function member<S extends z.core.$ZodLooseShape, K extends EventKind>(shape: S, kind: K) {
  return z.object({ ...shape, kind: z.literal(kind), payload: payloadSchemas[kind] });
}

function members<S extends z.core.$ZodLooseShape>(shape: S) {
  return [
    member(shape, "task.created"),
    member(shape, "task.status"),
    member(shape, "task.adopted"),
    member(shape, "task.cleaned"),
    member(shape, "task.deleted"),
    member(shape, "task.handoff"),
    member(shape, "session.captured"),
    member(shape, "repo.registered"),
    member(shape, "repo.updated"),
    member(shape, "usage.recorded"),
    member(shape, "outcome.recorded"),
    member(shape, "profile.detected"),
    member(shape, "recommendation.made"),
    member(shape, "plan.changed"),
  ] as const;
}

export const EventInputSchema = z.discriminatedUnion("kind", members(inputShape));
export const EventSchema = z.discriminatedUnion("kind", members(ledgerShape));
