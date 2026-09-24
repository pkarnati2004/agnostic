import { PassThrough } from "node:stream";
import type { TaskResponse } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import type { CliContext } from "../context.js";
import { TASK } from "../mcp/tools-fixture.js";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { mcpCommand } from "./mcp.js";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The command writes protocol lines straight to stdout; a test reads them here instead. */
function captureStdout(): { written: string[]; restore(): void } {
  const written: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  return { written, restore: () => spy.mockRestore() };
}

describe("agn mcp", () => {
  it("answers the messages on stdin and ends when stdin does", async () => {
    const test = createTestContext({
      stdin: ['{"jsonrpc":"2.0","id":1,"method":"ping"}'],
    });
    const stdout = captureStdout();
    try {
      await mcpCommand(test.ctx, "9.9.9").parseAsync([], { from: "user" });
    } finally {
      stdout.restore();
    }
    expect(stdout.written).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}\n']);
    expect(test.out).toEqual([]);
  });

  it("answers a line that is valid JSON but not a JSON-RPC message with -32600", async () => {
    const test = createTestContext({ stdin: ['{"id":1,"method":"ping"}'] });
    const stdout = captureStdout();
    try {
      await mcpCommand(test.ctx, "9.9.9").parseAsync([], { from: "user" });
    } finally {
      stdout.restore();
    }
    expect(JSON.parse(stdout.written.join(""))).toMatchObject({
      id: 1,
      error: { code: -32600 },
    });
  });

  it("reads process.stdin through ctx.stdin and closes after a pending call answers", async () => {
    const started = deferred<void>();
    const answer = deferred<TaskResponse>();
    const test = createTestContext({
      client: {
        stopTask: () => {
          started.resolve();
          return answer.promise;
        },
      },
    });
    const stdin = new PassThrough();
    test.ctx.stdin = stdin as CliContext["stdin"];
    const stdout = captureStdout();
    const done = mcpCommand(test.ctx, "9.9.9").parseAsync([], { from: "user" });
    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "agn_stop", arguments: { task: TASK.id } },
      })}\n`,
    );
    await started.promise;
    stdin.end();
    answer.resolve({ task: TASK });
    try {
      await done;
    } finally {
      stdout.restore();
    }
    expect(stdout.written).toHaveLength(1);
    expect(JSON.parse(stdout.written[0] ?? "")).toMatchObject({ id: 1 });
  });

  it("is registered on the program, with its own help", async () => {
    const test = createTestContext();
    expect(await runMain(["node", "agn", "--help"], test.ctx)).toBe(0);
    expect(test.out.join("\n")).toContain("mcp");
    const help = createTestContext();
    expect(await runMain(["node", "agn", "mcp", "--help"], help.ctx)).toBe(0);
    expect(help.out.join("\n")).toContain("over MCP on stdin and stdout");
  });
});
