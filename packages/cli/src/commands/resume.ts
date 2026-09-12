import { Command } from "commander";
import { handOverTerminal } from "../attach-session.js";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

export function resumeCommand(ctx: CliContext): Command {
  return new Command("resume")
    .description("bring a task's session back, with its history where the agent supports it")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const response = await client.resumeTask(await requireTaskId(ctx, command, task));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      if (response.via === "fresh") {
        // Said before the terminal is handed over, because tmux is about to own the screen.
        const harness = response.task.session?.harness ?? response.task.profileId;
        ctx.io.err(
          `agn: history was not recoverable; started ${harness} fresh with the task context`,
        );
      }
      ctx.exitCode = await handOverTerminal(ctx, response.attach.argv);
    });
}
