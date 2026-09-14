import { describe, expect, it } from "vitest";
import { createClient } from "./client";
import { ApiError } from "./error";

type Call = { method: string; url: string; token: string | undefined };

function stubClient(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = createClient({
    token: "tok",
    fetch: (input, init) => {
      const call = {
        method: init?.method ?? "GET",
        url: String(input),
        token: new Headers(init?.headers).get("authorization") ?? undefined,
      };
      calls.push(call);
      return Promise.resolve(answer(call));
    },
  });
  return { client, calls };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createClient", () => {
  it("sends the bearer token, the method and the path of every call", async () => {
    const { client, calls } = stubClient(() => ok({}));
    await client.listRepos();
    await client.listTasks();
    await client.getTask("t 1");
    await client.profiles();
    await client.stopTask("t1");
    await client.resumeTask("t1");
    await client.handoffTask("t1", { profile: "codex:gpt-5:native" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /repos",
      "GET /tasks",
      "GET /tasks/t%201",
      "GET /profiles",
      "POST /tasks/t1/stop",
      "POST /tasks/t1/resume",
      "POST /tasks/t1/handoff",
    ]);
    expect(calls.every((call) => call.token === "Bearer tok")).toBe(true);
  });

  it("reads the snapshot cursor each list carries", async () => {
    const { client } = stubClient((call) =>
      ok(call.url === "/repos" ? { repos: [], cursor: 7 } : { tasks: [], cursor: 9 }),
    );
    expect((await client.listRepos()).cursor).toBe(7);
    expect((await client.listTasks()).cursor).toBe(9);
  });

  it("sends the handoff body as JSON", async () => {
    let sent: string | null = null;
    const client = createClient({
      token: "tok",
      fetch: (_input, init) => {
        sent = String(init?.body);
        return Promise.resolve(ok({}));
      },
    });
    await client.handoffTask("t1", { profile: "codex:gpt-5:native", note: "over to you" });
    expect(sent).toBe(JSON.stringify({ profile: "codex:gpt-5:native", note: "over to you" }));
  });

  it("turns the daemon's error body into an ApiError", async () => {
    const { client } = stubClient(() =>
      Response.json(
        {
          error: { code: "session-not-running", message: "nothing is running", hint: "Resume it." },
        },
        { status: 409 },
      ),
    );
    const failure = await client.stopTask("t1").catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: "session-not-running",
      message: "nothing is running",
      hint: "Resume it.",
      status: 409,
    });
  });

  it("turns a 401 body into an unauthorized ApiError", async () => {
    const { client } = stubClient(() =>
      Response.json(
        { error: { code: "unauthorized", message: "missing or bad token" } },
        { status: 401 },
      ),
    );
    const failure = await client.listRepos().catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("turns a 403 body into an origin-forbidden ApiError", async () => {
    const { client } = stubClient(() =>
      Response.json(
        { error: { code: "origin-forbidden", message: "that origin is not this daemon" } },
        { status: 403 },
      ),
    );
    const failure = await client.listTasks().catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "origin-forbidden", status: 403 });
  });

  it("reports a daemon that is not answering", async () => {
    const client = createClient({
      token: "tok",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const failure = await client.listRepos().catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "daemon-unreachable", status: null });
    expect((failure as ApiError).hint).toBe("Run `agn daemon start`.");
  });

  it("reports a body that is not the daemon's error shape", async () => {
    const { client } = stubClient(() => new Response("<html>bad gateway</html>", { status: 500 }));
    const failure = await client.listTasks().catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "daemon-response-invalid", status: 500 });
  });
});
