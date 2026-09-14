import type { OutcomeResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { closedTask, gitIn, repoWithConfig, startTask, typeToAgent } from "../test-task-run.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

function recordedEvents(taskId: string): number {
  return daemon.ledger.events.forTask(taskId).filter((event) => event.kind === "outcome.recorded")
    .length;
}

async function outcomeOf(id: string): Promise<OutcomeResponse> {
  const response = await daemon.request(`/tasks/${id}/outcome`);
  expect(response.status).toBe(200);
  return (await response.json()) as OutcomeResponse;
}

describe("GET /tasks/:id/outcome", () => {
  it("rechecks the verdict before answering, so a merge just now reads as accepted", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);
    expect((await outcomeOf(task.id)).outcome?.accepted).toBe(false);

    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);

    const body = await outcomeOf(task.id);
    expect(body.outcome?.accepted).toBe(true);
    expect(body.outcome?.reverted).toBe(false);
    expect(body.task.id).toBe(task.id);
  });

  it("answers 200 with no outcome while the task is still running", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);

    const body = await outcomeOf(task.id);
    expect(body.outcome).toBeNull();
    expect(body.task.status).toBe("running");

    await typeToAgent(daemon, task, "exit");
  });

  it("leaves a running task's tests-before row as a baseline, recording no verdict", async () => {
    const repo = await repoWithConfig(daemon, { testCommand: "exit 0" });
    const task = await startTask(daemon, repo);
    expect(daemon.ledger.outcomes.get(task.id)?.testsBefore).toBe(true);
    const before = recordedEvents(task.id);

    const body = await outcomeOf(task.id);

    expect(body.task.status).toBe("running");
    expect(body.outcome?.accepted).toBeNull();
    expect(body.outcome?.durationSec).toBe(0);
    expect(recordedEvents(task.id)).toBe(before);

    await typeToAgent(daemon, task, "exit");
  });

  it("takes an id prefix, and reports an unknown task as one", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 0);
    expect((await outcomeOf(task.id.slice(0, 5))).task.id).toBe(task.id);

    const response = await daemon.request("/tasks/zzzzzzzzzz/outcome");
    expect(response.status).toBe(404);
  });
});
