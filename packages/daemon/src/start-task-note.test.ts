import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { agPaths, parseTaskNote, type Repo, type Task, type TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function started(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function readNote(repo: Repo, task: Task): Promise<string> {
  return readFile(join(agPaths(repo.path).tasksDir, `${task.id}.md`), "utf8");
}

describe("the note a run writes", () => {
  it("puts the prompt in the spec when the caller approved none", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, { prompt: "add a --verbose flag" });
    const note = parseTaskNote(await readNote(repo, task));
    expect(note.spec).toBe("add a --verbose flag");
    expect(note.acceptance).toBeNull();
    // ADR 014: the note says queued until the task reaches a terminal status.
    expect(note.status).toBe("queued");
  });

  it("demotes a `## ` line in a prompt that stands in for a spec", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const prompt = "rewrite the README, starting from:\n\n## Usage\n\nrun it";
    const task = await started(repo, { prompt });
    const note = parseTaskNote(await readNote(repo, task));
    // Left alone, the `## Usage` line would end the Spec section and swallow the rest of the note.
    expect(note.spec).toBe("rewrite the README, starting from:\n\n### Usage\n\nrun it");
    expect(note.status).toBe("queued");
    expect(note.acceptance).toBeNull();
  });

  it("puts the approved spec and acceptance in their sections, headings demoted", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, {
      prompt: "add a --verbose flag",
      spec: "## Background\n\nthe CLI is quiet\n\n## Plan\n\nadd the flag",
      acceptance: "- [ ] the flag prints a line per step",
    });
    const note = parseTaskNote(await readNote(repo, task));
    // The one-liner stays the task's prompt; the spec is what the agent reads (ADR 028).
    expect(task.prompt).toBe("add a --verbose flag");
    expect(note.spec).toBe("### Background\n\nthe CLI is quiet\n\n### Plan\n\nadd the flag");
    expect(note.acceptance).toBe("- [ ] the flag prints a line per step");
  });
});
