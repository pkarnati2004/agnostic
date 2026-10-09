import { describe, expect, it } from "vitest";
import { createClient } from "./client";
import { ApiError } from "./error";

type Call = { method: string; url: string; token: string | undefined; body: string | null };

function stubClient(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = createClient({
    token: "tok",
    fetch: (input, init) => {
      const call = {
        method: init?.method ?? "GET",
        url: String(input),
        token: new Headers(init?.headers).get("authorization") ?? undefined,
        body: typeof init?.body === "string" ? init.body : null,
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
    await client.usage();
    await client.taskUsage("abc");
    await client.syncRepo("r1", {});
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /repos?all=1",
      "GET /tasks",
      "GET /tasks/t%201",
      "GET /profiles",
      "POST /tasks/t1/stop",
      "POST /tasks/t1/resume",
      "POST /tasks/t1/handoff",
      "GET /usage",
      "GET /tasks/abc/usage",
      "POST /repos/r1/sync",
    ]);
    expect(calls.every((call) => call.token === "Bearer tok")).toBe(true);
  });

  it("reads a task's changes, one file's patch, the editors and the open", async () => {
    const { client, calls } = stubClient(() => ok({}));
    await client.changes("t1");
    await client.diff("t1", "src/a b.ts");
    await client.editors();
    await client.openTask("t1", { editor: "zed" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /tasks/t1/changes",
      "GET /tasks/t1/diff?path=src%2Fa%20b.ts",
      "GET /editors",
      "POST /tasks/t1/open",
    ]);
    expect(calls.at(-1)?.body).toBe(JSON.stringify({ editor: "zed" }));
    expect(calls.every((call) => call.token === "Bearer tok")).toBe(true);
  });

  it("posts a plan the usage bar was told, and the empty body that only re-detects", async () => {
    const { client, calls } = stubClient(() => ok({}));
    await client.doctor({});
    await client.doctor({ plans: { claude: "max20" } });
    expect(calls.map((call) => `${call.method} ${call.url} ${call.body}`)).toEqual([
      "POST /doctor {}",
      'POST /doctor {"plans":{"claude":"max20"}}',
    ]);
  });

  it("reads config.yaml and patches the keys the user changed", async () => {
    const { client, calls } = stubClient(() => ok({}));
    await client.config();
    await client.patchConfig({ appearance: { theme: "ink" } });
    expect(calls.map((call) => `${call.method} ${call.url} ${call.body}`)).toEqual([
      "GET /config null",
      'PATCH /config {"appearance":{"theme":"ink"}}',
    ]);
  });

  it("reads the snapshot cursor each list carries", async () => {
    const { client } = stubClient((call) =>
      ok(call.url === "/repos?all=1" ? { repos: [], cursor: 7 } : { tasks: [], cursor: 9 }),
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

  it("asks for a recommendation with the signal the next keystroke aborts", async () => {
    let sent: string | null = null;
    let signal: AbortSignal | null = null;
    const client = createClient({
      token: "tok",
      fetch: (_input, init) => {
        sent = String(init?.body);
        signal = init?.signal ?? null;
        return Promise.resolve(ok({ recommendation: null }));
      },
    });
    const controller = new AbortController();
    await client.recommend({ repoId: "r1", prompt: "add a retry budget" }, controller.signal);
    expect(sent).toBe(JSON.stringify({ repoId: "r1", prompt: "add a retry budget" }));
    expect(signal).toBe(controller.signal);
  });

  it("starts a task on the repo and returns the row the daemon created", async () => {
    const { client, calls } = stubClient(() =>
      Response.json({ task: { id: "t9" } }, { status: 201 }),
    );
    const { task } = await client.runTask("r 1", {
      prompt: "add a retry budget",
      profile: "claude-code:sonnet-4.5:native",
    });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(["POST /repos/r%201/tasks"]);
    expect(task.id).toBe("t9");
  });

  it("asks the daemon for a spec and hands back what it wrote", async () => {
    const { client, calls } = stubClient(() =>
      ok({
        title: "Add a retry budget",
        spec: "Change the client.",
        acceptance: "- [ ] the client retries",
        profileId: "claude-code:opus:native",
        model: "opus",
      }),
    );
    const spec = await client.writeSpec("r 1", { prompt: "add a retry budget", intent: "debug" });
    expect(calls).toEqual([
      {
        method: "POST",
        url: "/repos/r%201/spec",
        token: "Bearer tok",
        body: JSON.stringify({ prompt: "add a retry budget", intent: "debug" }),
      },
    ]);
    expect(spec.title).toBe("Add a retry budget");
    expect(spec.profileId).toBe("claude-code:opus:native");
  });

  it("reports a machine with no agent that can write specs", async () => {
    const { client } = stubClient(() =>
      Response.json(
        {
          error: {
            code: "spec-writer-unavailable",
            message: "no subscription-billed agent can write specs on this machine",
            hint: "Write the spec yourself in the dialog.",
          },
        },
        { status: 409 },
      ),
    );
    const failure = await client
      .writeSpec("r1", { prompt: "add a retry budget" })
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      code: "spec-writer-unavailable",
      hint: "Write the spec yourself in the dialog.",
      status: 409,
    });
  });
});
