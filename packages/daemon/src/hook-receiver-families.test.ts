import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type HarnessId,
  type HookResponse,
  type HooksInstallResponse,
  newId,
  type Repo,
  type Task,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureDetection } from "./test-detection.js";

/** The payloads the Pi extension and the OpenCode plugin post, as their own tests build them. */
const PAYLOADS = fileURLToPath(new URL("../../../tests/fixtures/hooks/payloads/", import.meta.url));

let daemon: TestDaemon;
let repo: Repo;
let cwd = "";

beforeEach(async () => {
  daemon = await createTestDaemon({
    detect: () => Promise.resolve(fixtureDetection(["sonnet-4.5"], ["pi", "opencode"])),
  });
  repo = await daemon.addRepo();
  cwd = await mkdtemp(join(tmpdir(), "agn-session-"));
  // The per-user installers say out loud where they wrote; tests read that, they do not print it.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cwd, { recursive: true, force: true });
  await daemon.close();
});

function seed(harness: HarnessId): Task {
  const now = new Date().toISOString();
  const id = newId();
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "a task",
    prompt: "do the thing",
    profileId: `${harness}:default:native`,
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: now,
    updatedAt: now,
  });
  return daemon.ledger.tasks.start(id, {
    branch: null,
    baseCommit: null,
    session: {
      harness,
      sessionId: null,
      tmuxSession: `agn-${id}`,
      tmuxSocket: "agn-test",
      launchId: newId(),
      pid: null,
      cwd,
      lastSeenAt: now,
    },
  });
}

async function payload(harness: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(PAYLOADS, harness, `${name}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function send(harness: string, body: unknown, taskId: string): Promise<Response> {
  return daemon.request(`/hooks/${harness}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agn-task-id": taskId },
    body: JSON.stringify(body),
  });
}

async function post(harness: string, body: unknown, taskId: string): Promise<HookResponse> {
  const response = await send(harness, body, taskId);
  expect(response.status).toBe(200);
  return (await response.json()) as HookResponse;
}

describe("the Pi and OpenCode families over the daemon's hook route", () => {
  it("records the transcript pi reports as the session to resume", async () => {
    const task = seed("pi");
    const sessions = join(daemon.home, ".pi", "agent", "sessions");
    await mkdir(sessions, { recursive: true });
    const file = join(sessions, "2026-09-01T10-00-00_abc.jsonl");
    await writeFile(file, "", "utf8");

    const started = await post(
      "pi",
      { ...(await payload("pi", "session-start")), session_file: file },
      task.id,
    );
    expect(started.applied).toBeNull();
    expect(started.task.session?.sessionId).toBe(file);

    const ended = await post(
      "pi",
      { ...(await payload("pi", "agent-end")), session_file: file },
      task.id,
    );
    expect(ended.applied).toBe("waiting");
  });

  it("moves an OpenCode task between running and waiting on its plugin's events", async () => {
    const task = seed("opencode");
    daemon.ledger.tasks.setStatus(task.id, "waiting");

    const busy = await post("opencode", await payload("opencode", "session-busy"), task.id);
    expect(busy.applied).toBe("running");
    expect(busy.task.session?.sessionId).toBe("ses_root");

    expect(
      (await post("opencode", await payload("opencode", "session-idle"), task.id)).applied,
    ).toBe("waiting");
    daemon.ledger.tasks.setStatus(task.id, "running");
    expect(
      (await post("opencode", await payload("opencode", "permission-asked"), task.id)).applied,
    ).toBe("waiting");
  });

  it("finds the pi task by the directory it runs in when the hook carries no task id", async () => {
    const task = seed("pi");
    // An adopted session has none of agn's environment, so the header is empty and the payload
    // is all there is to go on.
    const applied = await post("pi", { ...(await payload("pi", "agent-end")), cwd }, "");

    expect(applied.task.id).toBe(task.id);
    expect(applied.applied).toBe("waiting");
  });

  it("moves a Mimo Code task on the events its own plugin posts", async () => {
    const task = seed("mimo-code");
    daemon.ledger.tasks.setStatus(task.id, "waiting");

    const busy = await post("mimo-code", await payload("mimo-code", "session-busy"), task.id);
    expect(busy.applied).toBe("running");
    expect(busy.task.session?.sessionId).toBe("ses_mimo");
    expect(
      (await post("mimo-code", await payload("mimo-code", "session-idle"), task.id)).applied,
    ).toBe("waiting");
  });

  it("installs the OpenCode plugin into the user's own plugin directory", async () => {
    const response = await daemon.request(`/repos/${repo.id}/hooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness: "opencode" }),
    });
    expect(response.status).toBe(200);
    const { installs } = (await response.json()) as HooksInstallResponse;
    expect(installs).toEqual([
      {
        harness: "opencode",
        file: join(daemon.home, ".config", "opencode", "plugins", "agn-status.js"),
        changed: true,
        verify: "restart opencode if it was running: plugins load at start",
      },
    ]);
    const plugin = await readFile(installs[0]?.file ?? "", "utf8");
    expect(plugin).toContain("/hooks/opencode");
    expect(plugin).not.toContain("Bearer 0123");
  });

  it("refuses to install over a plugin of that name the user wrote", async () => {
    const dir = join(daemon.home, ".config", "opencode", "plugins");
    await mkdir(dir, { recursive: true });
    const mine = "export default { id: 'mine' }\n";
    await writeFile(join(dir, "agn-status.js"), mine, "utf8");

    const response = await daemon.request(`/repos/${repo.id}/hooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness: "opencode" }),
    });

    expect(response.status).toBe(400);
    const { error } = (await response.json()) as { error: { code: string } };
    expect(error.code).toBe("hook-config-unwritable");
    expect(await readFile(join(dir, "agn-status.js"), "utf8")).toBe(mine);
  });
});
