import type { RunTaskRequest, Task } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { INTENT_FLAG_HELP, intentFlag } from "../intent-flag.js";
import { resolveRepo } from "../resolve-repo.js";

type RunFlags = {
  intent?: string;
  profile?: string;
  harness?: string;
  model?: string;
  repo?: string;
  title?: string;
  base?: string;
};

export function runCommand(ctx: CliContext): Command {
  return new Command("run")
    .description("start an agent on a task, in its own worktree")
    .argument("<prompt>", "what the agent should do")
    .option("--profile <id>", "a profile id, or a harness id for its defaults")
    .option("--harness other:<binary>", "any executable on PATH, as other:<binary>")
    .option("--model <model>", "override the profile's model")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--title <title>", "a title for the task; defaults to the first line of the prompt")
    .option("--base <ref>", "a git ref or task id to branch from")
    .option("--intent <intent>", INTENT_FLAG_HELP)
    .action(async (prompt: string, flags: RunFlags, command: Command) => {
      if (flags.profile !== undefined && flags.harness !== undefined) {
        command.error("error: pass --profile or --harness, not both", {
          exitCode: 2,
          code: "commander.conflictingOption",
        });
      }
      const intent = intentFlag(flags.intent, command);
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.runTask(repoId, {
        ...body(prompt, flags),
        ...(intent === undefined ? {} : { intent }),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of started(response.task)) {
        ctx.io.out(line);
      }
    });
}

function body(prompt: string, flags: RunFlags): RunTaskRequest {
  // --harness is --profile spelled for the case where the harness is all you know.
  const profile = flags.profile ?? flags.harness;
  return {
    prompt,
    ...(flags.title === undefined ? {} : { title: flags.title }),
    ...(profile === undefined ? {} : { profile }),
    ...(flags.model === undefined ? {} : { model: flags.model }),
    ...(flags.base === undefined ? {} : { base: flags.base }),
  };
}

function started(task: Task): string[] {
  const where =
    task.worktreePath === null
      ? [`in place: ${task.session?.cwd ?? "the repo"}`]
      : [`worktree: ${task.worktreePath}`, `branch:   ${task.branch ?? "-"}`];
  return [`started ${task.id} ${task.title}`, ...where, `attach:   agn attach ${task.id}`];
}
