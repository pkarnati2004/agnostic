import type { Event, EventInput, Task, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskClosedAt, taskDuration } from "./task-duration.js";

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "split the parser",
  prompt: "split it",
  profileId: "claude-code:opus:native",
  worktreePath: null,
  branch: null,
  status: "queued",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

let nextId = 1;

function event<K extends EventInput["kind"]>(input: EventInput<K>): Event<K> {
  nextId += 1;
  return { ...input, id: nextId };
}

function created(ts: string, status: TaskStatus): Event<"task.created"> {
  return event({
    ts,
    taskId: task.id,
    kind: "task.created",
    payload: { task: { ...task, status } },
  });
}

function status(ts: string, from: TaskStatus, to: TaskStatus): Event<"task.status"> {
  return event({ ts, taskId: task.id, kind: "task.status", payload: { from, to } });
}

describe("taskDuration", () => {
  it("counts one span across a task that waited in the middle of it", () => {
    const events = [
      created("2026-09-12T10:00:00.000Z", "queued"),
      status("2026-09-12T10:00:10.000Z", "queued", "running"),
      status("2026-09-12T10:01:00.000Z", "running", "waiting"),
      status("2026-09-12T10:02:00.000Z", "waiting", "running"),
      status("2026-09-12T10:05:10.000Z", "running", "done"),
    ];
    expect(taskDuration(events, "2026-09-12T10:05:10.000Z")).toBe(300);
  });

  it("sums the two spans of a task that was stopped and resumed", () => {
    const events = [
      created("2026-09-12T10:00:00.000Z", "queued"),
      status("2026-09-12T10:00:00.000Z", "queued", "running"),
      status("2026-09-12T10:01:00.000Z", "running", "stopped"),
      // The hour between the two spans is the user's, not the agent's.
      status("2026-09-12T11:00:00.000Z", "stopped", "running"),
      status("2026-09-12T11:02:00.000Z", "running", "done"),
    ];
    expect(taskDuration(events, "2026-09-12T11:02:00.000Z")).toBe(180);
  });

  it("starts an adopted task's span where its row does", () => {
    const events = [
      created("2026-09-12T10:00:00.000Z", "running"),
      status("2026-09-12T10:00:30.000Z", "running", "done"),
    ];
    expect(taskDuration(events, "2026-09-12T10:00:30.000Z")).toBe(30);
  });

  it("runs a task with no closing transition up to the time it closed", () => {
    const events = [
      created("2026-09-12T10:00:00.000Z", "queued"),
      status("2026-09-12T10:00:00.000Z", "queued", "running"),
    ];
    expect(taskDuration(events, "2026-09-12T10:00:45.000Z")).toBe(45);
  });

  it("is zero for a task that never ran", () => {
    expect(taskDuration([created("2026-09-12T10:00:00.000Z", "queued")], task.createdAt)).toBe(0);
  });
});

describe("taskClosedAt", () => {
  it("reports the last transition into a terminal status", () => {
    const events = [
      status("2026-09-12T10:01:00.000Z", "running", "stopped"),
      status("2026-09-12T11:00:00.000Z", "stopped", "running"),
      status("2026-09-12T11:02:00.000Z", "running", "done"),
    ];
    expect(taskClosedAt(events)).toBe("2026-09-12T11:02:00.000Z");
  });

  it("is null while the task is still open", () => {
    expect(taskClosedAt([status("2026-09-12T10:00:00.000Z", "queued", "running")])).toBeNull();
  });
});
