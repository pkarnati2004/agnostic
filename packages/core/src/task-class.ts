import { z } from "zod";
import { TaskIntentSchema } from "./task-intent.js";

/** How much of the repo a task reaches, which is what the token estimate is drawn from. */
export const TaskScopeSchema = z.enum(["small", "medium", "large"]);
export type TaskScope = z.infer<typeof TaskScopeSchema>;

/**
 * What the classifier made of a prompt. `risk` holds the areas of the `risk_rules` that matched,
 * in file order. `automaticIntent` is set only when `--intent` replaced what the rules found, so a
 * stored recommendation records both the override and the class it stood in for.
 */
export const TaskClassSchema = z.strictObject({
  intent: TaskIntentSchema,
  scope: TaskScopeSchema,
  risk: z.array(z.string().min(1)),
  needsBrowser: z.boolean(),
  automaticIntent: TaskIntentSchema.nullable(),
});
export type TaskClass = z.infer<typeof TaskClassSchema>;
