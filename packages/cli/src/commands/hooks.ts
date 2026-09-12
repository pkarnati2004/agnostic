import type { HookInstallResult } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

type InstallFlags = { repo?: string; harness?: string };

/**
 * `agn run` installs hooks for the harness it is about to launch, so this command is for the two
 * cases that leaves: a hook config the user deleted, and a harness they want ready before they
 * run it.
 */
export function hooksCommand(ctx: CliContext): Command {
  const hooks = new Command("hooks").description("install the hooks agn reads live status from");
  hooks
    .command("install")
    .description("install agn's status hook for a repo's harnesses")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--harness <id>", "install for this harness only")
    .action(async (flags: InstallFlags) => {
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.installHooks(repoId, {
        ...(flags.harness === undefined ? {} : { harness: flags.harness }),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of installed(response.installs)) {
        ctx.io.out(line);
      }
    });
  return hooks;
}

function installed(installs: HookInstallResult[]): string[] {
  if (installs.length === 0) {
    return ["no harness on this machine has a hook agn can install"];
  }
  return installs.flatMap((result) => [
    result.changed
      ? `installed ${result.harness} hooks: ${result.file}`
      : `${result.harness} hooks already installed: ${result.file}`,
    ...(result.verify === null ? [] : [`  verify: ${result.verify}`]),
  ]);
}
