import type { RemoveRepoResponse, RepoResponse } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

/**
 * Closing a repo hides it from `agn repos` and the workspace while its usage and outcome history
 * stays (ADR 032); removing hides it for good and deletes its task worktrees, and its history
 * stays too (ADR 034). The plural `agn repos` is still the list; these change one.
 */
export function repoCommand(ctx: CliContext): Command {
  const repo = new Command("repo").description("close, open or remove a repo");
  repo
    .command("close")
    .argument("<repo>", "repo id, prefix or path")
    .description("hide a repo from the list and the workspace, keeping its history")
    .action(async (target: string) => {
      const { repoId } = await resolveRepo(ctx, target);
      report(ctx, "closed", await (await ctx.client()).closeRepo(repoId));
    });
  repo
    .command("open")
    .argument("<repo>", "repo id, prefix or path")
    .description("show a closed repo again")
    .action(async (target: string) => {
      const { repoId } = await resolveRepo(ctx, target);
      report(ctx, "opened", await (await ctx.client()).openRepo(repoId));
    });
  repo
    .command("remove")
    .argument("<repo>", "repo id, prefix or path")
    .description("hide a repo for good and delete its task worktrees, keeping its history")
    .action(async (target: string) => {
      const { repoId } = await resolveRepo(ctx, target);
      reportRemoved(ctx, await (await ctx.client()).removeRepo(repoId));
    });
  return repo;
}

function report(ctx: CliContext, verb: "closed" | "opened", response: RepoResponse): void {
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  ctx.io.out(`${verb} ${response.repo.name} ${response.repo.id}`);
}

function reportRemoved(ctx: CliContext, response: RemoveRepoResponse): void {
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  ctx.io.out(`removed ${response.repo.name} ${response.repo.id}, ${worktrees(response)}`);
}

function worktrees(response: RemoveRepoResponse): string {
  const count = response.worktreesRemoved;
  if (count === 0) {
    return "no worktrees to delete";
  }
  return `worktrees of ${count} ${count === 1 ? "task" : "tasks"} deleted`;
}
