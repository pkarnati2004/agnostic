import type { Repo, Task } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { renderFields } from "../fields.js";
import { worktreeTask } from "../resolve-repo.js";
import { type Column, renderTable } from "../table.js";

type StatusFlags = { all?: boolean };

export function statusCommand(ctx: CliContext): Command {
  return new Command("status")
    .description("show one task, or every task across your repos")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .option("--all", "list every task, even from inside a worktree")
    .action(async (task: string | undefined, flags: StatusFlags) => {
      const id = flags.all === true ? undefined : (task ?? (await currentTaskId(ctx)));
      await (id === undefined ? listTasks(ctx) : showTask(ctx, id));
    });
}

/** ADR 012: inside a worktree, `agn status` is about that task; `--all` asks for the list. */
async function currentTaskId(ctx: CliContext): Promise<string | undefined> {
  return (await worktreeTask(ctx.paths, ctx.cwd))?.taskId ?? undefined;
}

async function showTask(ctx: CliContext, id: string): Promise<void> {
  const client = await ctx.client();
  const response = await client.getTask(id);
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  for (const line of renderFields(fields(response.task))) {
    ctx.io.out(line);
  }
}

async function listTasks(ctx: CliContext): Promise<void> {
  const client = await ctx.client();
  const response = await client.listAllTasks();
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  if (response.tasks.length === 0) {
    ctx.io.out('no tasks yet; run agn run "<prompt>"');
    return;
  }
  const { repos } = await client.listRepos({ all: true });
  for (const line of renderTable(response.tasks, columns(repos))) {
    ctx.io.out(line);
  }
}

function columns(repos: Repo[]): Column<Task>[] {
  const names = new Map(repos.map((repo) => [repo.id, repo.name]));
  return [
    { header: "id", value: (task) => task.id },
    { header: "repo", value: (task) => names.get(task.repoId) ?? task.repoId },
    { header: "status", value: (task) => task.status },
    { header: "title", value: (task) => task.title },
    { header: "branch", value: (task) => task.branch ?? "in place" },
    { header: "profile", value: (task) => task.profileId },
  ];
}

function fields(task: Task): [string, string][] {
  return [
    ["id", task.id],
    ["title", task.title],
    ["status", task.status],
    ["profile", task.profileId],
    ["branch", task.branch ?? "in place"],
    ["worktree", task.worktreePath ?? "-"],
    ["harness", task.session?.harness ?? "-"],
    ["tmux", task.session?.tmuxSession ?? "-"],
    ["cwd", task.session?.cwd ?? "-"],
    ["parent", task.parentTaskId ?? "-"],
    ["compare", task.compareId ?? "-"],
    ["origin", task.origin],
    ["created", task.createdAt],
    ["updated", task.updatedAt],
  ];
}
