import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agPaths,
  parseTaskNote,
  type Repo,
  type Task,
  type TaskResponse,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";
const NOTE = "the parser is done, the printer is not";

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

function post(path: string, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function failure(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

function noteFile(repo: Repo, task: Task): string {
  return join(agPaths(repo.path).tasksDir, `${task.id}.md`);
}

/**
 * The two ways a request can be wrong before any work is done, matched against `start-task`'s own
 * cases so `agn handoff` refuses exactly what `agn run` would: a badly formed profile string, and
 * a real harness this machine does not have.
 */
describe("POST /tasks/:id/handoff validation", () => {
  it("refuses a profile that is neither a profile id nor a harness id, leaving the parent alone", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const before = await readFile(noteFile(repo, parent), "utf8");

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: "not a profile" });
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("invalid-profile-id");
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
    expect(daemon.ledger.tasks.get(parent.id)?.status).toBe("running");
    expect(await readFile(noteFile(repo, parent), "utf8")).toBe(before);
  });
});

/**
 * The note is written after the row, so a handoff the ledger refuses leaves nothing behind: the
 * folder guard is the one refusal that can arrive after the parent has already been stopped.
 */
describe("POST /tasks/:id/handoff when the child cannot be created", () => {
  it("leaves the parent's note byte-unchanged and creates no child", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    expect((await post(`/tasks/${parent.id}/stop`, {})).status).toBe(200);
    // The folder is free now, so a second task takes it; the handoff below cannot have it back.
    const holder = await started(repo, { prompt: "something else entirely" });
    const before = await readFile(noteFile(repo, parent), "utf8");

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: "codex", note: NOTE });
    expect(response.status).toBe(409);
    expect((await failure(response)).error.code).toBe("folder-busy");
    expect(
      daemon.ledger.tasks
        .list({ repoId: repo.id })
        .map((task) => task.id)
        .sort(),
    ).toEqual([parent.id, holder.id].sort());
    expect(await readFile(noteFile(repo, parent), "utf8")).toBe(before);
  });
});

/**
 * Order is validate, stop, row, note, launch: once the row exists a launch failure is history, not
 * a rollback (the picks in the handoff). The child stays as a record of the attempt and the
 * parent's note keeps the section it was given before launch was ever tried.
 */
describe("POST /tasks/:id/handoff when the launch itself fails", () => {
  it("leaves the child failed and the parent's note written", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    await writeRepoConfig(repo.path, {
      id: repo.id,
      testCommand: null,
      lintCommand: null,
      defaultProfileId: PROFILE,
      baseBranch: null,
      branchPrefix: null,
      setupCommand: "exit 3",
      cleanAfterMerge: false,
      designFolder: "design",
    });

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: "codex", note: NOTE });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const children = daemon.ledger.tasks
      .list({ repoId: repo.id })
      .filter((task) => task.parentTaskId === parent.id);
    expect(children).toHaveLength(1);
    expect(children[0]?.status).toBe("failed");
    const note = parseTaskNote(await readFile(noteFile(repo, parent), "utf8"));
    expect(note.handoffs).toHaveLength(1);
    expect(note.handoffs[0]?.body).toContain(NOTE);
  });
});
