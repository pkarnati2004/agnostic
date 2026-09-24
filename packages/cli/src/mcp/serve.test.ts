import { PassThrough } from "node:stream";
import type {
  DaemonClient,
  ProfilesResponse,
  RecommendResponse,
  Task,
  TaskResponse,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { serveMcp } from "./serve.js";

const PROFILES: ProfilesResponse = { profiles: [], detectedAt: "2026-09-11T10:00:00.000Z" };

const TASK: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "add a --verbose flag",
  profileId: "claude-code:default:native",
  worktreePath: "/w/one",
  branch: "agn/flag",
  status: "running",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
};

type Message = {
  id?: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
};

/** A server over two in-memory pipes: lines written in, the lines that came back out. */
function server(client: Partial<DaemonClient> = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
  const test = createTestContext({ client });
  const done = serveMcp(test.ctx, "1.4.0", { input, output });
  const sendRaw = (line: string) => {
    input.write(`${line}\n`);
  };
  const send = (message: Record<string, unknown>) => sendRaw(JSON.stringify(message));
  const finish = async (): Promise<Message[]> => {
    input.end();
    await done;
    return lines(chunks.join("")).map((line) => JSON.parse(line) as Message);
  };
  return { ...test, send, sendRaw, finish, written: chunks };
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

function request(id: number | string, method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id, method, params };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("serveMcp", () => {
  it("answers the handshake and says nothing to the initialized notification", async () => {
    const mcp = server();
    mcp.send(request(1, "initialize", { protocolVersion: "2099-01-01", capabilities: {} }));
    mcp.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    mcp.send(request(2, "ping"));
    mcp.send(request(3, "tools/list"));
    const messages = await mcp.finish();
    expect(messages.map((message) => message.id)).toEqual([1, 2, 3]);
    expect(messages[0]?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "agn", version: "1.4.0" },
    });
    expect(String(messages[0]?.result?.instructions)).toContain("agn_run");
    expect(messages[1]?.result).toEqual({});
    expect(messages[2]?.result?.tools).toHaveLength(9);
    expect(mcp.out).toEqual([]);
  });

  it("skips a blank line and ignores a response it never asked for", async () => {
    const mcp = server();
    mcp.sendRaw("");
    mcp.sendRaw("   ");
    mcp.send({ jsonrpc: "2.0", id: 9, result: {} });
    expect(await mcp.finish()).toEqual([]);
  });

  it("calls a tool and answers with the daemon's JSON as text", async () => {
    const mcp = server({ profiles: () => Promise.resolve(PROFILES) });
    mcp.send(request("call-1", "tools/call", { name: "agn_profiles", arguments: {} }));
    const [message] = await mcp.finish();
    const content = message?.result?.content as { type: string; text: string }[];
    expect(message?.id).toBe("call-1");
    expect(message?.result?.isError).toBeUndefined();
    expect(content[0]?.type).toBe("text");
    expect(JSON.parse(content[0]?.text ?? "")).toEqual(PROFILES);
  });

  it("answers a failure agn has a code for as an isError result, not a protocol error", async () => {
    const mcp = server({});
    mcp.send(request(1, "tools/call", { name: "agn_stop", arguments: {} }));
    const [message] = await mcp.finish();
    const content = message?.result?.content as { text: string }[];
    expect(message?.result?.isError).toBe(true);
    expect(content[0]?.text).toContain("task-required");
  });

  it("refuses an unknown method, an unknown tool and arguments that do not parse", async () => {
    const mcp = server();
    mcp.send(request(1, "resources/list"));
    mcp.send(request(2, "tools/call", { name: "agn_nope" }));
    mcp.send(request(3, "tools/call", { name: "agn_run", arguments: {} }));
    mcp.send(request(4, "tools/call", {}));
    // A prompt of the wrong type: agn_run's schema wants a string, not a number.
    mcp.send(request(5, "tools/call", { name: "agn_run", arguments: { prompt: 12, repo: "r7k" } }));
    // agn_profiles takes no arguments at all; a strictObject refuses the extra key outright.
    mcp.send(request(6, "tools/call", { name: "agn_profiles", arguments: { verbose: true } }));
    const messages = await mcp.finish();
    const byId = new Map(messages.map((message) => [message.id, message]));
    expect(byId.get(1)?.error?.code).toBe(-32601);
    expect(byId.get(2)?.error).toMatchObject({ code: -32602, message: "unknown tool: agn_nope" });
    expect(byId.get(3)?.error?.code).toBe(-32602);
    expect(String(byId.get(3)?.error?.data)).toContain("prompt");
    expect(byId.get(4)?.error?.code).toBe(-32602);
    expect(byId.get(5)?.error?.code).toBe(-32602);
    expect(byId.get(6)?.error?.code).toBe(-32602);
  });

  it("reports a line that is not JSON, a batch, and a message missing jsonrpc, each at -32600 or -32700", async () => {
    const mcp = server();
    mcp.sendRaw("not json");
    mcp.sendRaw('[{"jsonrpc":"2.0","id":1,"method":"ping"}]');
    mcp.sendRaw('{"id":42,"method":"ping","params":{}}');
    const messages = await mcp.finish();
    expect(messages.map((message) => message.id)).toEqual([null, null, 42]);
    expect(messages.map((message) => message.error?.code)).toEqual([-32700, -32600, -32600]);
  });

  it("keeps a numeric id numeric and a string id a string in the same session", async () => {
    const mcp = server();
    mcp.send(request(42, "ping"));
    mcp.send(request("call-abc", "ping"));
    const messages = await mcp.finish();
    const byId = new Map(messages.map((message) => [String(message.id), message]));
    expect(byId.get("42")?.id).toBe(42);
    expect(typeof byId.get("42")?.id).toBe("number");
    expect(byId.get("call-abc")?.id).toBe("call-abc");
    expect(typeof byId.get("call-abc")?.id).toBe("string");
  });

  it("answers ten concurrent tools/call requests once each, matching every id to its own result", async () => {
    const mcp = server({
      recommend: (body) =>
        new Promise<RecommendResponse>((resolve) => {
          const n = Number(body.prompt.slice(1));
          // Resolved in reverse order of arrival, so a naive queue would answer the wrong id.
          setTimeout(
            () => resolve({ recommendation: { taskClass: { intent: body.prompt } } as never }),
            (10 - n) * 2,
          );
        }),
    });
    for (let n = 1; n <= 10; n += 1) {
      mcp.send(
        request(n, "tools/call", {
          name: "agn_recommend",
          arguments: { prompt: `p${n}`, repo: "r7k2m4pqrs" },
        }),
      );
    }
    const messages = await mcp.finish();
    expect(messages).toHaveLength(10);
    expect(new Set(messages.map((message) => message.id))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    );
    for (const message of messages) {
      const content = message.result?.content as { text: string }[];
      const parsed = JSON.parse(content[0]?.text ?? "") as {
        recommendation: { taskClass: { intent: string } };
      };
      expect(parsed.recommendation.taskClass.intent).toBe(`p${message.id}`);
    }
  });

  it("answers a ping while a tool call is still running, then ends with the call", async () => {
    const started = deferred<void>();
    const answer = deferred<TaskResponse>();
    const mcp = server({
      runTask: () => {
        started.resolve();
        return answer.promise;
      },
    });
    const args = { prompt: "add a flag", repo: "r7k2m4pqrs" };
    mcp.send(request(1, "tools/call", { name: "agn_run", arguments: args }));
    mcp.send(request(2, "ping"));
    await started.promise;
    answer.resolve({ task: TASK });
    const messages = await mcp.finish();
    expect(messages.map((message) => message.id)).toEqual([2, 1]);
  });

  it("writes one line per message, and nothing else, to its output", async () => {
    const mcp = server({ profiles: () => Promise.resolve(PROFILES) });
    mcp.send(request(1, "tools/call", { name: "agn_profiles" }));
    await mcp.finish();
    const text = mcp.written.join("");
    expect(text.endsWith("\n")).toBe(true);
    expect(lines(text)).toHaveLength(1);
  });
});
