// serveMcp against a real HTTP daemon on loopback (never the default port), proving the auth
// token that connect() reads off disk never lands in a protocol line, on success or on failure.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import {
  type AgnosticPaths,
  agnosticPaths,
  type ProfilesResponse,
  type spawn,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliContext } from "../context.js";
import { createContext } from "../context.js";
import type { DaemonEntry } from "../daemon-entry.js";
import { serveMcp } from "./serve.js";

const TOKEN = "sekrit-mcp-token-42";

let home: string;
let paths: AgnosticPaths;
let server: Server;
let baseHeaders: IncomingHttpHeaders = {};

async function fakeDaemon(profiles: ProfilesResponse, taskStatus: number): Promise<number> {
  server = createServer((req, res) => {
    baseHeaders = req.headers;
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          pid: process.pid,
          port: address(server),
          startedAt: new Date().toISOString(),
          version: "0.0.0",
          home: paths.home,
        }),
      );
      return;
    }
    if (req.url === "/profiles") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(profiles));
      return;
    }
    // Any /tasks/*/stop call: answer the failure the "unknown task" case asks for.
    res.writeHead(taskStatus, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "task-not-found",
          message: "no task matches nope",
          hint: "Run `agn status --all`.",
        },
      }),
    );
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return address(server);
}

function address(target: Server): number {
  const info = target.address();
  return typeof info === "object" && info !== null ? info.port : 0;
}

const refuseToSpawn = (() => {
  throw new Error("no spawn expected");
}) as typeof spawn;

async function context(port: number): Promise<CliContext> {
  await writeFile(
    paths.daemon,
    JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }),
  );
  await writeFile(paths.authToken, `${TOKEN}\n`);
  const entry: DaemonEntry = { argv: [process.execPath, "/dev/null"] };
  return createContext({
    paths,
    cwd: home,
    env: {},
    io: { out: () => undefined, err: () => undefined },
    entry,
    stdin: Readable.from([]) as CliContext["stdin"],
    spawn: refuseToSpawn,
  });
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-mcp-token-"));
  paths = agnosticPaths(home);
});

afterEach(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(home, { recursive: true, force: true });
});

describe("serveMcp against a real daemon, on a random loopback port", () => {
  it("never puts the auth token in a successful tool result", async () => {
    const profiles: ProfilesResponse = { profiles: [], detectedAt: "2026-09-11T10:00:00.000Z" };
    const port = await fakeDaemon(profiles, 404);
    const ctx = await context(port);
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
    const done = serveMcp(ctx, "1.0.0", { input, output });
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "agn_profiles", arguments: {} },
      })}\n`,
    );
    input.end();
    await done;
    const text = chunks.join("");
    expect(text).not.toContain(TOKEN);
    for (const line of text.split("\n").filter((line) => line !== "")) {
      expect(line).not.toContain(TOKEN);
    }
    expect(baseHeaders.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("never puts the auth token in an isError result either", async () => {
    const port = await fakeDaemon({ profiles: [], detectedAt: "now" }, 404);
    const ctx = await context(port);
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk.toString("utf8")));
    const done = serveMcp(ctx, "1.0.0", { input, output });
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "agn_stop", arguments: { task: "nope" } },
      })}\n`,
    );
    input.end();
    await done;
    const text = chunks.join("");
    expect(text).not.toContain(TOKEN);
    expect(text).toContain("task-not-found");
    expect(text).toContain('"isError":true');
  });
});
