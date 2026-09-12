import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agPaths,
  formatTaskNote,
  type HandoffTaskResponse,
  parseTaskNote,
  type Repo,
  run as runProcess,
  type Task,
  type TaskResponse,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

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

async function handoff(task: Task, body: Record<string, unknown>): Promise<HandoffTaskResponse> {
  const response = await post(`/tasks/${task.id}/handoff`, body);
  expect(response.status).toBe(201);
  return (await response.json()) as HandoffTaskResponse;
}

function failure(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

function noteFile(repo: Repo, task: Task): string {
  return join(agPaths(repo.path).tasksDir, `${task.id}.md`);
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function git(cwd: string, args: string[]): Promise<unknown> {
  return runProcess("git", [
    "-C",
    cwd,
    "-c",
    "user.email=t@agn.test",
    "-c",
    "user.name=agn",
    ...args,
  ]);
}

/** A commit only the parent's branch has, so the child's worktree proves where it was cut from. */
async function commitMarkerFile(cwd: string, name: string): Promise<void> {
  await writeFile(join(cwd, name), "marker\n");
  await git(cwd, ["add", name]);
  await git(cwd, ["commit", "-q", "-m", `add ${name}`]);
}

describe("POST /tasks/:id/handoff", () => {
  it("stops the parent and starts the child from its branch", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    await commitMarkerFile(parent.worktreePath ?? "", "parser.ts");

    const { task: child, parent: left } = await handoff(parent, { profile: "codex", note: NOTE });

    expect(child.parentTaskId).toBe(parent.id);
    expect(child.profileId).toBe("codex:default:native");
    expect(child.status).toBe("running");
    expect(child.title).toBe(parent.title);
    expect(left.status).toBe("stopped");
    expect(await exists(join(child.worktreePath ?? "", "parser.ts"))).toBe(true);
  });

  it("gives the child the handoff section as part of its first prompt", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    await commitMarkerFile(parent.worktreePath ?? "", "parser.ts");
    const { task: child } = await handoff(parent, { profile: "codex", note: NOTE });

    const log = await agentLog(`## Handoff from ${parent.id}`);
    expect(log).toContain(NOTE);
    expect(log).toContain("### Files touched");
    expect(log).toContain("parser.ts");
    expect(log).toContain(`# Task ${child.id}`);
    expect(log).not.toContain("instructions.md");
  });

  it("appends one canonical handoff section to the parent's note", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const { task: child } = await handoff(parent, { profile: "codex", note: NOTE });

    const text = await readFile(noteFile(repo, parent), "utf8");
    const note = parseTaskNote(text);
    expect(text).toBe(formatTaskNote(note));
    expect(note.status).toBe("stopped");
    expect(note.handoffs).toHaveLength(1);
    expect(note.handoffs[0]?.toProfileId).toBe("codex:default:native");
    expect(note.handoffs[0]?.at).toBe(child.createdAt);
    const body = note.handoffs[0]?.body ?? "";
    expect(body.startsWith("### Goal")).toBe(true);
    expect(body.split("\n").filter((line) => line.startsWith("### "))).toEqual([
      "### Goal",
      "### Decisions",
      "### Files touched",
      "### What failed",
    ]);
  });

  it("copies the parent's spec and acceptance into the child's note", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const note = parseTaskNote(await readFile(noteFile(repo, parent), "utf8"));
    await writeFile(
      noteFile(repo, parent),
      formatTaskNote({ ...note, spec: "write the printer", acceptance: "it prints" }),
    );

    const { task: child } = await handoff(parent, { profile: "codex" });
    const childNote = parseTaskNote(await readFile(noteFile(repo, child), "utf8"));
    expect(childNote.spec).toBe("write the printer");
    expect(childNote.acceptance).toBe("it prints");
    expect(childNote.parentTaskId).toBe(parent.id);
    expect(childNote.handoffs).toEqual([]);
  });

  it("demotes the headings of a note that wrote its own", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    await handoff(parent, {
      profile: "codex",
      note: "# Goal\nfinish it\n## Decisions\nyaml, not json",
    });

    const note = parseTaskNote(await readFile(noteFile(repo, parent), "utf8"));
    expect(note.handoffs).toHaveLength(1);
    expect(note.handoffs[0]?.body).toContain("### Decisions\n\nyaml, not json");
  });

  it("records the handoff on the parent, after the child was created", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const before = daemon.ledger.events.latestId();
    const { task: child } = await handoff(parent, { profile: "codex", note: NOTE });

    const kinds = daemon.ledger.events.after(before).map((event) => event.kind);
    // Stopping the parent records its outcome; the handoff itself is still the last of the three.
    expect(kinds.filter((kind) => kind !== "outcome.recorded").slice(0, 3)).toEqual([
      "task.status",
      "task.created",
      "task.handoff",
    ]);
    const handoffEvent = daemon.ledger.events
      .forTask(parent.id)
      .find((event) => event.kind === "task.handoff");
    expect(handoffEvent?.payload).toEqual({
      fromProfileId: PROFILE,
      toProfileId: "codex:default:native",
      childTaskId: child.id,
      note: parseTaskNote(await readFile(noteFile(repo, parent), "utf8")).handoffs[0]?.body,
    });
  });

  it("runs the child in place in a folder workspace, once the parent has stopped", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const { task: child, parent: left } = await handoff(parent, { profile: "codex" });

    expect(left.status).toBe("stopped");
    expect(child.worktreePath).toBe(null);
    expect(child.branch).toBe(null);
    expect(child.session?.cwd).toBe(repo.path);
    const refused = await post(`/repos/${repo.id}/tasks`, { prompt: "a third one" });
    expect(refused.status).toBe(409);
    expect((await failure(refused)).error.code).toBe("folder-busy");
  });

  it("refuses a handoff from a task whose branch was deleted", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    expect((await post(`/tasks/${parent.id}/stop`, {})).status).toBe(200);
    expect((await post(`/tasks/${parent.id}/clean`, { deleteBranch: true })).status).toBe(200);
    const before = await readFile(noteFile(repo, parent), "utf8");

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: "codex" });
    expect(response.status).toBe(409);
    expect((await failure(response)).error.code).toBe("branch-gone");
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
    expect(await readFile(noteFile(repo, parent), "utf8")).toBe(before);
  });

  it("hands off from a cleaned task whose branch was kept", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    await commitMarkerFile(parent.worktreePath ?? "", "parser.ts");
    await post(`/tasks/${parent.id}/stop`, {});
    await post(`/tasks/${parent.id}/clean`, {});

    const { task: child } = await handoff(parent, { profile: "codex" });
    expect(await exists(join(child.worktreePath ?? "", "parser.ts"))).toBe(true);
  });

  it("leaves the parent alone when the profile cannot be resolved", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const before = await readFile(noteFile(repo, parent), "utf8");

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: "pi" });
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("harness-not-installed");
    expect(daemon.ledger.tasks.get(parent.id)?.status).toBe("running");
    expect(await readFile(noteFile(repo, parent), "utf8")).toBe(before);
  });

  it("answers 404 for a task that does not exist", async () => {
    const response = await post("/tasks/nosuchtask/handoff", { profile: "codex" });
    expect(response.status).toBe(404);
    expect((await failure(response)).error.code).toBe("task-not-found");
  });

  it("carries the handoff section into a fresh resume of the child", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await started(repo, { prompt: "write the parser" });
    const { task: child } = await handoff(parent, { profile: "codex", note: NOTE });
    await agentLog(`## Handoff from ${parent.id}`);
    expect((await post(`/tasks/${child.id}/stop`, {})).status).toBe(200);

    const response = await post(`/tasks/${child.id}/resume`, {});
    expect(response.status).toBe(200);
    expect(((await response.json()) as { via: string }).via).toBe("fresh");
    // The section is read from the parent's note again, so it is in the resumed prompt too.
    const heading = `## Handoff from ${parent.id}`;
    await waitFor(
      "the resumed agent to be prompted with the handoff",
      async () => ((await daemon.launch?.readLog()) ?? "").split(heading).length >= 3,
    );
    expect((await daemon.launch?.readLog()) ?? "").toContain(NOTE);
  });
});
