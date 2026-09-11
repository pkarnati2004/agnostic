import { createDaemonClient, type Event } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, TEST_TOKEN, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let baseUrl: string;
const controllers: AbortController[] = [];

beforeEach(async () => {
  daemon = await createTestDaemon({ feedPollMs: 20, heartbeatMs: 50 });
  baseUrl = await daemon.listen();
});

afterEach(async () => {
  for (const controller of controllers) {
    controller.abort();
  }
  controllers.length = 0;
  await daemon.close();
});

function appendStatus(): number {
  return daemon.ledger.events.append({
    ts: new Date().toISOString(),
    taskId: "mnpqrstuvw",
    kind: "task.status",
    payload: { from: "queued", to: "running" },
  }).id;
}

function connect(path: string, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  controllers.push(controller);
  return fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${TEST_TOKEN}`, ...headers },
    signal: controller.signal,
  });
}

/** Reads the live body until `stop` is happy, so a test never waits on a stream that never ends. */
async function readUntil(response: Response, stop: (text: string) => boolean): Promise<string> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 2_000;
  while (reader !== undefined && !stop(text)) {
    if (Date.now() > deadline) {
      throw new Error(`stream never satisfied the test; got:\n${text}`);
    }
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader?.cancel();
  return text;
}

describe("GET /events", () => {
  it("refuses a connection with no token", async () => {
    const response = await fetch(`${baseUrl}/events?after=0`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("replays seeded events as id, event and data frames in id order", async () => {
    appendStatus();
    appendStatus();
    const response = await connect("/events?after=0");
    const text = await readUntil(response, (seen) => seen.includes("id: 4"));
    // Two detection events landed before these two, so the ids continue from there.
    expect(text).toContain("retry: 1000");
    expect(text).toContain("event: profile.detected");
    expect(text).toContain("event: task.status");
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(ids).toEqual([1, 2, 3, 4]);
    const first = JSON.parse(/^data: (.+)$/m.exec(text)?.[1] ?? "") as Event;
    expect(first.kind).toBe("profile.detected");
  });

  it("delivers an event written after the connection opened", async () => {
    const response = await connect("/events?after=0");
    const written = new Promise<number>((resolve) => {
      setTimeout(() => resolve(appendStatus()), 50);
    });
    const text = await readUntil(response, (seen) => seen.includes("event: task.status"));
    expect(text).toContain(`id: ${await written}`);
  });

  it("lets Last-Event-ID override ?after", async () => {
    appendStatus();
    const latest = daemon.ledger.events.latestId();
    const response = await connect("/events?after=0", { "last-event-id": String(latest - 1) });
    const text = await readUntil(response, (seen) => seen.includes(`id: ${latest}`));
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
    expect(ids).toEqual([latest]);
  });

  it("sends a keepalive comment", async () => {
    const response = await connect("/events?after=0");
    const text = await readUntil(response, (seen) => seen.includes(": ping"));
    expect(text).toContain(": ping");
  });

  it("rejects a query it does not understand", async () => {
    const response = await connect("/events?since=3");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("logs the connect and the disconnect, and nothing between", async () => {
    const response = await connect("/events?after=2");
    await readUntil(response, (seen) => seen.includes("retry: 1000"));
    expect(await daemon.readLog()).toContain("sse connect cursor=2");
    controllers.pop()?.abort();
    await new Promise((done) => setTimeout(done, 100));
    const log = await daemon.readLog();
    expect(log).toContain("sse disconnect cursor=2");
    expect(log.split("\n").filter((line) => line.includes(" sse "))).toHaveLength(2);
  });
});

describe("createDaemonClient().events", () => {
  it("yields the same events and stops when the caller aborts", async () => {
    const id = appendStatus();
    const client = createDaemonClient({ baseUrl, token: TEST_TOKEN });
    const controller = new AbortController();
    const seen: Event[] = [];
    for await (const event of client.events(0, controller.signal)) {
      seen.push(event);
      if (event.id === id) {
        controller.abort();
      }
    }
    expect(seen.map((event) => event.kind)).toEqual([
      "profile.detected",
      "profile.detected",
      "task.status",
    ]);
  });

  it("throws the daemon's error body when the token is wrong", async () => {
    const client = createDaemonClient({ baseUrl, token: "not-the-token" });
    const controller = new AbortController();
    const iterate = async () => {
      for await (const _ of client.events(0, controller.signal)) {
        return;
      }
    };
    await expect(iterate()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });
});
