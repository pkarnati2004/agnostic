// The compare half of the client: reading a compare's siblings and keeping one of them.
import { describe, expect, it } from "vitest";
import { createClient } from "./client";
import { ApiError } from "./error";

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

describe("the compare calls", () => {
  it("reads one compare and posts the sibling a pick keeps", async () => {
    const { client, calls } = stubClient(() => Response.json({}, { status: 200 }));
    await client.compare("cmp 1");
    await client.pickCompare("cmp1", { taskId: "t1" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /compares/cmp%201",
      "POST /compares/cmp1/pick",
    ]);
    expect(calls.at(-1)?.body).toBe(JSON.stringify({ taskId: "t1" }));
    expect(calls.every((call) => call.token === "Bearer tok")).toBe(true);
  });

  it("carries the daemon's refusal of a pick through unchanged", async () => {
    const { client } = stubClient(() =>
      Response.json(
        {
          error: {
            code: "compare-not-found",
            message: 'no compare matches "cmp9"',
            hint: "Run `agn compare show <id>`.",
          },
        },
        { status: 404 },
      ),
    );
    const failure = await client
      .pickCompare("cmp9", { taskId: "t1" })
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "compare-not-found", status: 404 });
  });
});
