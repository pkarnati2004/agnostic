import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultRepoConfig,
  newId,
  type Outcome,
  type Repo,
  type RepoConfig,
  type RunResult,
  run,
  type Task,
  type TaskResponse,
  writeRepoConfig,
} from "@agnostic/core";
import { type TestDaemon, waitFor } from "./test-daemon.js";

/** What every outcome test launches: the fake `claude` on the launch PATH. */
const TEST_PROFILE = "claude-code:default:native";

/** A registered repo whose `.ag/agnostic.yaml` names the profile and whatever else the test needs. */
export async function repoWithConfig(
  daemon: TestDaemon,
  over: Partial<RepoConfig> & { git?: boolean } = {},
): Promise<Repo> {
  const { git: isGit, ...config } = over;
  const repo = await daemon.addRepo({ git: isGit ?? true });
  await writeRepoConfig(repo.path, {
    ...defaultRepoConfig(newId()),
    defaultProfileId: TEST_PROFILE,
    ...config,
  });
  return repo;
}

export async function startTask(
  daemon: TestDaemon,
  repo: Repo,
  body: Record<string, unknown> = {},
): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag", ...body }),
  });
  if (response.status !== 201) {
    throw new Error(`the task was refused: ${await response.text()}`);
  }
  return ((await response.json()) as TaskResponse).task;
}

/** What the agent would leave behind: a file of `lines` lines, committed on the task's branch. */
export async function commitLines(cwd: string, lines: number, name = "agent.txt"): Promise<void> {
  const body = Array.from({ length: lines }, (_unused, index) => `line ${index}`).join("\n");
  await writeFile(join(cwd, name), `${body}\n`);
  await gitIn(cwd, ["add", name]);
  await gitIn(cwd, ["commit", "-q", "-m", `${lines} lines`]);
}

export function gitIn(cwd: string, args: string[]): Promise<RunResult> {
  return run("git", ["-C", cwd, "-c", "user.email=t@agn.test", "-c", "user.name=agn", ...args]);
}

/** Types a line into the fake agent: `exit` ends it with the code a done task needs. */
export async function typeToAgent(daemon: TestDaemon, task: Task, line: string): Promise<void> {
  const session = task.session;
  await run(
    "tmux",
    ["-L", session?.tmuxSocket ?? "", "send-keys", "-t", session?.tmuxSession ?? "", line, "Enter"],
    { env: daemon.launch?.env, inheritEnv: false },
  );
}

/** The outcome a human review writes: this task's work was taken, which is what makes its branch
 * part of the base again. */
export function acceptTask(daemon: TestDaemon, task: Task, agentLines = 1): void {
  daemon.ledger.outcomes.record({
    taskId: task.id,
    testsBefore: null,
    testsAfter: null,
    accepted: true,
    reverted: false,
    agentLines,
    humanChangedLines: null,
    humanEditRatio: null,
    durationSec: 1,
    costUsd: null,
    tokens: 0,
    resolvedModel: null,
  });
}

/**
 * The row written at close, which is the first one to carry a duration: the partial row written
 * before launch holds the tests-before result and nothing else.
 */
export async function closedOutcome(
  daemon: TestDaemon,
  task: Task,
  wanted: Task["status"] = "done",
): Promise<Outcome> {
  await waitFor(
    `task ${task.id} to be ${wanted} with an outcome`,
    () =>
      daemon.ledger.tasks.get(task.id)?.status === wanted &&
      (daemon.ledger.outcomes.get(task.id)?.durationSec ?? 0) > 0,
    20_000,
  );
  const outcome = daemon.ledger.outcomes.get(task.id);
  if (outcome === null) {
    throw new Error(`task ${task.id} closed with no outcome`);
  }
  return outcome;
}

/** A task that ran, committed `lines` lines and exited: the starting point of every verdict test. */
export async function closedTask(
  daemon: TestDaemon,
  repo: Repo,
  lines: number,
): Promise<{ task: Task; outcome: Outcome }> {
  const task = await startTask(daemon, repo);
  if (lines > 0) {
    await commitLines(task.worktreePath ?? "", lines);
  }
  await typeToAgent(daemon, task, "exit");
  const outcome = await closedOutcome(daemon, task);
  return { task: daemon.ledger.tasks.get(task.id) ?? task, outcome };
}
