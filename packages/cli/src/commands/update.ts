import type { UpdateTaskResponse } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

/**
 * Asks the agent to bring its branch up to date with its base. A session that is running is typed
 * into; anything else is resumed with the prompt as its first turn. The terminal is never handed
 * over: this sends the agent a message, and `agn attach` is how you go and watch it.
 */
export function updateCommand(ctx: CliContext): Command {
  return new Command("update")
    .description("ask the agent to bring the task's branch up to date with its base")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const id = await requireTaskId(ctx, command, task);
      const response = await client.updateTask(id);
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of report(response)) {
        ctx.io.out(line);
      }
    });
}

function report(response: UpdateTaskResponse): string[] {
  return [
    response.via === "live"
      ? "sent to the live session"
      : `resumed (${response.via}) with the prompt`,
    response.mode === "rebase" ? "mode: rebase (never pushed)" : "mode: merge (pushed)",
    `base: ${response.base}`,
    `attach: agn attach ${response.task.id}`,
  ];
}
