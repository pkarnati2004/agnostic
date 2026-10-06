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
  method?: string,
) => {
  status: number;
  body: unknown;
};

async function stubDaemon(handler: Handler): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const { status, body } = handler(req.url ?? "", req.headers, req.method);
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

  it("posts a spec request to the repo it is about", async () => {
    let seen = "";
    const daemon = await stubDaemon((url) => {
      seen = url;
      return {
        status: 200,
        body: {
          title: "Add a flag",
          spec: "add it",
          acceptance: null,
          profileId: "claude-code:haiku:native",
          model: "haiku",
        },
      };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    const response = await client.writeSpec("repo a", { prompt: "add a flag" });
    expect(seen).toBe("/repos/repo%20a/spec");
    expect(response.profileId).toBe("claude-code:haiku:native");
    await daemon.close();
  });

  it("turns the daemon's 409 into an ApiError carrying its code and hint", async () => {
    const daemon = await stubDaemon(() => ({
      status: 409,
      body: {
        error: {
          code: "spec-writer-unavailable",
          message: "no subscription-billed agent can write specs on this machine",
          hint: "Write the spec yourself in the dialog.",
        },
      },
    }));
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    await expect(client.writeSpec("repoaaaaaa", { prompt: "go" })).rejects.toMatchObject({
      code: "spec-writer-unavailable",
      status: 409,
      hint: "Write the spec yourself in the dialog.",
    });
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

  it("asks for every repo only when the caller says so, and posts close and open by id", async () => {
    const seen: string[] = [];
    const daemon = await stubDaemon((url) => {
      seen.push(url);
      return { status: 200, body: { repos: [], cursor: 0 } };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    await client.listRepos();
    await client.listRepos({ all: false });
    await client.listRepos({ all: true });
    await client.closeRepo("r7k2m4pqrs");
    await client.openRepo("r7k2m4pqrs");
    expect(seen).toEqual([
      "/repos",
      "/repos",
      "/repos?all=1",
      "/repos/r7k2m4pqrs/close",
      "/repos/r7k2m4pqrs/open",
    ]);
    await daemon.close();
  });

  it("sends removeRepo as a DELETE to the repo's own url", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const daemon = await stubDaemon((url, _headers, method) => {
      seenUrl = url;
      seenMethod = method ?? "";
      return { status: 200, body: { repo: { id: "r7k2m4pqrs" }, worktreesRemoved: 2 } };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    expect(await client.removeRepo("r7k2m4pqrs")).toEqual({
      repo: { id: "r7k2m4pqrs" },
      worktreesRemoved: 2,
    });
    expect(seenUrl).toBe("/repos/r7k2m4pqrs");
    expect(seenMethod).toBe("DELETE");
    await daemon.close();
  });

  it("sends deleteTask as a DELETE to the task's own url", async () => {
    let seenUrl = "";
    let seenMethod = "";
    const daemon = await stubDaemon((url, _headers, method) => {
      seenUrl = url;
      seenMethod = method ?? "";
      return {
        status: 200,
        body: { deleted: true, taskId: "t3n9v2wxyz", branch: "agn/flag", removedWorktree: true },
      };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    expect(await client.deleteTask("t3n9v2wxyz")).toEqual({
      deleted: true,
      taskId: "t3n9v2wxyz",
      branch: "agn/flag",
      removedWorktree: true,
    });
    expect(seenUrl).toBe("/tasks/t3n9v2wxyz");
    expect(seenMethod).toBe("DELETE");
    await daemon.close();
  });

  it("builds the open url with and without an editor override", async () => {
    const seen: string[] = [];
    const daemon = await stubDaemon((url) => {
      seen.push(url);
      return { status: 200, body: {} };
    });
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    await client.openInfo("t3n9v2wxyz");
    await client.openInfo("t3n9v2wxyz", "cursor");
    expect(seen).toEqual(["/tasks/t3n9v2wxyz/open", "/tasks/t3n9v2wxyz/open?editor=cursor"]);
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
