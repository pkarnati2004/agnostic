import type { HealthResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon();
});

afterEach(() => daemon.close());

describe("GET /health", () => {
  it("reports the pid, the bound port, when it started and its version", async () => {
    const response = await daemon.app.request("/health");
    expect(response.status).toBe(200);
    const health = (await response.json()) as HealthResponse;
    expect(health.pid).toBe(process.pid);
    expect(health.version).toBe("0.0.0-test");
    expect(Date.parse(health.startedAt)).not.toBeNaN();
  });

  it("reports the port the server actually bound", async () => {
    const baseUrl = await daemon.listen();
    const health = (await (await fetch(`${baseUrl}/health`)).json()) as HealthResponse;
    expect(baseUrl).toContain(String(health.port));
  });
});
