import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProcessError } from "./error.js";
import { type ProcessLogEntry, run, scrubEnv, setProcessLog, spawn } from "./process.js";

beforeAll(() => {
  process.env.npm_config_probe = "1";
});

describe("scrubEnv", () => {
  it("drops undefined values and npm_ pollution", () => {
    const scrubbed = scrubEnv({ HOME: "/Users/dev", npm_config_probe: "1", EMPTY: undefined });
    expect(scrubbed).toEqual({ HOME: "/Users/dev" });
  });
});

describe("run", () => {
  it("resolves with stdout, an exit code and a duration", async () => {
    const result = await run("echo", ["hi"]);
    expect(result.stdout).toBe("hi");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes stdin through", async () => {
    const result = await run("cat", [], { input: "from stdin" });
    expect(result.stdout).toBe("from stdin");
  });

  it("rejects with ProcessError on a non-zero exit", async () => {
    const error = await run("false").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ProcessError);
    expect((error as ProcessError).exitCode).toBe(1);
    expect((error as ProcessError).command).toBe("false");
  });

  it("rejects with ProcessError and a hint when the binary is missing", async () => {
    const error = await run("definitely-not-a-binary").catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ProcessError);
    expect((error as ProcessError).code).toBe("process-not-found");
    expect((error as ProcessError).hint).toContain("definitely-not-a-binary");
  });

  it("keeps the tail of stderr in the message", async () => {
    const error = await run("sh", ["-c", "echo boom >&2; exit 3"]).catch(
      (thrown: unknown) => thrown,
    );
    expect((error as ProcessError).stderr).toBe("boom");
    expect((error as ProcessError).message).toContain("boom");
    expect((error as ProcessError).exitCode).toBe(3);
  });

  it("hides npm_ variables from the child", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this is shell syntax for the child.
    const result = await run("sh", ["-c", "echo ${npm_config_probe:-unset}"]);
    expect(result.stdout).toBe("unset");
  });

  it("passes opts.env to the child", async () => {
    const result = await run("sh", ["-c", "echo $PROBE"], { env: { PROBE: "1" } });
    expect(result.stdout).toBe("1");
  });

  it("gives the child an empty base env when inheritEnv is false", async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this is shell syntax for the child.
    const result = await run("sh", ["-c", "echo ${HOME:-unset}"], { inheritEnv: false });
    expect(result.stdout).toBe("unset");
  });

  it("runs in the requested cwd", async () => {
    const result = await run("pwd", [], { cwd: "/" });
    expect(result.stdout).toBe("/");
  });

  it("reports a timeout as ProcessError", async () => {
    const error = await run("sleep", ["5"], { timeoutMs: 50 }).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ProcessError);
    expect((error as ProcessError).code).toBe("process-timeout");
  });

  it("never leaks env values into the error message", async () => {
    const sentinel = "sentinel-9f21c8-do-not-leak";
    const error = await run("false", [], { env: { AGNOSTIC_TEST_SECRET: sentinel } }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ProcessError);
    expect((error as ProcessError).message).not.toContain(sentinel);
  });
});

describe("spawn", () => {
  it("returns a child that exposes stdout and resolves", async () => {
    const child = spawn("echo", ["streamed"]);
    expect(child.stdout).not.toBeNull();
    const result = await child;
    expect(result.stdout).toBe("streamed");
  });
});

describe("setProcessLog", () => {
  afterEach(() => {
    setProcessLog(null);
  });

  it("reports a successful run without its output", async () => {
    const entries: ProcessLogEntry[] = [];
    setProcessLog((entry) => entries.push(entry));
    await run("echo", ["hello"]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ command: "echo", args: ["hello"], exitCode: 0 });
    expect(JSON.stringify(entries[0])).not.toContain("hello world");
  });

  it("reports a failure with its exit code", async () => {
    const entries: ProcessLogEntry[] = [];
    setProcessLog((entry) => entries.push(entry));
    await run("false").catch(() => undefined);
    expect(entries[0]).toMatchObject({ command: "false", exitCode: 1 });
  });

  it("reports a spawned process when it finishes", async () => {
    const entries: ProcessLogEntry[] = [];
    setProcessLog((entry) => entries.push(entry));
    await spawn("echo", ["spawned"]);
    await new Promise((done) => setTimeout(done, 10));
    expect(entries[0]).toMatchObject({ command: "echo", exitCode: 0 });
  });

  it("stops reporting once the sink is removed", async () => {
    const entries: ProcessLogEntry[] = [];
    setProcessLog((entry) => entries.push(entry));
    setProcessLog(null);
    await run("echo", ["quiet"]);
    expect(entries).toEqual([]);
  });
});

describe("logFile", () => {
  it("appends both streams to the file and ignores stdin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-process-"));
    const file = join(dir, "logs", "out.log");
    await run(process.execPath, ["-e", "console.log('to stdout'); console.error('to stderr')"], {
      logFile: file,
    });
    await run(process.execPath, ["-e", "console.log('again')"], { logFile: file });
    const text = await readFile(file, "utf8");
    expect(text).toContain("to stdout");
    expect(text).toContain("to stderr");
    expect(text).toContain("again");
    await rm(dir, { recursive: true, force: true });
  });

  it("lets a detached child outlive the parent's handle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-detached-"));
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 50)"], {
      detached: true,
      logFile: join(dir, "out.log"),
    });
    expect(child.pid).toBeGreaterThan(0);
    child.unref();
    await child;
    await rm(dir, { recursive: true, force: true });
  });
});
