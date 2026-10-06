// Archive and delete: the clean the page offers as Archive, and the route that removes the rows.
import { describe, expect, it } from "vitest";
import { createClient } from "./client";

type Call = { method: string; url: string; body: string | null };

function stubClient() {
  const calls: Call[] = [];
  const client = createClient({
    token: "tok",
    fetch: (input, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return Promise.resolve(Response.json({}, { status: 200 }));
    },
  });
  return { client, calls };
}

describe("the archive and delete calls", () => {
  it("posts the clean body, with force only when the user asked for it", async () => {
    const { client, calls } = stubClient();
    await client.cleanTask("t1", {});
    await client.cleanTask("t1", { force: true });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /tasks/t1/clean",
      "POST /tasks/t1/clean",
    ]);
    expect(calls.map((call) => call.body)).toEqual(["{}", '{"force":true}']);
  });

  it("deletes the task by id, with no body", async () => {
    const { client, calls } = stubClient();
    await client.deleteTask("t 1");
    expect(calls).toEqual([{ method: "DELETE", url: "/tasks/t%201", body: null }]);
  });
});
