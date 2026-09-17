// The repo half of the client: registering one, and the close/open pair behind the sidebar.
import { describe, expect, it } from "vitest";
import { createClient } from "./client";
import type { ApiError } from "./error";

type Call = { method: string; url: string; token: string | undefined; body: string | null };

function stubClient(answer: (call: Call) => Response) {
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
  return Response.json(body, { status: 200 });
}

const REPO = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git" as const,
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active" as const,
};

describe("the repo calls", () => {
  it("registers a repo and reads both answers the daemon gives", async () => {
    // 201 for a repo the daemon inserted, 200 for one it already had or only moved (ADR 032).
    const { client, calls } = stubClient((call) => {
      const created = call.body?.includes("petal") === true;
      return Response.json({ repo: REPO, created }, { status: created ? 201 : 200 });
    });
    const created = await client.registerRepo({ path: "/Users/dev/petal", gitInit: false });
    expect(created).toEqual({ repo: REPO, created: true });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "/repos",
      token: "Bearer tok",
      body: JSON.stringify({ path: "/Users/dev/petal", gitInit: false }),
    });

    const known = await client.registerRepo({ path: "/Users/dev/katha", gitInit: false });
    expect(known.created).toBe(false);
  });

  it("closes a repo and opens it again by id", async () => {
    const { client, calls } = stubClient(() => ok({ repo: REPO }));
    await client.closeRepo("r 1");
    await client.openRepo("r1");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /repos/r%201/close",
      "POST /repos/r1/open",
    ]);
  });

  it("passes on a refusal to close a repo with a task still running", async () => {
    const { client } = stubClient(() =>
      Response.json(
        {
          error: {
            code: "repo-busy",
            message: "repo petal has a task that is still running",
            hint: "Run `agn stop t1` first.",
          },
        },
        { status: 409 },
      ),
    );
    const failure = await client.closeRepo("r1").catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "repo-busy", status: 409 });
    expect((failure as ApiError).hint).toBe("Run `agn stop t1` first.");
  });
});
