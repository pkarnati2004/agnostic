import { Command } from "commander";
import { handOverTerminal } from "../attach-session.js";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

export function attachCommand(ctx: CliContext): Command {
  return new Command("attach")
    .description("join a task's session in this terminal")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const response = await client.attachInfo(await requireTaskId(ctx, command, task));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      ctx.exitCode = await handOverTerminal(ctx, response.attach.argv);
    });
}
