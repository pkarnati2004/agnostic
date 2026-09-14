import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Editor,
  type EditorsResponse,
  newId,
  type OpenTaskResponse,
  type Repo,
  type Task,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let repo: Repo;
let dir = "";

const CODE = "/opt/bin/code";

async function boot(editors?: Editor[]): Promise<void> {
  await daemon?.close();
  daemon = await createTestDaemon(editors === undefined ? {} : { editors });
  repo = await daemon.addRepo();
}

beforeEach(async () => {
  daemon = await createTestDaemon();
  repo = await daemon.addRepo();
  dir = await mkdtemp(join(tmpdir(), "agn-open-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await daemon.close();
});

function configure(editor: string): Promise<void> {
  return writeFile(join(daemon.paths.home, "config.yaml"), `editor: ${editor}\n`);
}

/** A task with whatever the daemon should open it in: a worktree, a session's cwd, or neither. */
function seed(opts: { worktreePath?: string; cwd?: string } = {}): Task {
  const now = new Date().toISOString();
  const id = newId();
  const task = daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "a task",
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: opts.worktreePath ?? null,
    branch: opts.worktreePath === undefined ? null : "agn/task",
    baseCommit: null,
    status: "stopped",
    origin: "agn",
    createdAt: now,
    updatedAt: now,
  });
  if (opts.cwd === undefined) {
    return task;
  }
  return daemon.ledger.tasks.start(id, {
    branch: task.branch,
    baseCommit: null,
    session: {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: null,
      tmuxSocket: null,
      launchId: null,
      pid: 4242,
      cwd: opts.cwd,
      lastSeenAt: now,
    },
  });
}

function open(task: Task, query = ""): Promise<Response> {
  return daemon.request(`/tasks/${task.id}/open${query}`);
}

async function body(response: Response): Promise<OpenTaskResponse> {
  expect(response.status).toBe(200);
  return (await response.json()) as OpenTaskResponse;
}

async function failure(response: Response): Promise<{ code: string; hint: string }> {
  return ((await response.json()) as { error: { code: string; hint: string } }).error;
}

describe("GET /editors", () => {
  it("lists what the machine has and defaults to the first of them", async () => {
    const listed = (await (await daemon.request("/editors")).json()) as EditorsResponse;
    expect(listed.editors.map((editor) => editor.id)).toEqual(["vscode", "cursor"]);
    expect(listed.default).toBe("vscode");
  });

  it("defaults to the configured editor when it is installed", async () => {
    await configure("cursor");
    const listed = (await (await daemon.request("/editors")).json()) as EditorsResponse;
    expect(listed.default).toBe("cursor");
  });

  it("falls back to the first detected editor when the configured one is missing", async () => {
    await configure("zed");
    const listed = (await (await daemon.request("/editors")).json()) as EditorsResponse;
    expect(listed.default).toBe("vscode");
  });

  it("has no default on a machine with no editor", async () => {
    await boot([]);
    const listed = (await (await daemon.request("/editors")).json()) as EditorsResponse;
    expect(listed).toEqual({ editors: [], default: null });
  });
});

describe("GET /tasks/:id/open", () => {
  it("opens the worktree with the first detected editor", async () => {
    const task = seed({ worktreePath: dir });
    const opened = await body(await open(task));
    expect(opened.editor.id).toBe("vscode");
    expect(opened.dir).toBe(dir);
    expect(opened.argv).toEqual([CODE, dir]);
  });

  it("runs an app bundle through the system opener", async () => {
    const task = seed({ worktreePath: dir });
    const opened = await body(await open(task, "?editor=cursor"));
    expect(opened.argv).toEqual(["open", "-a", "/Applications/Cursor.app", dir]);
  });

  it("prefers the query over the configured editor", async () => {
    await configure("cursor");
    const task = seed({ worktreePath: dir });
    expect((await body(await open(task, "?editor=vscode"))).editor.id).toBe("vscode");
  });

  it("uses the configured editor when the query names none", async () => {
    await configure("cursor");
    const task = seed({ worktreePath: dir });
    expect((await body(await open(task))).editor.id).toBe("cursor");
  });

  it("opens an adopted session's own directory", async () => {
    const task = seed({ cwd: dir });
    expect((await body(await open(task))).dir).toBe(dir);
  });

  it("opens the repo itself for a task with no worktree and no session", async () => {
    const task = seed();
    expect((await body(await open(task))).dir).toBe(repo.path);
  });

  it("refuses a worktree that has been cleaned, and names --base", async () => {
    const task = seed({ worktreePath: join(dir, "gone") });
    const response = await open(task);
    expect(response.status).toBe(409);
    const error = await failure(response);
    expect(error.code).toBe("worktree-cleaned");
    expect(error.hint).toContain(`--base ${task.id}`);
  });

  it("lists the editors it did find when the one asked for is missing", async () => {
    const task = seed({ worktreePath: dir });
    const response = await open(task, "?editor=zed");
    expect(response.status).toBe(400);
    const error = await failure(response);
    expect(error.code).toBe("editor-not-found");
    expect(error.hint).toContain("vscode, cursor");
    expect(error.hint).toContain("--editor");
  });

  it("names the config file when the configured editor is missing", async () => {
    await configure("zed");
    const task = seed({ worktreePath: dir });
    const error = await failure(await open(task));
    expect(error.code).toBe("editor-not-found");
    expect(error.hint).toContain(daemon.paths.config);
  });

  it("says what to install when the machine has no editor at all", async () => {
    await boot([]);
    const task = seed({ worktreePath: dir });
    const response = await open(task);
    expect(response.status).toBe(400);
    const error = await failure(response);
    expect(error.code).toBe("editor-none");
    expect(error.hint).toContain("config.yaml");
  });

  it("rejects an editor that is not one of the ids", async () => {
    const task = seed({ worktreePath: dir });
    const response = await open(task, "?editor=vim");
    expect(response.status).toBe(400);
    expect((await failure(response)).code).toBe("request-invalid");
  });

  it("refuses a task id that matches nothing", async () => {
    const response = await daemon.request("/tasks/zzzzzzzzzz/open");
    expect(response.status).toBe(404);
  });
});
