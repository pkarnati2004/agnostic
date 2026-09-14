import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDaemonClient } from "./daemon-client.js";
import { DaemonApiError } from "./error.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-client-"));
});

afterEach(() => rm(home, { recursive: true, force: true }));

type Handler = (
  url: string,
  headers: Record<string, string | string[] | undefined>,
) => {
  status: number;
  body: unknown;
};

async function stubDaemon(handler: Handler): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const { status, body } = handler(req.url ?? "", req.headers);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

describe("createDaemonClient", () => {
  it("sends the bearer token on every call", async () => {
    let seen = "";
    const daemon = await stubDaemon((_url, headers) => {
      seen = String(headers.authorization);
      return { status: 200, body: { repos: [] } };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    expect(await client.listRepos()).toEqual({ repos: [] });
    expect(seen).toBe("Bearer sekrit");
    await daemon.close();
  });

  it("asks for usage without a window, and for one task by id", async () => {
    const seen: string[] = [];
    const daemon = await stubDaemon((url) => {
      seen.push(url);
      return { status: 200, body: {} };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    await client.usage();
    await client.taskUsage("t3n9v2wxyz");
    expect(seen).toEqual(["/usage", "/tasks/t3n9v2wxyz/usage"]);
    await daemon.close();
  });

  it("puts the status filter in the query string", async () => {
    let seen = "";
    const daemon = await stubDaemon((url) => {
      seen = url;
      return { status: 200, body: { tasks: [] } };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    await client.listTasks("abcdefghjk", { status: ["running", "waiting"] });
    expect(seen).toBe("/repos/abcdefghjk/tasks?status=running,waiting");
    await daemon.close();
  });

  it("turns an error body into a DaemonApiError with the status", async () => {
    const daemon = await stubDaemon(() => ({
      status: 404,
      body: { error: { code: "task-not-found", message: "no task", hint: "Run agn status." } },
    }));
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    const error = await client.getTask("qqqqqqqqqq").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DaemonApiError);
    expect(error).toMatchObject({
      code: "task-not-found",
      message: "no task",
      hint: "Run agn status.",
      status: 404,
    });
    await daemon.close();
  });

  it("turns a refused connection into daemon-unreachable", async () => {
    const daemon = await stubDaemon(() => ({ status: 200, body: {} }));
    await daemon.close();
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    const error = await client.health().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DaemonApiError);
    expect((error as DaemonApiError).code).toBe("daemon-unreachable");
    expect((error as DaemonApiError).status).toBeNull();
    expect((error as DaemonApiError).hint).toContain("agn daemon start");
  });

  it("reports a non-2xx whose body is not ours", async () => {
    const daemon = await stubDaemon(() => ({ status: 502, body: "<html>gateway</html>" }));
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    const error = await client.profiles().catch((cause: unknown) => cause);
    expect((error as DaemonApiError).code).toBe("daemon-response-invalid");
    expect((error as DaemonApiError).status).toBe(502);
    await daemon.close();
  });
});
