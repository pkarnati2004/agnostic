import { newId, type Repo, TERMINAL_TOKEN_PROTOCOL } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDaemon, TEST_TOKEN, type TestDaemon, waitFor } from "./test-daemon.js";
import { repoWithConfig, startTask } from "./test-task-run.js";
import { connect, opened, refusal } from "./test-terminal-client.js";

// Who the terminal socket lets in, against a live pane: the path, the Origin, the token in the
// subprotocol, and the task behind the id. What flows once it is in is terminal-pane.test.ts.

let daemon: TestDaemon;
let port: number;
let repo: Repo;

beforeAll(async () => {
  daemon = await createTestDaemon({ tmux: true });
  port = Number(new URL(await daemon.listen()).port);
  repo = await repoWithConfig(daemon);
}, 30_000);

afterAll(() => daemon.close());

describe("the terminal socket's upgrade", () => {
  it("refuses an upgrade on any other path", async () => {
    const task = await startTask(daemon, repo);
    const refused = await refusal(connect(port, `/tasks/${task.id}/terminals`));
    expect(refused.status).toBe(404);
    expect(refused.body.error.code).toBe("not-found");
  }, 30_000);

  it("refuses a socket with no token, the wrong token, or another protocol", async () => {
    const task = await startTask(daemon, repo);
    for (const protocols of [[], [`${TERMINAL_TOKEN_PROTOCOL}wrong`], ["chat"]]) {
      const refused = await refusal(connect(port, `/tasks/${task.id}/terminal`, { protocols }));
      expect(refused.status).toBe(401);
      expect(refused.body.error.code).toBe("unauthorized");
    }
  }, 30_000);

  it("refuses a foreign origin and accepts both spellings of its own", async () => {
    const task = await startTask(daemon, repo);
    const refused = await refusal(
      connect(port, `/tasks/${task.id}/terminal`, { origin: "http://evil.example" }),
    );
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("origin-forbidden");
    for (const host of ["127.0.0.1", "localhost"]) {
      const term = await opened(
        connect(port, `/tasks/${task.id}/terminal`, { origin: `http://${host}:${port}` }),
      );
      expect(term.ws.protocol).toBe(`${TERMINAL_TOKEN_PROTOCOL}${TEST_TOKEN}`);
      term.ws.close();
      await term.closed;
    }
  }, 30_000);

  it("refuses a task that is unknown, stopped, or was never agn's to attach to", async () => {
    const unknown = await refusal(connect(port, "/tasks/zzzzzzzzzz/terminal"));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("task-not-found");

    const task = await startTask(daemon, repo);
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    const stopped = await refusal(connect(port, `/tasks/${task.id}/terminal`));
    expect(stopped.status).toBe(409);
    expect(stopped.body.error.code).toBe("session-not-running");
    expect(stopped.body.error.hint).toContain(`agn resume ${task.id}`);

    const outside = await refusal(connect(port, `/tasks/${adoptedTask()}/terminal`));
    expect(outside.status).toBe(409);
    expect(outside.body.error.code).toBe("session-not-attachable");
  }, 30_000);

  it("answers 400 ambiguous-id when a prefix matches two tasks", async () => {
    const first = seededTask("ambqrstuvw");
    const second = seededTask("ambzyxwvut");
    const refused = await refusal(connect(port, "/tasks/amb/terminal"));
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("ambiguous-id");
    expect(refused.body.error.hint).toContain(first);
    expect(refused.body.error.hint).toContain(second);
  }, 30_000);

  it("refuses a foreign origin with 403 even when the token is missing or wrong", async () => {
    const task = await startTask(daemon, repo);
    for (const protocols of [[], [`${TERMINAL_TOKEN_PROTOCOL}wrong`]]) {
      const refused = await refusal(
        connect(port, `/tasks/${task.id}/terminal`, { origin: "http://evil.example", protocols }),
      );
      // The origin check runs before the token is looked at: a foreign page never learns whether
      // its guessed token was close.
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("origin-forbidden");
    }
  }, 30_000);

  it("every refusal body is the ADR 010 error shape", async () => {
    const task = await startTask(daemon, repo);
    const cases = [
      connect(port, `/tasks/${task.id}/terminals`),
      connect(port, `/tasks/${task.id}/terminal`, { protocols: [] }),
      connect(port, `/tasks/${task.id}/terminal`, { origin: "http://evil.example" }),
      connect(port, "/tasks/zzzzzzzzzz/terminal"),
    ];
    for (const ws of cases) {
      const { body } = await refusal(ws);
      expect(body).toMatchObject({
        error: { code: expect.any(String), message: expect.any(String), hint: expect.any(String) },
      });
    }
  }, 30_000);

  it("logs the task id and the duration, and never the token", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    term.ws.close();
    await term.closed;
    await refusal(connect(port, `/tasks/${task.id}/terminal`, { protocols: [] }));
    await waitFor("the log has been written", async () =>
      (await daemon.readLog()).includes("terminal disconnect"),
    );
    const log = await daemon.readLog();
    expect(log).toContain(`terminal connect taskId=${task.id}`);
    expect(log).toMatch(new RegExp(`terminal disconnect taskId=${task.id} durationMs=\\d+ code=`));
    expect(log).toMatch(/terminal refused .*status=401/);
    expect(log).not.toContain(TEST_TOKEN);
  }, 30_000);
});

/** A bare task row, for the resolver's ambiguous-id check: no session, no attach ever attempted. */
function seededTask(id: string): string {
  const now = new Date().toISOString();
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "seeded",
    prompt: "seeded",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** A task someone started outside tmux: agn watches its pid and has no pane to put on a socket. */
function adoptedTask(): string {
  const now = new Date().toISOString();
  const id = newId();
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "adopted",
    prompt: "adopted",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "adopted",
    baseCommit: null,
    compareId: null,
    createdAt: now,
    updatedAt: now,
  });
  daemon.ledger.tasks.start(id, {
    branch: null,
    baseCommit: null,
    session: {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: null,
      tmuxSocket: null,
      launchId: null,
      pid: process.pid,
      cwd: repo.path,
      lastSeenAt: now,
    },
  });
  return id;
}
