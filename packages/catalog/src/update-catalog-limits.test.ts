import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogSource } from "./catalog-source.js";
import { CatalogError } from "./error.js";
import { updateCatalog } from "./update-catalog.js";

const KB = 1024;
const ON_DISK = '{"already":"here"}';

type Served = { url: string; close(): Promise<void> };
type Route = (res: ServerResponse) => void;

let home: string;
let downloaded: string;
let served: Served | null;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-catalog-size-"));
  downloaded = join(home, "catalog.json");
  await writeFile(downloaded, ON_DISK, "utf8");
  served = null;
});

afterEach(async () => {
  await served?.close();
  await rm(home, { recursive: true, force: true });
});

/** A real loopback server: these cases are about bytes on the wire, not about what the JSON says. */
async function serve(routes: Record<string, Route>): Promise<string> {
  const server = createServer((req, res) => {
    res.on("error", () => undefined);
    const route = routes[req.url ?? ""];
    if (route === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    route(res);
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  served = { url, close: () => new Promise<void>((done) => server.close(() => done())) };
  return url;
}

/** Node sends this chunked: with no content-length, the cap can only be enforced as it arrives. */
function flood(res: ServerResponse, chunk: string, times: number): void {
  res.writeHead(200, { "content-type": "application/json" });
  let sent = 0;
  const push = (): void => {
    while (sent < times && !res.destroyed) {
      sent += 1;
      if (!res.write(chunk)) {
        res.once("drain", push);
        return;
      }
    }
    if (!res.destroyed) {
      res.end();
    }
  };
  push();
}

function whole(body: string): Route {
  return (res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  };
}

function manifestFor(body: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    version: 2,
    generatedAt: "2026-09-08T00:00:00Z",
    sha256: createHash("sha256").update(body).digest("hex"),
  });
}

async function refused(url: string): Promise<CatalogError> {
  const caught = await updateCatalog({
    source: catalogSource({ AGNOSTIC_CATALOG_URL: url }),
    localVersion: 1,
    downloaded,
  }).catch((cause: unknown) => cause);
  expect(caught).toBeInstanceOf(CatalogError);
  return caught as CatalogError;
}

describe("updateCatalog reads no more than it agreed to", () => {
  it("refuses a manifest whose declared length is over the cap, without reading the body", async () => {
    const url = await serve({ "/manifest.json": whole("x".repeat(100 * KB)) });
    const error = await refused(url);
    expect(error.code).toBe("catalog-fetch-failed");
    expect(error.message).toContain("larger than 64 KB");
    expect(error.hint).toContain("64 KB");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });

  it("cuts off a manifest that arrives without a length and keeps coming", async () => {
    const url = await serve({
      "/manifest.json": (res) => flood(res, "x".repeat(16 * KB), 16),
    });
    const error = await refused(url);
    expect(error.code).toBe("catalog-fetch-failed");
    expect(error.message).toContain("manifest.json");
    expect(error.message).toContain("larger than 64 KB");
  });

  it("cuts off a catalog that keeps coming, and leaves the one on disk in use", async () => {
    const url = await serve({
      "/manifest.json": whole(manifestFor("whatever this hashes to")),
      "/catalog.json": (res) => flood(res, "x".repeat(512 * KB), 17),
    });
    const error = await refused(url);
    expect(error.code).toBe("catalog-fetch-failed");
    expect(error.message).toContain("catalog.json");
    expect(error.message).toContain("larger than 8 MB");
    expect(await readFile(downloaded, "utf8")).toBe(ON_DISK);
  });
});
