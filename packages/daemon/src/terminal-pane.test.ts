import type { Repo, Task, TaskResponse } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { repoWithConfig, startTask } from "./test-task-run.js";
import {
  attachedClients,
  connect,
  opened,
  paneWidth,
  TOKEN_PROTOCOL,
  tmuxIn,
} from "./test-terminal-client.js";

// What flows once the socket is accepted: bytes both ways, the size, and the three ways it ends.

let daemon: TestDaemon;
let port: number;
let repo: Repo;

beforeAll(async () => {
  daemon = await createTestDaemon({ tmux: true });
  port = Number(new URL(await daemon.listen()).port);
  repo = await repoWithConfig(daemon);
}, 30_000);

afterAll(() => daemon.close());

function agentLog(): Promise<string> {
  return daemon.launch?.readLog() ?? Promise.resolve("");
}

function taskStatus(task: Task): Promise<string> {
  return daemon
    .request(`/tasks/${task.id}`)
    .then((response) => response.json() as Promise<TaskResponse>)
    .then((body) => body.task.status);
}

describe("a task's pane over the socket", () => {
  it("answers ready and then carries bytes both ways", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    expect(term.text[0]).toBe(JSON.stringify({ type: "ready" }));
    term.ws.send(Buffer.from("hello\r", "utf8"));
    await waitFor("the agent read the line", async () =>
      (await agentLog()).includes("line: hello"),
    );
    // The pane's answer comes back as binary, so one line proves both directions.
    await waitFor("the pane echoed it back", () => term.pane().includes("line: hello"), 5_000);
    term.ws.send(Buffer.from("héllo ✓\r", "utf8"));
    await waitFor(
      "the non-ASCII line survived the round trip",
      () => term.pane().includes("line: héllo ✓"),
      5_000,
    );
    term.ws.close();
    await term.closed;
  }, 30_000);

  it("sizes the pane from the first frame and from every resize after it", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    await waitFor(
      "the first frame's size is the pane's",
      async () => (await paneWidth(daemon, task)) === "120",
      3_000,
    );
    term.ws.send(JSON.stringify({ type: "resize", cols: 97, rows: 30 }));
    await waitFor(
      "the resize reached tmux",
      async () => (await paneWidth(daemon, task)) === "97",
      3_000,
    );
    term.ws.close();
    await term.closed;
  }, 30_000);

  it("ends the tmux client when the socket closes, and nothing else", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    await waitFor(
      "the client is attached",
      async () => (await attachedClients(daemon, task)).length === 1,
    );
    term.ws.close();
    await term.closed;
    await waitFor(
      "the tmux client is gone",
      async () => (await attachedClients(daemon, task)).length === 0,
      2_000,
    );
    expect(await tmuxIn(daemon, ["has-session", "-t", `agn-${task.id}`])).toBe("");
    expect(await taskStatus(task)).toBe("running");
    // A client leaving must not reach the harness: no TERM, no EOF on its stdin.
    const lines = (await agentLog()).split("\n");
    expect(lines).not.toContain("term");
    expect(lines).not.toContain("eof");
  }, 30_000);

  it("serves two clients on one task, and closing one leaves the other typing", async () => {
    const task = await startTask(daemon, repo);
    const first = await opened(connect(port, `/tasks/${task.id}/terminal`));
    const second = await opened(connect(port, `/tasks/${task.id}/terminal`));
    await waitFor("both clients are attached", async () => {
      return (await attachedClients(daemon, task)).length === 2;
    });
    first.ws.close();
    await first.closed;
    await waitFor(
      "one client is left",
      async () => {
        return (await attachedClients(daemon, task)).length === 1;
      },
      2_000,
    );
    second.ws.send(Buffer.from("still\r", "utf8"));
    await waitFor("the surviving client still types", async () =>
      (await agentLog()).includes("line: still"),
    );
    second.ws.close();
    await second.closed;
  }, 30_000);

  it("sends an exit frame and closes normally when the task is stopped", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect((await term.closed).code).toBe(1000);
    expect(JSON.parse(term.text.at(-1) ?? "{}")).toMatchObject({ type: "exit" });
  }, 30_000);

  it("closes a frame over the 1 MiB payload limit", async () => {
    const task = await startTask(daemon, repo);
    const term = await opened(connect(port, `/tasks/${task.id}/terminal`));
    term.ws.send(Buffer.alloc(1024 * 1024 + 16));
    expect((await term.closed).code).toBe(1009);
  }, 30_000);

  it("gives both sockets on one task the same pane output", async () => {
    const task = await startTask(daemon, repo);
    const first = await opened(connect(port, `/tasks/${task.id}/terminal`));
    const second = await opened(connect(port, `/tasks/${task.id}/terminal`));
    first.ws.send(Buffer.from("both\r", "utf8"));
    await waitFor("the agent read the line", async () => (await agentLog()).includes("line: both"));
    await waitFor(
      "the first socket saw the echo",
      () => first.pane().includes("line: both"),
      5_000,
    );
    await waitFor(
      "the second socket saw the same echo",
      () => second.pane().includes("line: both"),
      5_000,
    );
    first.ws.close();
    second.ws.close();
    await Promise.all([first.closed, second.closed]);
  }, 30_000);
});

describe("closing the daemon", () => {
  it("tells every open socket to go away before the server stops", async () => {
    const other = await createTestDaemon({ tmux: true });
    try {
      const url = await other.listen();
      const task = await startTask(other, await repoWithConfig(other));
      const ws = new WebSocket(`${url.replace("http", "ws")}/tasks/${task.id}/terminal`, [
        TOKEN_PROTOCOL,
      ]);
      const term = await opened(ws);
      await other.close();
      expect((await term.closed).code).toBe(1001);
      expect(await tmuxIn(other, ["list-clients", "-t", `agn-${task.id}`])).toBe("");
    } finally {
      await other.close().catch(() => undefined);
    }
  }, 40_000);
});
