import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  defaultRepoConfig,
  isDirectory,
  newId,
  type Repo,
  readTaskNote,
  type Task,
  type TaskResponse,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

function run(repo: Repo, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function design(repo: Repo, body: Record<string, unknown> = {}): Promise<Task> {
  const response = await run(repo, {
    prompt: "wireframe the onboarding",
    intent: "design",
    ...body,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function failure(response: Response): Promise<{ error: { code: string; hint?: string } }> {
  return response.json() as Promise<{ error: { code: string; hint?: string } }>;
}

describe("POST /repos/:id/tasks with intent design", () => {
  it("creates a waiting task in a worktree, with a design folder and no agent", async () => {
    const repo = await daemon.addRepo();
    const task = await design(repo);

    expect(task.status).toBe("waiting");
    expect(task.profileId).toBe("other:claude-design:default:native");
    expect(task.branch).toBe(`agn/wireframe-the-onboarding-${task.id}`);
    expect(task.session).toBeUndefined();
    expect(await isDirectory(join(task.worktreePath ?? "", "design"))).toBe(true);
    expect(daemon.ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "task.status",
    ]);
  });

  it("writes a note that names the tool and the folder", async () => {
    const repo = await daemon.addRepo();
    const task = await design(repo);
    const note = await readTaskNote(repo.path, task.id);
    expect(note?.notes).toBe("Design task: Claude Design. Files go in design/.");
    expect(note?.spec).toBe("wireframe the onboarding");
    // ADR 014: the note's status is written at run and on terminal transitions, not on the
    // waiting flip, so it reads queued until `agn stop` finishes the design.
    expect(note?.status).toBe("queued");
  });

  it("creates the folder the repo asks for instead of design/", async () => {
    const repo = await daemon.addRepo();
    await writeRepoConfig(repo.path, {
      ...defaultRepoConfig(newId()),
      designFolder: "mockups",
    });
    const task = await design(repo);
    expect(await isDirectory(join(task.worktreePath ?? "", "mockups"))).toBe(true);
    expect((await readTaskNote(repo.path, task.id))?.notes).toContain("mockups/");
  });

  it("opens the tool named in config.yaml", async () => {
    await writeFile(daemon.paths.config, "design_tool: figma\n");
    const repo = await daemon.addRepo();
    expect((await design(repo)).profileId).toBe("other:figma:default:native");
  });

  it("refuses a profile or a model, because there is no agent to run", async () => {
    const repo = await daemon.addRepo();
    const response = await run(repo, {
      prompt: "wireframe the onboarding",
      intent: "design",
      profile: "claude-code",
    });
    expect(response.status).toBe(400);
    const { error } = await failure(response);
    expect(error.code).toBe("design-no-profile");
    expect(error.hint).toContain("design_tool");
    expect(daemon.ledger.tasks.list()).toEqual([]);
  });

  it("creates the task even when this machine can open no design tool", async () => {
    await daemon.close();
    daemon = await createTestDaemon({ tmux: true, designTools: [] });
    const repo = await daemon.addRepo();
    const task = await design(repo);
    expect(task.status).toBe("waiting");

    const response = await daemon.request(`/tasks/${task.id}/design`);
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("design-tool-not-found");
  });

  it("runs in place in a folder workspace, and holds it until the design is stopped", async () => {
    const repo = await daemon.addRepo({ git: false });
    const task = await design(repo);
    expect(task.worktreePath).toBeNull();
    expect(task.branch).toBeNull();
    expect(await isDirectory(join(repo.path, "design"))).toBe(true);

    const second = await run(repo, { prompt: "mock the settings page", intent: "design" });
    expect(second.status).toBe(409);
    expect((await failure(second)).error.code).toBe("folder-busy");
  });
});
