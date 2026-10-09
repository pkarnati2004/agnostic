import type { ApiErrorBody, CleanTaskRequest, CleanTaskResponse, Task } from "@agnostic/core";
import { CLOSED_STATUSES, DaemonApiError, type DaemonClient } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { renderError } from "../render-error.js";

type CleanFlags = { deleteBranch?: boolean; force?: boolean };

/** What the daemon answered for one task, or why that task's worktree is still there. */
type CleanResult =
  | { kind: "cleaned"; response: CleanTaskResponse }
  | { kind: "kept"; task: Task; error: DaemonApiError };

export function cleanCommand(ctx: CliContext): Command {
  return new Command("clean")
    .description("remove the worktrees of tasks that have finished")
    .argument("[tasks...]", "task ids or prefixes; defaults to every closed task")
    .option("--delete-branch", "delete the task's branch as well as its worktree")
    .option("--force", "remove the worktree even when it still holds uncommitted work")
    .action(async (tasks: string[], flags: CleanFlags) => {
      const client = await ctx.client();
      const body: CleanTaskRequest = {
        deleteBranch: flags.deleteBranch === true,
        force: flags.force === true,
      };
      const results: CleanResult[] = [];
      if (tasks.length > 0) {
        // A task the user named: a refusal is the command's answer, hint and exit code and all.
        for (const id of tasks) {
          results.push({ kind: "cleaned", response: await client.cleanTask(id, body) });
        }
      } else {
        for (const task of await closedTasks(client)) {
          results.push(await cleanOne(client, task, body));
        }
      }
      report(ctx, results);
    });
}

/** A worktree held back is not a failure of the run, so the rest of the list still goes. */
async function cleanOne(
  client: DaemonClient,
  task: Task,
  body: CleanTaskRequest,
): Promise<CleanResult> {
  try {
    return { kind: "cleaned", response: await client.cleanTask(task.id, body) };
  } catch (error) {
    if (error instanceof DaemonApiError && error.code === "worktree-unsaved") {
      return { kind: "kept", task, error };
    }
    throw error;
  }
}

function report(ctx: CliContext, results: CleanResult[]): void {
  if (ctx.json) {
    // One body per task, in the order they were tried; a kept task's is the daemon's error body.
    writeJson(ctx.io, results.map(jsonBody));
    return;
  }
  if (results.length === 0) {
    ctx.io.out("nothing to clean");
    return;
  }
  for (const result of results) {
    ctx.io.out(line(result));
  }
}

function line(result: CleanResult): string {
  if (result.kind === "kept") {
    const { id, worktreePath } = result.task;
    return `kept ${id} ${worktreePath}: ${reason(result.error)} (agn clean ${id} --force)`;
  }
  const { task, removed } = result.response;
  return removed ? `cleaned ${task.id} ${task.worktreePath}` : `nothing to clean for ${task.id}`;
}

/** The daemon's message reads "the worktree for task <id> was not removed: <reason>". */
function reason(error: DaemonApiError): string {
  const tail = error.message.split(": ").slice(1).join(": ");
  return tail === "" ? error.message : tail;
}

function jsonBody(result: CleanResult): CleanTaskResponse | ApiErrorBody {
  return result.kind === "cleaned" ? result.response : renderError(result.error).body;
}

async function closedTasks(client: DaemonClient): Promise<Task[]> {
  const { tasks } = await client.listAllTasks({ status: [...CLOSED_STATUSES] });
  return tasks;
}
