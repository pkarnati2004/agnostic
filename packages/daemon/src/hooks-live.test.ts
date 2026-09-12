import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type HookResponse, type Repo, run, type Task, type TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  // The hook script finds the daemon the way any hook does: through daemon.json and the token file.
  await daemon.serve();
});

afterEach(() => daemon.close());

async function start(repo: Repo, profile = PROFILE): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "do the thing", profile }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

/** Types a line into the fake agent, which fires the hook the installed config named. */
async function type(task: Task, line: string): Promise<void> {
  const session = task.session;
  if (session?.tmuxSession == null || session.tmuxSocket === null) {
    throw new Error("that task has no tmux session");
  }
  await run(
    "tmux",
    ["-L", session.tmuxSocket, "send-keys", "-t", session.tmuxSession, line, "Enter"],
    {
      env: daemon.launch?.env,
      inheritEnv: false,
    },
  );
}

function status(id: string): Task["status"] | undefined {
  return daemon.ledger.tasks.get(id)?.status;
}

async function waitForStatus(task: Task, wanted: Task["status"]): Promise<void> {
  await waitFor(`task ${task.id} to be ${wanted}`, () => status(task.id) === wanted, 15_000);
}

describe("a hook from a live harness", () => {
  it("installs into the worktree, carries the task id, and moves the task", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    const settings = join(task.session?.cwd ?? "", ".claude", "settings.local.json");
    expect(JSON.parse(await readFile(settings, "utf8"))).toHaveProperty("hooks.Stop");

    await waitFor(
      "the fake agent to report its session id",
      () => daemon.ledger.tasks.get(task.id)?.session?.sessionId?.startsWith("fake-") === true,
      15_000,
    );
    expect(await daemon.launch?.readLog()).toContain(`AGN_TASK_ID=${task.id}`);

    await type(task, "ask");
    await waitForStatus(task, "waiting");
    await type(task, "work");
    await waitForStatus(task, "running");
    await type(task, "permission");
    await waitForStatus(task, "waiting");
    await type(task, "approved");
    await waitForStatus(task, "running");

    const transitions = daemon.ledger.events
      .forTask(task.id)
      .filter((event) => event.kind === "task.status");
    expect(transitions.length).toBe(5);
  });

  it("restores a hook config the user deleted, for a task that is already running", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    const settings = join(task.session?.cwd ?? "", ".claude", "settings.local.json");
    await rm(settings);

    const response = await daemon.request(`/repos/${repo.id}/hooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness: "claude-code" }),
    });
    expect(response.status).toBe(200);
    expect(await readFile(settings, "utf8")).toContain("post.sh");
  });

  it("leaves a task that was stopped where it is", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    const late = await daemon.request("/hooks/claude-code", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agn-task-id": task.id },
      body: JSON.stringify({ hook_event_name: "Stop" }),
    });
    const body = (await late.json()) as HookResponse;
    expect(body.applied).toBeNull();
    expect(body.task.status).toBe("stopped");
  });

  it("still starts the task when the hook install fails, and logs why", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE, git: false });
    // A folder workspace launches in the repo path itself; a plain file where the installer needs
    // a directory makes its mkdir fail without agn ever touching the repo the test set up.
    await writeFile(join(repo.path, ".claude"), "not a directory", "utf8");
    const task = await start(repo);
    expect(task.status).toBe("running");
    expect(await daemon.readLog()).toContain(
      "hooks install failed harness=claude-code code=hook-config-unwritable",
    );
  });

  it("installs Codex's per-user hook config when a Codex task starts", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo, "codex:default:native");
    const home = daemon.launch?.env.HOME ?? "";
    const hooks = JSON.parse(await readFile(join(home, ".codex", "hooks.json"), "utf8")) as {
      hooks: Record<string, unknown>;
    };
    expect(Object.keys(hooks.hooks)).toContain("Stop");
    expect(await readFile(join(home, ".codex", "config.toml"), "utf8")).toContain("trusted_hash");

    await type(task, "ask");
    await waitForStatus(task, "waiting");
  });
});
