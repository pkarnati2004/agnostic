import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Billing, type HarnessId, newId, type Repo, type Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { fixtureDetection, fixtureProfile } from "./test-detection.js";

/**
 * A Cursor `stop` payload in the shape captured live 2026-10-01 from cursor-agent
 * 2026.10.01-14929f9, with smaller counts and a placeholder address. The counts are top-level
 * fields; `user_email` is on every payload Cursor sends and agn stores no part of it.
 */
const STOP = fileURLToPath(
  new URL("../../../tests/fixtures/usage/cursor-stop.json", import.meta.url),
);

/** The address in the fixture, which must reach neither the ledger nor the log. */
const EMAIL = "redacted@example.invalid";

/** JSON.stringify drops an undefined field, so this posts a payload with no count on it at all. */
const NO_COUNTS = {
  input_tokens: undefined,
  output_tokens: undefined,
  cache_read_tokens: undefined,
  cache_write_tokens: undefined,
};

let daemon: TestDaemon;
let repo: Repo;

async function start(billing: Billing): Promise<void> {
  daemon = await createTestDaemon({
    detect: () =>
      Promise.resolve({
        ...fixtureDetection(["composer-2"], ["cursor-agent"]),
        profiles: [fixtureProfile(null, { harness: "cursor-agent", billing })],
      }),
  });
  repo = await daemon.addRepo();
}

afterEach(async () => {
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
      cwd: "/work/repo",
      lastSeenAt: now,
    },
  });
}

async function postStop(task: Task, over: Record<string, unknown> = {}): Promise<Response> {
  const payload = { ...JSON.parse(await readFile(STOP, "utf8")), ...over };
  return daemon.request("/hooks/cursor-agent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-agn-task-id": task.id },
    body: JSON.stringify(payload),
  });
}

function rows(taskId: string) {
  return daemon.ledger.usage.sumForTask(taskId);
}

/** Everything the daemon wrote down: the ledger file, its write-ahead log, and the daemon log. */
async function kept(): Promise<string> {
  const files = [daemon.paths.db, `${daemon.paths.db}-wal`];
  const written = await Promise.all(files.map((file) => readFile(file, "latin1").catch(() => "")));
  return written.join("") + (await daemon.readLog());
}

describe("usage from a hook payload", () => {
  beforeEach(() => start("api-key"));

  it("records one row with the cached part split out of the input, and prices it", async () => {
    const task = seed("cursor-agent");

    // A model the fixture catalog prices, so the row is priced from the tokens the hook reported.
    expect((await postStop(task, { model: "anthropic/claude-fable-5.1" })).status).toBe(200);

    expect(rows(task.id)).toMatchObject({
      tokens: 1550,
      tokensInput: 200,
      tokensOutput: 300,
      tokensCacheRead: 1000,
      tokensCacheWrite: 50,
    });
    expect(rows(task.id).costUsd).not.toBeNull();
  });

  it("records nothing for the same generation twice", async () => {
    const task = seed("cursor-agent");
    await postStop(task);
    await postStop(task);

    expect(rows(task.id).tokens).toBe(1550);
  });

  it("records nothing for a payload that carries no usage", async () => {
    const task = seed("cursor-agent");

    await postStop(task, NO_COUNTS);

    expect(rows(task.id).tokens).toBe(0);
  });

  it("counts a turn whose model is Cursor's `default` and prices none of it", async () => {
    const task = seed("cursor-agent");

    expect((await postStop(task, { model: "default" })).status).toBe(200);

    expect(rows(task.id).tokens).toBe(1550);
    expect(rows(task.id).costUsd).toBeNull();
    expect(daemon.ledger.usage.latestModelForTask(task.id)).toBeNull();
  });

  it("stores no part of the payload but the counts, and never the user's email", async () => {
    const task = seed("cursor-agent");

    const response = await postStop(task);

    expect(await response.text()).not.toContain(EMAIL);
    expect(rows(task.id).tokens).toBe(1550);
    const written = await kept();
    // The generation id is the row's dedupe ref, so a payload field agn kept would be found here.
    expect(written).toContain("gen_01JD7Q3V9T");
    expect(written).not.toContain(EMAIL);
    expect(written).not.toContain("transcript_path");
  });

  it("records nothing for an event the row does not name as its usage source", async () => {
    const task = seed("cursor-agent");

    await postStop(task, { hook_event_name: "afterAgentResponse" });

    expect(rows(task.id).tokens).toBe(0);
  });

  it("records nothing for a harness whose usage comes from its own transcripts", async () => {
    const task = seed("claude-code");

    const response = await daemon.request("/hooks/claude-code", {
      method: "POST",
      headers: { "content-type": "application/json", "x-agn-task-id": task.id },
      body: JSON.stringify({
        hook_event_name: "Stop",
        session_id: "s-aaaa",
        result: { usage: { input_tokens: 10, output_tokens: 5 } },
      }),
    });

    expect(response.status).toBe(200);
    expect(rows(task.id).tokens).toBe(0);
  });
});

describe("usage from a hook payload on a subscription", () => {
  beforeEach(() => start("subscription"));

  it("counts the tokens and prices none of them", async () => {
    const task = seed("cursor-agent");

    await postStop(task);

    expect(rows(task.id).tokens).toBe(1550);
    expect(rows(task.id).costUsd).toBeNull();
  });
});
