import { type TaskIntent, TaskIntentSchema } from "@agnostic/core";
import type { Command } from "commander";

/** A `--intent` agn does not know is a usage error, answered here and not after a round trip. */
export function intentFlag(value: string | undefined, command: Command): TaskIntent | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = TaskIntentSchema.safeParse(value);
  if (!parsed.success) {
    command.error(`error: --intent must be one of ${TaskIntentSchema.options.join(", ")}`, {
      exitCode: 2,
      code: "commander.invalidArgument",
    });
  }
  return parsed.data;
}

export const INTENT_FLAG_HELP = `the task class, overriding what the prompt suggests: ${TaskIntentSchema.options.join(", ")}`;
