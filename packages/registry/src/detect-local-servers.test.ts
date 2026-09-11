import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { detectLocalServers } from "./detect-local-servers.js";

type Responder = (url: string) => { status: number; body: string } | "never";

const running: Server[] = [];

/** A stand-in for LM Studio on loopback; the real ports are never touched by a test. */
async function serve(responder: Responder): Promise<number> {
  const server = createServer((request, response) => {
    const answer = responder(request.url ?? "");
    if (answer === "never") {
      return;
    }
    response.writeHead(answer.status, { "content-type": "application/json" });
    response.end(answer.body);
  });
  running.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the fixture server did not take a port");
  }
  return address.port;
}

async function closedPort(): Promise<number> {
  const port = await serve(() => ({ status: 200, body: "{}" }));
  await new Promise<void>((resolve) => running.pop()?.close(() => resolve()));
  return port;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => new Promise((done) => server.close(done))));
});

describe("detectLocalServers", () => {
  it("lists what a running server holds", async () => {
    const port = await serve((url) =>
      url === "/v1/models"
        ? { status: 200, body: JSON.stringify({ data: [{ id: "qwen3:8b" }] }) }
        : { status: 404, body: "{}" },
    );
    expect(await detectLocalServers({ ports: [{ name: "lmstudio", port }] })).toEqual([
      {
        name: "lmstudio",
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        models: ["qwen3:8b"],
      },
    ]);
  });

  it("returns a running server with nothing loaded", async () => {
    const port = await serve(() => ({ status: 200, body: JSON.stringify({ data: [] }) }));
    const servers = await detectLocalServers({ ports: [{ name: "ollama", port }] });
    expect(servers).toHaveLength(1);
    expect(servers[0]?.models).toEqual([]);
  });

  it("treats a closed port, an error and nonsense as nobody being there", async () => {
    expect(
      await detectLocalServers({ ports: [{ name: "lmstudio", port: await closedPort() }] }),
    ).toEqual([]);
    const failing = await serve(() => ({ status: 500, body: "sorry" }));
    expect(await detectLocalServers({ ports: [{ name: "lmstudio", port: failing }] })).toEqual([]);
    const nonsense = await serve(() => ({ status: 200, body: "not json" }));
    expect(await detectLocalServers({ ports: [{ name: "ollama", port: nonsense }] })).toEqual([]);
  });

  it("gives up on a server that never answers", async () => {
    const port = await serve(() => "never");
    const started = Date.now();
    expect(await detectLocalServers({ ports: [{ name: "ollama", port }], timeoutMs: 200 })).toEqual(
      [],
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
