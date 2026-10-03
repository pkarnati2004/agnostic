// The branch half of the client: the pull request, and the two turns the panel asks the agent for.
import { describe, expect, it } from "vitest";
import { createClient } from "./client";

type Call = { method: string; url: string; token: string | undefined; body: string | null };

function stubClient() {
  const calls: Call[] = [];
  const client = createClient({
    token: "tok",
    fetch: (input, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        token: new Headers(init?.headers).get("authorization") ?? undefined,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return Promise.resolve(Response.json({}, { status: 200 }));
    },
  });
  return { client, calls };
}

describe("the branch calls", () => {
  it("posts the title to the task's pr route", async () => {
    const { client, calls } = stubClient();
    await client.createPr("t1", { title: "Ship it" });
    await client.createPr("t1", {});
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /tasks/t1/pr",
      "POST /tasks/t1/pr",
    ]);
    expect(calls[0]?.body).toBe(JSON.stringify({ title: "Ship it" }));
    expect(calls[1]?.body).toBe("{}");
  });

  it("asks for an update and for a commit with no body at all", async () => {
    const { client, calls } = stubClient();
    await client.updateTask("t1");
    await client.askCommit("t 1");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /tasks/t1/update",
      "POST /tasks/t%201/commit",
    ]);
    expect(calls.every((call) => call.body === null)).toBe(true);
    expect(calls.every((call) => call.token === "Bearer tok")).toBe(true);
  });
});
