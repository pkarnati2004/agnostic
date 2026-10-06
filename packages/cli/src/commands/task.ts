import type { DeleteTaskResponse } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";

/**
 * `agn clean` removes a task's worktree and keeps the task; this removes the task itself. There is
 * no confirmation prompt, as there is none on `agn repo remove`: the workspace is where the dialog
 * explaining what goes lives (ADR 037).
 */
export function taskCommand(ctx: CliContext): Command {
  const task = new Command("task").description("delete a task and every agn record of it");
  task
    .command("delete")
    .argument("<task>", "task id or prefix")
    .description("remove the task's worktree, row, events and outcome, keeping its branch")
    .action(async (target: string) => {
      report(ctx, await (await ctx.client()).deleteTask(target));
    });
  return task;
}

function report(ctx: CliContext, response: DeleteTaskResponse): void {
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  const worktree = response.removedWorktree ? "worktree removed" : "no worktree to remove";
  const branch = response.branch === null ? "" : `, branch ${response.branch} kept`;
  ctx.io.out(`deleted ${response.taskId}: ${worktree}${branch}`);
}
