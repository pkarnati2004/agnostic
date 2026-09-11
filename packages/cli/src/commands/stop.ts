import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

export function stopCommand(ctx: CliContext): Command {
  return new Command("stop")
    .description("stop a task's session; its worktree stays until you clean it")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const response = await client.stopTask(await requireTaskId(ctx, command, task));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      ctx.io.out(`stopped ${response.task.id}`);
    });
}
