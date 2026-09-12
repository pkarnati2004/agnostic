import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type DetectedHarness,
  type HookResponse,
  type Repo,
  type ResumeTaskResponse,
  run,
  type SessionsResponse,
  type Task,
  type TaskResponse,
} from "@agnostic/core";
import { hookCommand, writeHookScript } from "@agnostic/hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

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

describe("a hook from a session that was relaunched or adopted", () => {
  it("keeps reporting status after a resume", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    await waitFor(
      "the fake agent to report its session id",
      () => daemon.ledger.tasks.get(task.id)?.session?.sessionId?.startsWith("fake-") === true,
      15_000,
    );
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    // The install has to happen again: a resume is a new process, reading the config as it starts.
    await rm(join(task.session?.cwd ?? "", ".claude", "settings.local.json"));

    const response = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
    expect(response.status).toBe(200);
    const resumed = ((await response.json()) as ResumeTaskResponse).task;
    expect(resumed.status).toBe("running");

    await type(resumed, "ask");
    await waitForStatus(resumed, "waiting");
  });

  it("moves an adopted session, which is matched by the directory it runs in", async () => {
    const repo = await daemon.addRepo();
    const cwd = join(repo.path, "by-hand");
    const session = "manual";
    await mkdir(cwd, { recursive: true });
    // Started by hand, with the hook command a previous install left in its config: it carries no
    // task id of agn's, which is the case the receiver falls back to the directory for.
    await writeHookScript(daemon.paths);
    await run(
      "tmux",
      [
        "-L",
        daemon.launch?.socketName ?? "",
        "new-session",
        "-d",
        "-s",
        session,
        "-c",
        cwd,
        await harnessNamed("claude"),
        "--hook-command",
        hookCommand(daemon.paths, "claude-code"),
      ],
      { env: daemon.launch?.env ?? {}, inheritEnv: false },
    );

    const task = await adopt(repo, cwd);
    expect(task.origin).toBe("adopted");
    // Adopt installs into the directory the session is in, for the next process started there.
    expect(await readFile(join(cwd, ".claude", "settings.local.json"), "utf8")).toContain(
      "post.sh",
    );

    await run(
      "tmux",
      ["-L", daemon.launch?.socketName ?? "", "send-keys", "-t", session, "ask", "Enter"],
      { env: daemon.launch?.env ?? {}, inheritEnv: false },
    );
    await waitForStatus(task, "waiting");
  });
});

/** ps reports the script's own name, so the fake agent is copied to the name detection matches. */
async function harnessNamed(name: string): Promise<string> {
  const bin = join(daemon.paths.home, "detect-bin");
  await mkdir(bin, { recursive: true });
  const path = join(bin, name);
  await copyFile(FAKE_AGENT, path);
  await chmod(path, 0o755);
  return path;
}

/** The session the daemon can see under `cwd`, adopted as a task. */
async function adopt(repo: Repo, cwd: string): Promise<Task> {
  let sessions: DetectedHarness[] = [];
  await waitFor("the daemon to see the session started by hand", async () => {
    const response = await daemon.request(
      `/repos/${repo.id}/sessions?path=${encodeURIComponent(cwd)}`,
    );
    sessions = ((await response.json()) as SessionsResponse).sessions;
    return sessions.length > 0;
  });
  const response = await daemon.request(`/repos/${repo.id}/adopt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: cwd, pid: sessions[0]?.pid }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}
