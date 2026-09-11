import { z } from "zod";
import { IdSchema } from "./id.js";
import { OutcomeSchema } from "./outcome.js";
import { ProfileSchema } from "./profile.js";
import { RecommendationSchema } from "./recommendation.js";
import { TaskSchema, TaskStatusSchema } from "./task.js";

export const EventKindSchema = z.enum([
  "task.created",
  "task.status",
  "task.handoff",
  "usage.recorded",
  "outcome.recorded",
  "profile.detected",
  "recommendation.made",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

const payloadSchemas = {
  "task.created": z.object({ task: TaskSchema }),
  "task.status": z.object({ from: TaskStatusSchema, to: TaskStatusSchema }),
  "task.handoff": z.object({
    fromProfileId: z.string().min(1),
    toProfileId: z.string().min(1),
    childTaskId: IdSchema,
    note: z.string().nullable(),
  }),
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

function members<S extends z.core.$ZodLooseShape>(shape: S) {
  return [
    z.object({
      ...shape,
      kind: z.literal("task.created"),
      payload: payloadSchemas["task.created"],
    }),
    z.object({ ...shape, kind: z.literal("task.status"), payload: payloadSchemas["task.status"] }),
    z.object({
      ...shape,
      kind: z.literal("task.handoff"),
      payload: payloadSchemas["task.handoff"],
    }),
    z.object({
      ...shape,
      kind: z.literal("usage.recorded"),
      payload: payloadSchemas["usage.recorded"],
    }),
    z.object({
      ...shape,
      kind: z.literal("outcome.recorded"),
      payload: payloadSchemas["outcome.recorded"],
    }),
    z.object({
      ...shape,
      kind: z.literal("profile.detected"),
      payload: payloadSchemas["profile.detected"],
    }),
    z.object({
      ...shape,
      kind: z.literal("recommendation.made"),
      payload: payloadSchemas["recommendation.made"],
    }),
  ] as const;
}

export const EventInputSchema = z.discriminatedUnion("kind", members(inputShape));
export const EventSchema = z.discriminatedUnion("kind", members(ledgerShape));
