import { resolve } from "node:path";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";

type AddFlags = { gitInit?: boolean; newId?: boolean };

export function addCommand(ctx: CliContext): Command {
  return new Command("add")
    .description("register a repo or folder")
    .argument("<path>", "path to the repo, absolute or relative to the current directory")
    .option("--git-init", "run git init first when the path is a plain folder")
    .option("--new-id", "register a second clone of a repo that is already registered")
    .action(async (path: string, flags: AddFlags) => {
      const client = await ctx.client();
      const response = await client.registerRepo({
        // The daemon accepts a relative path, but it would resolve it against its own directory.
        path: resolve(ctx.cwd, path),
        gitInit: flags.gitInit === true,
        newId: flags.newId === true,
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      const { repo, created } = response;
      const what = `${repo.name} (${repo.kind}) ${repo.id}`;
      // A removed repo that comes back is created too, so this line says added for it (ADR 034).
      if (created) {
        ctx.io.out(`added ${what}`);
        return;
      }
      // Registering a closed repo does not open it, so the line says why it is not in the list.
      if (repo.status === "archived") {
        ctx.io.out(`already registered, closed: ${what}`);
        ctx.io.err(`  hint: Run \`agn repo open ${repo.id}\` to show it in agn repos again.`);
        return;
      }
      ctx.io.out(`already registered: ${what}`);
    });
}
