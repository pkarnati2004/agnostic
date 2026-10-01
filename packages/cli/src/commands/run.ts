import type { DaemonClient, RunTaskRequest, Task, TaskIntent } from "@agnostic/core";
import { Command } from "commander";
import { budgetWarnings } from "../budget-lines.js";
import { type CliContext, writeJson } from "../context.js";
import { INTENT_FLAG_HELP, intentFlag } from "../intent-flag.js";
import { resolveRepo } from "../resolve-repo.js";
import { launchDesignTool } from "./open.js";

type RunFlags = {
  intent?: string;
  profile?: string;
  harness?: string;
  model?: string;
  repo?: string;
  title?: string;
  base?: string;
  skipTests?: boolean;
  ignoreBudget?: boolean;
  /** commander's `--no-open`: true unless the user passed it. */
  open?: boolean;
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
    .option("--skip-tests", "do not run the repo's test_command before the agent starts")
    .option("--ignore-budget", "start the task even though the budget in config.yaml is spent")
    .option("--intent <intent>", INTENT_FLAG_HELP)
    .option("--no-open", "with --intent design: create the task without opening the design tool")
    .action(async (prompt: string, flags: RunFlags, command: Command) => {
      if (flags.profile !== undefined && flags.harness !== undefined) {
        command.error("error: pass --profile or --harness, not both", {
          exitCode: 2,
          code: "commander.conflictingOption",
        });
      }
      const intent = intentFlag(flags.intent, command);
      assertDesignHasNoProfile(intent, flags, command);
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      if (intent !== "design") {
        // A design task runs no tests and is billed for nothing, so neither line would be true.
        await announceTests(ctx, client, repoId, flags);
        await announceBudget(ctx, client);
      }
      const response = await client.runTask(repoId, {
        ...body(prompt, flags),
        ...(intent === undefined ? {} : { intent }),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      const lines =
        intent === "design"
          ? await design(ctx, client, response.task, flags.open !== false)
          : started(response.task);
      for (const line of lines) {
        ctx.io.out(line);
      }
    });
}

/**
 * A design task runs in a design tool with a human in it, so there is no profile to name and no
 * model to override. Answered here rather than after a round trip, the way a bad --intent is.
 */
function assertDesignHasNoProfile(
  intent: TaskIntent | undefined,
  flags: RunFlags,
  command: Command,
): void {
  const named = flags.profile ?? flags.harness ?? flags.model;
  if (intent !== "design" || named === undefined) {
    return;
  }
  command.error("error: --intent design runs in a design tool, so it takes no profile or model", {
    exitCode: 2,
    code: "commander.conflictingOption",
  });
}

/**
 * The design tool is opened from here, in the user's own login session (ADR 023), and the lines
 * say where the design files go and what finishes the task. `--no-open` prints the command that
 * opens it later instead.
 */
async function design(
  ctx: CliContext,
  client: DaemonClient,
  task: Task,
  open: boolean,
): Promise<string[]> {
  const info = await client.designOpenInfo(task.id);
  if (open) {
    await launchDesignTool(ctx, info);
  }
  return [
    `started ${task.id} ${task.title}`,
    ...where(task),
    `design folder: ${info.folder}`,
    open ? `opened ${info.tool.name}` : `open:     agn open ${task.id} --tool`,
    `finish:   agn stop ${task.id}`,
  ];
}

/**
 * The repo's own test command runs before the agent starts (ADR 022), and it can take minutes;
 * this is the line that explains the wait, printed by the only part of agn with a terminal.
 */
async function announceTests(
  ctx: CliContext,
  client: DaemonClient,
  repoId: string,
  flags: RunFlags,
): Promise<void> {
  if (flags.skipTests === true || ctx.json) {
    return;
  }
  const { repos } = await client.listRepos();
  const command = repos.find((candidate) => candidate.id === repoId)?.testCommand ?? null;
  if (command !== null) {
    ctx.io.out(`running the tests first: ${command}`);
  }
}

/**
 * The budget's warning, at 80% and again at 100%. The CLI does not know how the profile is billed
 * until the daemon resolves it, so the line prints for any run; a counted profile at 100% then
 * meets the daemon's own refusal, and a subscription task starts under the line.
 */
async function announceBudget(ctx: CliContext, client: DaemonClient): Promise<void> {
  if (ctx.json) {
    return;
  }
  // The line is advisory and the daemon is what refuses a run over the ceiling, so a usage read
  // that fails - an unparseable config.yaml, a busy daemon - costs the warning and not the run.
  const response = await client.usage().catch(() => null);
  if (response === null) {
    return;
  }
  for (const line of budgetWarnings(response.budget)) {
    ctx.io.out(line);
  }
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
    ...(flags.skipTests === true ? { skipTests: true } : {}),
    ...(flags.ignoreBudget === true ? { ignoreBudget: true } : {}),
  };
}

/** `agn handoff` prints these too: the child of a handoff started the same way a run does. */
export function started(task: Task): string[] {
  return [`started ${task.id} ${task.title}`, ...where(task), `attach:   agn attach ${task.id}`];
}

/** A worktree and its branch, or the directory a folder task runs in. */
function where(task: Task): string[] {
  return task.worktreePath === null
    ? [`in place: ${task.session?.cwd ?? "the repo"}`]
    : [`worktree: ${task.worktreePath}`, `branch:   ${task.branch ?? "-"}`];
}
