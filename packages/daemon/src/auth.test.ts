import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAuthToken, isUiPath } from "./auth.js";
import { createLogger, type Logger } from "./log.js";
import { createTestDaemon, TEST_TOKEN, type TestDaemon } from "./test-daemon.js";

describe("ensureAuthToken", () => {
  let home: string;
  let log: Logger;
  const warnings: string[] = [];

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-auth-"));
    log = createLogger(join(home, "logs", "agnd.log"));
    warnings.length = 0;
  });

  afterEach(async () => {
    log.close();
    await rm(home, { recursive: true, force: true });
  });

  it("creates a 64-hex token readable only by its owner", async () => {
    const paths = agnosticPaths(home);
    const token = await ensureAuthToken(paths, log);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect((await stat(paths.authToken)).mode & 0o777).toBe(0o600);
    expect((await readFile(paths.authToken, "utf8")).trim()).toBe(token);
  });

  it("returns the same token on a second call", async () => {
    const paths = agnosticPaths(home);
    expect(await ensureAuthToken(paths, log)).toBe(await ensureAuthToken(paths, log));
  });

  it("warns when an existing token is readable by other users", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.authToken, "deadbeef\n", { mode: 0o644 });
    const warned: string[] = [];
    await ensureAuthToken(paths, { ...log, warn: (msg) => warned.push(msg) });
    expect(warned).toEqual(["auth token is readable by other users"]);
  });
});

describe("bearerAuth", () => {
  let daemon: TestDaemon;

  beforeEach(async () => {
    daemon = await createTestDaemon();
  });

  afterEach(() => daemon.close());

  it("refuses a request with no Authorization header", async () => {
    const response = await daemon.app.request("/repos");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("refuses a wrong token", async () => {
    const response = await daemon.app.request("/repos", {
      headers: { authorization: `Bearer ${TEST_TOKEN}x` },
    });
    expect(response.status).toBe(401);
  });

  it("accepts the right token", async () => {
    expect((await daemon.request("/repos")).status).toBe(200);
  });

  it("lets /health through without a token", async () => {
    const response = await daemon.app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pid: process.pid,
      port: 0,
      version: "0.0.0-test",
    });
  });

  it("lets the workspace page through without a token", async () => {
    // Not built in this daemon, so the answer is the route's own 404 rather than a 401.
    const response = await daemon.app.request("/ui");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "ui-not-built" } });
  });
});

describe("isUiPath", () => {
  it("is the page and everything under it", () => {
    expect(isUiPath("/ui")).toBe(true);
    expect(isUiPath("/ui/")).toBe(true);
    expect(isUiPath("/ui/assets/a.js")).toBe(true);
  });

  it("is nothing else, however the path starts", () => {
    for (const path of ["/uix", "/ui-events", "/health", "/repos", "/", "/tasks/ui"]) {
      expect(isUiPath(path)).toBe(false);
    }
  });
});
