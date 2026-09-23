import type {
  Billing,
  CompareResponse,
  CompareTaskRow,
  DaemonClient,
  Outcome,
  PickCompareResponse,
  StartCompareResponse,
  Task,
  TaskIntent,
  TaskStatus,
} from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { CliError } from "../error.js";
import { INTENT_FLAG_HELP, intentFlag } from "../intent-flag.js";
import { resolveRepo } from "../resolve-repo.js";
import { type Column, renderTable } from "../table.js";

type StartFlags = { profiles?: string; repo?: string; title?: string; intent?: string };

const TERMINAL: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * One prompt, several agents, a worktree each. Commander dispatches to `show` or `pick` when the
 * first operand names one and to this action otherwise, so `agn compare "<prompt>"` stays the way
 * a compare starts (ADR 036 Q7). A prompt that is literally "show" or "pick" names the subcommand.
 */
export function compareCommand(ctx: CliContext): Command {
  const compare = new Command("compare")
    .description("run one prompt on 2-4 profiles at once, one worktree each")
    .argument("[prompt]", "what every agent should do")
    .option(
      "--profiles <a,b>",
      "the profile ids to compare; defaults to agn's pick and its alternative",
    )
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--title <title>", "a title for the tasks; defaults to the first line of the prompt")
    .option("--intent <intent>", INTENT_FLAG_HELP)
    .action(async (prompt: string | undefined, flags: StartFlags, command: Command) => {
      if (prompt === undefined) {
        command.error("error: agn compare needs a prompt, or the show or pick subcommand", {
          exitCode: 2,
          code: "commander.missingArgument",
        });
      }
      await start(ctx, prompt, flags, command);
    });
  compare
    .command("show")
    .description("one table over the agents of a compare")
    .argument("<id>", "compare id or prefix")
    .action(async (id: string) => {
      const response = await (await ctx.client()).getCompare(id);
      print(ctx, response, showLines);
    });
  compare
    .command("pick")
    .description("keep one agent's work; the others are stopped and their worktrees removed")
    .argument("<id>", "compare id or prefix")
    .argument("<task>", "the sibling to keep, by task id or prefix")
    .action(async (id: string, task: string) => {
      const response = await (await ctx.client()).pickCompare(id, { taskId: task });
      print(ctx, response, pickLines);
    });
  return compare;
}

async function start(
  ctx: CliContext,
  prompt: string,
  flags: StartFlags,
  command: Command,
): Promise<void> {
  const intent = intentFlag(flags.intent, command);
  const { repoId } = await resolveRepo(ctx, flags.repo);
  const client = await ctx.client();
  const profiles = await chooseProfiles(client, repoId, prompt, flags.profiles, intent);
  const response = await client.startCompare(repoId, {
    prompt,
    profiles,
    ...(flags.title === undefined ? {} : { title: flags.title }),
    ...(intent === undefined ? {} : { intent }),
  });
  print(ctx, response, startedLines);
}

/** Named profiles win; with none, agn compares its own pick against the alternative it named. */
async function chooseProfiles(
  client: DaemonClient,
  repoId: string,
  prompt: string,
  named: string | undefined,
  intent: TaskIntent | undefined,
): Promise<string[]> {
  if (named !== undefined) {
    return distinct(
      named
        .split(",")
        .map((profile) => profile.trim())
        .filter((profile) => profile !== ""),
    );
  }
  const { recommendation } = await client.recommend({
    repoId,
    prompt,
    dryRun: true,
    ...(intent === undefined ? {} : { intent }),
  });
  const { recommended, alternative } = recommendation;
  if (alternative === null) {
    throw new CliError(`agn recommends only ${recommended.profileId} for this prompt`, {
      code: "compare-needs-profiles",
      hint: "Pass --profiles <a,b> to name the agents to compare.",
    });
  }
  return [recommended.profileId, alternative.profileId];
}

/**
 * The same name twice asks for the same agent twice. The daemon refuses that after resolving each
 * one, which catches `claude-code` against its own full id; this catches the plain repeat here,
 * where no worktree has been made yet.
 */
function distinct(profiles: string[]): string[] {
  const repeated = profiles.find((profile, at) => profiles.indexOf(profile) !== at);
  if (repeated !== undefined) {
    throw new CliError(`--profiles names ${repeated} twice`, {
      code: "compare-profiles-duplicate",
      hint: "Name a different model or harness for each agent.",
    });
  }
  return profiles;
}

function print<T>(ctx: CliContext, response: T, lines: (response: T) => string[]): void {
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  for (const line of lines(response)) {
    ctx.io.out(line);
  }
}

function startedLines(response: StartCompareResponse): string[] {
  const title = response.tasks[0]?.title ?? "";
  return [
    `compare ${response.compareId} ${title}`,
    ...response.tasks.map((task) => `  ${task.id}  ${task.profileId}  ${where(task)}`),
    `show: agn compare show ${response.compareId}`,
  ];
}

function where(task: Task): string {
  return task.worktreePath ?? "in place";
}

const COLUMNS: Column<CompareTaskRow>[] = [
  { header: "task", value: (row) => row.id },
  { header: "profile", value: (row) => row.profileId },
  { header: "status", value: (row) => row.status },
  { header: "files", value: (row) => (row.changes === null ? "-" : String(row.changes.files)) },
  {
    header: "+/-",
    value: (row) =>
      row.changes === null ? "-" : `+${row.changes.additions} -${row.changes.deletions}`,
  },
  { header: "tests", value: (row) => tests(row.outcome) },
  { header: "cost", value: (row) => cost(row.usage.costUsd, row.billing) },
  { header: "time", value: (row) => time(row, Date.now()) },
];

function showLines(response: CompareResponse): string[] {
  const agents = `${response.tasks.length} agent${response.tasks.length === 1 ? "" : "s"}`;
  const header = `compare ${response.compareId}  ${response.title}  (${agents})`;
  const picked = response.tasks.find((row) => row.id === response.pickedTaskId);
  const footer = picked === undefined ? [] : [`picked: ${picked.id} (${picked.profileId})`];
  return [header, ...renderTable(response.tasks, COLUMNS), ...footer];
}

function pickLines(response: PickCompareResponse): string[] {
  return [
    `kept ${response.kept.id} (${response.kept.profileId})`,
    ...response.cleaned.map(
      (task) =>
        `cleaned ${task.id} (${task.profileId}): ${task.status}, worktree removed, branch ${
          task.branch ?? "-"
        } kept`,
    ),
  ];
}

/** The tests the close work recorded; a sibling picked a moment ago has none for a few seconds. */
function tests(outcome: Outcome | null): string {
  if (outcome === null || outcome.testsAfter === null) {
    return "-";
  }
  return outcome.testsAfter ? "pass" : "fail";
}

/** Nothing priced on a plan agn knows is spend the plan absorbed, not spend of zero. */
function cost(costUsd: number | null, billing: Billing | null): string {
  if (costUsd !== null) {
    return `$${costUsd.toFixed(2)}`;
  }
  return billing === "subscription" || billing === "local" ? "in plan" : "-";
}

/** What the outcome measured once the task is over, and the wall clock until then. */
function time(row: CompareTaskRow, now: number): string {
  if (row.outcome !== null && TERMINAL.includes(row.status)) {
    return duration(row.outcome.durationSec);
  }
  return duration((now - Date.parse(row.createdAt)) / 1000);
}

/** The `agn outcomes` form: hours, minutes and seconds, dropping the zeros on the left. */
function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const parts = [
    [Math.floor(whole / 3600), "h"],
    [Math.floor(whole / 60) % 60, "m"],
    [whole % 60, "s"],
  ] as const;
  const from = parts.findIndex(([value]) => value > 0);
  return parts
    .slice(from === -1 ? parts.length - 1 : from)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}
