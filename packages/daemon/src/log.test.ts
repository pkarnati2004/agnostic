import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger, type Logger } from "./log.js";
import { createTestDaemon, TEST_TOKEN, type TestDaemon } from "./test-daemon.js";

let home: string;
let log: Logger;
let file: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-log-"));
  file = join(home, "logs", "agnd.log");
  log = createLogger(file);
});

afterEach(async () => {
  log.close();
  await rm(home, { recursive: true, force: true });
});

async function settled(): Promise<string> {
  await new Promise((done) => setTimeout(done, 20));
  return readFile(file, "utf8");
}

describe("createLogger", () => {
  it("writes one line with a timestamp, a level, a message and its fields", async () => {
    log.info("daemon listening", { port: 7431 });
    const [line] = (await settled()).split("\n");
    expect(line).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z INFO daemon listening port=7431$/);
  });

  it("keeps a field with spaces on one line", async () => {
    log.warn("detection failed", { message: "PATH is empty" });
    expect(await settled()).toContain('message="PATH is empty"');
  });

  it("records a process run without its output", async () => {
    await run("echo", ["a secret the log must not hold"]);
    const text = await settled();
    expect(text).toMatch(/INFO process echo args=1 exit=0 ms=\d+/);
    expect(text).not.toContain("secret");
  });

  it("records a failed process with its exit code", async () => {
    await run("false").catch(() => undefined);
    expect(await settled()).toMatch(/INFO process false args=0 exit=1 ms=\d+/);
  });
});

describe("request logging", () => {
  let daemon: TestDaemon;

  beforeEach(async () => {
    daemon = await createTestDaemon();
  });

  afterEach(() => daemon.close());

  it("writes one http line per request with method, path, status and duration", async () => {
    await daemon.request("/repos");
    await daemon.request("/tasks/qqqqqqqqqq");
    await new Promise((done) => setTimeout(done, 20));
    const lines = (await daemon.readLog()).split("\n").filter((line) => line.includes(" http "));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/INFO http GET \/repos status=200 ms=\d+/);
    expect(lines[1]).toMatch(/INFO http GET \/tasks\/qqqqqqqqqq status=404 ms=\d+/);
  });

  it("never writes the token or a request body", async () => {
    await daemon.request("/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/tmp/nowhere-at-all" }),
    });
    await new Promise((done) => setTimeout(done, 20));
    const text = await daemon.readLog();
    expect(text).not.toContain(TEST_TOKEN);
    expect(text).not.toContain("nowhere-at-all");
    expect(text).not.toContain("body");
  });
});
