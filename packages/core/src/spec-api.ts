import { z } from "zod";
import { TaskIntentSchema } from "./task-intent.js";

// The one-liner a spec is written from, and nothing else: the repo state comes from the ledger.
export const SpecRequestSchema = z.strictObject({
  prompt: z.string().min(1),
  intent: TaskIntentSchema.optional(),
});
export type SpecRequest = z.infer<typeof SpecRequestSchema>;

/**
 * A spec for the user to read, edit and approve; nothing is started and nothing is recorded
 * (ADR 028). `profileId` and `model` say who wrote it, so the workspace can name them.
 */
export type SpecResponse = {
  title: string;
  spec: string;
  acceptance: string | null;
  profileId: string;
  model: string | null;
};
