import type { CleanTaskResponse, DaemonClient } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";

type CleanFlags = { deleteBranch?: boolean };

const CLOSED = ["done", "failed", "stopped"] as const;

export function cleanCommand(ctx: CliContext): Command {
  return new Command("clean")
    .description("remove the worktrees of tasks that have finished")
    .argument("[tasks...]", "task ids or prefixes; defaults to every closed task")
    .option("--delete-branch", "delete the task's branch as well as its worktree")
    .action(async (tasks: string[], flags: CleanFlags) => {
      const client = await ctx.client();
      const ids = tasks.length > 0 ? tasks : await closedTaskIds(client);
      const cleaned: CleanTaskResponse[] = [];
      for (const id of ids) {
        cleaned.push(await client.cleanTask(id, { deleteBranch: flags.deleteBranch === true }));
      }
      if (ctx.json) {
        // One body per task, in the order they were cleaned; the fields are the daemon's.
        writeJson(ctx.io, cleaned);
        return;
      }
      if (cleaned.length === 0) {
        ctx.io.out("nothing to clean");
        return;
      }
      for (const { task, removed } of cleaned) {
        ctx.io.out(
          removed ? `cleaned ${task.id} ${task.worktreePath}` : `nothing to clean for ${task.id}`,
        );
      }
    });
}

async function closedTaskIds(client: DaemonClient): Promise<string[]> {
  const { tasks } = await client.listAllTasks({ status: [...CLOSED] });
  return tasks.map((task) => task.id);
}
