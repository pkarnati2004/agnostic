import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiErrorBody } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

const PAGE = '<!doctype html><html><body><div id="root"></div></body></html>';
const ASSET = 'console.log("workspace");\n';

let dist: string;
let daemon: TestDaemon;

/** A stand-in for a Vite build: the page and one hashed asset, which is all the route reads. */
async function fixtureDist(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agn-ui-dist-"));
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "index.html"), PAGE, "utf8");
  await writeFile(join(dir, "assets", "app-abc123.js"), ASSET, "utf8");
  await writeFile(join(dir, "assets", "xterm-def456.js"), ASSET, "utf8");
  return dir;
}

beforeEach(async () => {
  dist = await fixtureDist();
  daemon = await createTestDaemon({ uiDist: dist });
});

afterEach(async () => {
  await daemon.close();
  await rm(dist, { recursive: true, force: true });
});

/** A request line no URL parser has touched, which is how a traversal survives to the daemon. */
function rawRequestStatus(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let received = "";
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString("utf8");
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(Number(received.split(" ")[1])));
  });
}

describe("GET /ui", () => {
  it("serves the page without a token, at /ui and /ui/", async () => {
    for (const path of ["/ui", "/ui/"]) {
      const response = await daemon.app.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toContain('<div id="root">');
    }
  });

  it("serves a hashed asset as immutable javascript", async () => {
    const response = await daemon.app.request("/ui/assets/app-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await response.text()).toBe(ASSET);
  });

  it("serves every hashed chunk the build split out the same way", async () => {
    const response = await daemon.app.request("/ui/assets/xterm-def456.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("answers HEAD with the headers and no body", async () => {
    const response = await daemon.app.request("/ui", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe("");
  });

  it("is 404 for a file the build does not hold", async () => {
    const response = await daemon.app.request("/ui/assets/nope.js");
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("not-found");
  });

  it("serves nothing outside the build, however the climb is spelled", async () => {
    // The server builds a URL from the request line, and that collapses `..` before routing: a
    // raw `/ui/../package.json` lands on `/package.json`, where the bearer check refuses it. An
    // encoded separator survives, and `resolveUiFile` keeps it inside the build, where it misses.
    const url = new URL(await daemon.listen());
    expect(await rawRequestStatus(Number(url.port), "/ui/../package.json")).toBe(401);
    expect((await daemon.app.request("/ui/..%2fpackage.json")).status).toBe(404);
  });

  it("is 404 for a directory, so nothing lists the build", async () => {
    const response = await daemon.app.request("/ui/assets");
    expect(response.status).toBe(404);
  });

  it("serves nothing through a symlink that leaves the build", async () => {
    // `pnpm build` writes no symlinks, so one pointing out of dist is not part of the build:
    // resolveUiFile compares real paths, not path strings.
    const outside = await mkdtemp(join(tmpdir(), "agn-ui-outside-"));
    await writeFile(join(outside, "secret.txt"), "outside the build", "utf8");
    await symlink(join(outside, "secret.txt"), join(dist, "assets", "escape.js"));
    try {
      const response = await daemon.app.request("/ui/assets/escape.js");
      expect(response.status).toBe(404);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("serves a symlink that stays inside the build", async () => {
    await symlink(join(dist, "assets", "app-abc123.js"), join(dist, "assets", "alias.js"));
    const response = await daemon.app.request("/ui/assets/alias.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(ASSET);
  });

  it("answers no method but GET and HEAD", async () => {
    // With a token, so what refuses the write is the router and not the /ui read exemption.
    const response = await daemon.request("/ui", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("ignores the Origin header: the page is public, its API is not (ADR 026)", async () => {
    // The Origin middleware exempts the same reads through `isUiRead`; see origin.test.ts.
    const response = await daemon.app.request("/ui", {
      headers: { origin: "http://evil.test" },
    });
    expect(response.status).toBe(200);
  });

  it("logs the request without a token anywhere in the line", async () => {
    await daemon.app.request("/ui");
    const log = await daemon.readLog();
    expect(log).toContain("http GET /ui");
    expect(log).not.toContain("token");
  });
});

describe("GET /ui when the workspace has not been built", () => {
  it("says so, with the command that builds it", async () => {
    const unbuilt = await createTestDaemon();
    try {
      const response = await unbuilt.app.request("/ui");
      expect(response.status).toBe(404);
      const body = (await response.json()) as ApiErrorBody;
      expect(body.error.code).toBe("ui-not-built");
      expect(body.error.message).toBe("the workspace is not built");
      expect(body.error.hint).toBe("Run pnpm build.");
    } finally {
      await unbuilt.close();
    }
  });

  it("says the same when the directory exists but holds no page", async () => {
    const empty = await mkdtemp(join(tmpdir(), "agn-ui-empty-"));
    const partial = await createTestDaemon({ uiDist: empty });
    try {
      const body = (await (await partial.app.request("/ui")).json()) as ApiErrorBody;
      expect(body.error.code).toBe("ui-not-built");
    } finally {
      await partial.close();
      await rm(empty, { recursive: true, force: true });
    }
  });
});
