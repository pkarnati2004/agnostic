import { createDaemonClient } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { originAllowed } from "./origin.js";
import { createTestDaemon, TEST_TOKEN, type TestDaemon } from "./test-daemon.js";

describe("originAllowed", () => {
  it("allows a request that carries no Origin at all", () => {
    expect(originAllowed(undefined, 7431)).toBe(true);
  });

  it("allows both spellings of the daemon's own loopback origin", () => {
    expect(originAllowed("http://127.0.0.1:7431", 7431)).toBe(true);
    expect(originAllowed("http://localhost:7431", 7431)).toBe(true);
  });

  it("refuses another port, another scheme, another host, and a header that is not an origin", () => {
    for (const origin of [
      "http://127.0.0.1:7432",
      "https://127.0.0.1:7431",
      "http://[::1]:7431",
      "http://evil.example",
      "null",
      "not a url",
      "http://127.0.0.1:7431/path",
    ]) {
      expect(originAllowed(origin, 7431), origin).toBe(false);
    }
  });
});

let daemon: TestDaemon;
// Listening is what fixes the port the daemon calls its own; before that there is none.
let url: string;

beforeEach(async () => {
  daemon = await createTestDaemon();
  url = await daemon.listen();
});

afterEach(() => daemon.close());

describe("the Origin check on every route", () => {
  it("serves a request from the daemon's own origin", async () => {
    const response = await daemon.request("/repos", { headers: { origin: url } });
    expect(response.status).toBe(200);
  });

  it("refuses a foreign origin with 403 before the token is looked at", async () => {
    const response = await daemon.app.request("/repos", {
      headers: { origin: "http://evil.example" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "origin-forbidden", hint: "Open the workspace from the URL `agn ui` prints." },
    });
  });

  it("covers /health, which has no token of its own to refuse with", async () => {
    const foreign = await daemon.app.request("/health", {
      headers: { origin: "http://evil.example" },
    });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ error: { code: "origin-forbidden" } });
    expect((await daemon.app.request("/health")).status).toBe(200);
  });

  it("exempts a GET of the built page, which a foreign navigation can reach", async () => {
    // Not built in this daemon, so the route's own 404 is what reaching the handler looks like.
    for (const path of ["/ui", "/ui/", "/ui/assets/app.js"]) {
      const response = await daemon.app.request(path, {
        headers: { origin: "http://evil.example" },
      });
      expect(response.status, path).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "ui-not-built" } });
    }
  });

  it("exempts a HEAD of the page too, which is the same read with no body", async () => {
    const response = await daemon.app.request("/ui", {
      method: "HEAD",
      headers: { origin: "http://evil.example" },
    });
    expect(response.status).toBe(404);
  });

  it("exempts the page for reads only, and nothing that merely starts with /ui", async () => {
    const posted = await daemon.app.request("/ui", {
      method: "POST",
      headers: { origin: "http://evil.example" },
    });
    expect(posted.status).toBe(403);
    const near = await daemon.app.request("/ui-events", {
      headers: { origin: "http://evil.example" },
    });
    expect(near.status).toBe(403);
  });

  it("streams the event feed to the daemon's own origin", async () => {
    const response = await daemon.request("/events", { headers: { origin: url } });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    const frame = await reader?.read();
    expect(new TextDecoder().decode(frame?.value)).toContain(":");
    await reader?.cancel();
  });

  it("leaves the CLI alone: node's fetch sends no Origin", async () => {
    const client = createDaemonClient({ baseUrl: url, token: TEST_TOKEN });
    await expect(client.listRepos()).resolves.toMatchObject({ repos: [] });
    // A POST is the shape a run takes, and the one a foreign page would most like to send.
    await expect(client.registerRepo({ path: "/nope" })).rejects.toMatchObject({
      code: "path-not-found",
    });
  });
});
