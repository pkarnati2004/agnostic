import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGN_TASK_ID, hookCommand, hookScriptPath, writeHookScript } from "./hook-script.js";

type Received = { url: string; authorization: string; taskId: string; body: string };

let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-hook-script-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

/** One request, then nothing: the script is the only client this server ever has. */
function listen(received: Received[]): Promise<{ server: Server; port: number }> {
  const server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      received.push({
        url: req.url ?? "",
        authorization: req.headers.authorization ?? "",
        taskId: String(req.headers["x-agn-task-id"] ?? ""),
        body,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      ready({ server, port: typeof address === "object" && address !== null ? address.port : 0 });
    });
  });
}

async function fire(payload: string, taskId: string): Promise<number> {
  const paths = agnosticPaths(home);
  const result = await run("sh", [hookScriptPath(paths), "claude-code"], {
    input: payload,
    env: { [AGN_TASK_ID]: taskId, PATH: "/usr/bin:/bin" },
    inheritEnv: false,
    timeoutMs: 10_000,
  });
  return result.exitCode;
}

describe("the hook script", () => {
  it("is executable, and is rewritten only when its text changes", async () => {
    const paths = agnosticPaths(home);
    await writeHookScript(paths);
    const file = hookScriptPath(paths);
    expect((await stat(file)).mode & 0o777).toBe(0o755);
    const first = (await stat(file)).mtimeMs;
    await writeHookScript(paths);
    expect((await stat(file)).mtimeMs).toBe(first);
  });

  it("names itself and the harness in the command a config carries, and nothing else", async () => {
    const paths = agnosticPaths(home);
    const command = hookCommand(paths, "claude-code");
    expect(command).toBe(`sh '${hookScriptPath(paths)}' claude-code`);
  });

  it("posts the payload verbatim with the bearer token and the task id", async () => {
    const paths = agnosticPaths(home);
    const received: Received[] = [];
    const { server, port } = await listen(received);
    try {
      await writeHookScript(paths);
      await writeFile(paths.daemon, JSON.stringify({ pid: 1, port }), "utf8");
      await writeFile(paths.authToken, "s3cret\n", "utf8");
      const payload = '{"hook_event_name":"Stop","cwd":"/tmp/it\\"s here"}';
      expect(await fire(payload, "task-1")).toBe(0);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        url: "/hooks/claude-code",
        authorization: "Bearer s3cret",
        taskId: "task-1",
        body: payload,
      });
    } finally {
      server.close();
    }
  });

  it("exits 0 and sends nothing when the daemon is not running", async () => {
    await writeHookScript(agnosticPaths(home));
    const started = Date.now();
    expect(await fire('{"hook_event_name":"Stop"}', "")).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("exits 0 within about a second when the daemon named in daemon.json is not listening", async () => {
    const paths = agnosticPaths(home);
    await writeHookScript(paths);
    // A closed port, not a missing config: daemon.json and the token are both there, so the script
    // gets as far as curl, and the connect timeout is what has to save it from hanging.
    const { server, port } = await listen([]);
    await new Promise<void>((done) => server.close(() => done()));
    await writeFile(paths.daemon, JSON.stringify({ pid: 1, port }), "utf8");
    await writeFile(paths.authToken, "s3cret\n", "utf8");
    const started = Date.now();
    expect(await fire('{"hook_event_name":"Stop"}', "task-1")).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it("exits 0 on an empty payload", async () => {
    await writeHookScript(agnosticPaths(home));
    expect(await fire("", "")).toBe(0);
  });
});
