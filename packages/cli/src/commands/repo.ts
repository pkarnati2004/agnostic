import type { RepoResponse } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

/**
 * Closing a repo hides it from `agn repos` and the workspace while its usage and outcome history
 * stays (ADR 032). The plural `agn repos` is still the list; this is the pair that changes one.
 */
export function repoCommand(ctx: CliContext): Command {
  const repo = new Command("repo").description("close a repo or open it again");
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
  return repo;
}

function report(ctx: CliContext, verb: "closed" | "opened", response: RepoResponse): void {
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  ctx.io.out(`${verb} ${response.repo.name} ${response.repo.id}`);
}
