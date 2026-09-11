import { z } from "zod";
import { IdSchema } from "./id.js";

export const OutcomeSchema = z.object({
  taskId: IdSchema,
  testsBefore: z.boolean().nullable(),
  testsAfter: z.boolean().nullable(),
  accepted: z.boolean().nullable(),
  reverted: z.boolean().nullable(),
  agentLines: z.number().int().nonnegative().nullable(),
  humanChangedLines: z.number().int().nonnegative().nullable(),
  humanEditRatio: z.number().min(0).nullable(),
  durationSec: z.number().nonnegative(),
  // null cost means the work was included in a subscription, not that it was free to measure.
  costUsd: z.number().nonnegative().nullable(),
  tokens: z.number().int().nonnegative(),
  // What the harness reported running, so rows for the "default" model stay readable later.
  resolvedModel: z.string().nullable(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;
