import type { InitWrite } from "@agnostic/core";
import { Command, Option } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

type InitFlags = { repo?: string; from?: string; force?: boolean };

/** The repo has to be registered first (`agn add .`), which is what `docs/setup.md` shows. */
export function initCommand(ctx: CliContext): Command {
  const init = new Command("init")
    .description("create .ag/ for a repo, seeding instructions.md from its instructions file")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--force", "rewrite .ag/agnostic.yaml; every other file is kept either way")
    .action(async (flags: InitFlags) => {
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.initRepo(repoId, {
        ...seed(flags.from),
        ...(flags.force === true ? { force: true } : {}),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const write of response.writes) {
        ctx.io.out(line(write));
      }
      ctx.io.out("next: agn sync");
    });
  init.addOption(
    new Option("--from <file>", "seed .ag/instructions.md from this file").choices([
      "CLAUDE.md",
      "AGENTS.md",
    ]),
  );
  return init;
}

/** Commander has already refused anything else, so this narrows rather than validates. */
function seed(from: string | undefined): { from?: "CLAUDE.md" | "AGENTS.md" } {
  return from === "CLAUDE.md" || from === "AGENTS.md" ? { from } : {};
}

function line(write: InitWrite): string {
  const verb = write.action === "rewritten" ? "rewrote" : write.action;
  return `${verb} ${write.file}${write.source === null ? "" : ` (from ${write.source})`}`;
}
