import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { requireTaskId } from "../resolve-repo.js";

/**
 * Asks the agent to commit the work it has done, with the prompt in `.ag/prompts/commit.md` or
 * agn's default. A session that is running is typed into; anything else is resumed with the prompt
 * as its first turn. agn runs no git command itself, and never takes the terminal over.
 */
export function commitCommand(ctx: CliContext): Command {
  return new Command("commit")
    .description("ask the agent to commit its work on the task's branch")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const id = await requireTaskId(ctx, command, task);
      const response = await client.commitTask(id);
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      ctx.io.out(`asked ${response.task.profileId} to commit (${response.via})`);
    });
}
