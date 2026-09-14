import { join } from "node:path";
import { type Repo, run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import {
  closedOutcome,
  commitLines,
  repoWithConfig,
  startTask,
  typeToAgent,
} from "./test-task-run.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

function repoWith(config: { testCommand?: string; git?: boolean } = {}): Promise<Repo> {
  return repoWithConfig(daemon, {
    ...(config.git === undefined ? {} : { git: config.git }),
    testCommand: config.testCommand ?? null,
  });
}

describe("the outcome of a task that closes", () => {
  it("records what the agent wrote, what it cost and what the tests said", async () => {
    // The command passes on the base commit and fails once the agent's file is there.
    const repo = await repoWith({ testCommand: "test ! -f agent.txt" });
    const head = (await run("git", ["-C", repo.path, "rev-parse", "HEAD"])).stdout.trim();
    const task = await startTask(daemon, repo);
    expect(daemon.ledger.tasks.get(task.id)?.baseCommit).toBe(head);

    await commitLines(task.worktreePath ?? "", 10);
    const closedAfter = daemon.ledger.events.latestId();
    await typeToAgent(daemon, task, "exit");

    const outcome = await closedOutcome(daemon, task);
    expect(outcome.testsBefore).toBe(true);
    expect(outcome.testsAfter).toBe(false);
    expect(outcome.agentLines).toBe(10);
    expect(outcome.humanChangedLines).toBe(0);
    expect(outcome.durationSec).toBeGreaterThan(0);
    expect(outcome.accepted).toBe(false);
    expect(outcome.reverted).toBe(false);
    // One row is written at close, after the task has reached its terminal status.
    const kinds = daemon.ledger.events.after(closedAfter).map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "outcome.recorded")).toHaveLength(1);
    expect(kinds.indexOf("task.status")).toBeLessThan(kinds.indexOf("outcome.recorded"));
  });

  it("leaves both test results null when the repo names no test command", async () => {
    const repo = await repoWith();
    const task = await startTask(daemon, repo);
    await typeToAgent(daemon, task, "exit");

    const outcome = await closedOutcome(daemon, task);
    expect(outcome.testsBefore).toBeNull();
    expect(outcome.testsAfter).toBeNull();
    expect(outcome.agentLines).toBe(0);
    expect(outcome.humanEditRatio).toBeNull();
  });

  it("runs the tests at close only once the harness is gone", async () => {
    // True only if the fake agent has already logged the SIGTERM it was stopped with.
    const logs = join(daemon.paths.home, "agent-logs");
    const repo = await repoWith({ testCommand: `grep -q term ${logs}/*.log` });
    const task = await startTask(daemon, repo);
    await waitFor("the fake agent to start", async () =>
      ((await daemon.launch?.readLog()) ?? "").includes("ready cwd="),
    );

    const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect(response.status).toBe(200);

    const outcome = await closedOutcome(daemon, task, "stopped");
    expect(outcome.testsBefore).toBe(false);
    expect(outcome.testsAfter).toBe(true);
  });

  it("reuses the result of a test command another task already ran on the same commit", async () => {
    const marker = join(daemon.paths.home, "test-runs");
    const repo = await repoWith({ testCommand: `printf x >> ${marker}` });
    const first = await startTask(daemon, repo);
    await typeToAgent(daemon, first, "exit");
    await closedOutcome(daemon, first);
    // The close of the first task ran the command a second time; the cache covers the launch only.
    const second = await startTask(daemon, repo, { title: "another task off the same commit" });
    expect(daemon.ledger.outcomes.get(second.id)?.testsBefore).toBe(true);
    await typeToAgent(daemon, second, "exit");
    const outcome = await closedOutcome(daemon, second);
    expect(outcome.testsBefore).toBe(true);
    expect(daemon.ledger.tasks.get(second.id)?.baseCommit).toBe(
      daemon.ledger.tasks.get(first.id)?.baseCommit,
    );
  });

  it("skips the baseline when the run asked it to", async () => {
    const repo = await repoWith({ testCommand: "exit 0" });
    const task = await startTask(daemon, repo, { skipTests: true });
    expect(daemon.ledger.outcomes.get(task.id)).toBeNull();
    await typeToAgent(daemon, task, "exit");
    const outcome = await closedOutcome(daemon, task);
    expect(outcome.testsBefore).toBeNull();
    expect(outcome.testsAfter).toBe(true);
  });

  it("leaves the diff fields null for a folder task, which has no branch of agn's", async () => {
    const repo = await repoWith({ git: false, testCommand: "exit 0" });
    const task = await startTask(daemon, repo);
    expect(task.worktreePath).toBeNull();
    await typeToAgent(daemon, task, "exit");

    const outcome = await closedOutcome(daemon, task);
    expect(daemon.ledger.tasks.get(task.id)?.baseCommit).toBeNull();
    expect(outcome.testsAfter).toBe(true);
    expect(outcome.durationSec).toBeGreaterThan(0);
    expect(outcome.accepted).toBeNull();
    expect(outcome.agentLines).toBeNull();
    expect(outcome.humanChangedLines).toBeNull();
    expect(outcome.humanEditRatio).toBeNull();
  });
});
