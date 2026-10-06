import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTmux, type TestTmux } from "./test-tmux.js";
import {
  assertUsableVersion,
  createTmuxClient,
  hasSession,
  killSession,
  listSessions,
  parsePaneValue,
  sessionName,
  taskIdFromSession,
  tmuxVersion,
} from "./tmux-client.js";

let tmux: TestTmux;
let stubDir: string;

/** A `tmux` on PATH that records its argv and answers whatever the test asked it to. */
async function stubClient(body: string) {
  const dir = await mkdtemp(join(stubDir, "stub-"));
  const script = join(dir, "tmux");
  await writeFile(
    script,
    `#!/bin/sh\nprintf '%s\\n' "$*" > "${dir}/argv"\npwd > "${dir}/cwd"\nprintf '%s' "\${TMUX-unset}" > "${dir}/tmux-env"\n${body}\n`,
  );
  await chmod(script, 0o755);
  const configFile = join(dir, "tmux.conf");
  return {
    dir,
    configFile,
    client: createTmuxClient({
      socketName: "agn-stub",
      env: { PATH: dir, TMUX: "/tmp/leak,1,0" },
      configFile,
    }),
    argv: () => readFile(join(dir, "argv"), "utf8"),
  };
}

beforeAll(async () => {
  tmux = await createTestTmux();
  stubDir = await mkdtemp(join(tmpdir(), "agn-tmux-stub-"));
});

afterAll(async () => {
  await tmux.cleanup();
  await rm(stubDir, { recursive: true, force: true });
});

describe("createTmuxClient", () => {
  it("starts every argv with -u, agn's config and the socket name", async () => {
    const stub = await stubClient("exit 0");
    await stub.client.run(["has-session", "-t", "agn-x"]);
    expect(await stub.argv()).toBe(`-u -f ${stub.configFile} -L agn-stub has-session -t agn-x\n`);
  });

  it("leaves the user's own server on the user's own config", async () => {
    const stub = await stubClient("exit 0");
    const user = createTmuxClient({ socketName: null, env: { PATH: stub.dir }, configFile: null });
    await user.run(["list-sessions"]);
    expect(await stub.argv()).toBe("-u list-sessions\n");
  });

  it("refuses to run on agn's socket without a config file, which would be a bug", async () => {
    const stub = await stubClient("exit 0");
    const unconfigured = createTmuxClient({
      socketName: "agn-stub",
      env: { PATH: stub.dir },
      configFile: null,
    });
    await expect(unconfigured.run(["list-sessions"])).rejects.toMatchObject({
      code: "tmux-failed",
    });
  });

  it("runs tmux from / so the server never holds a directory that is later deleted", async () => {
    const stub = await stubClient("exit 0");
    await stub.client.run(["list-sessions"]);
    expect(await readFile(join(stub.dir, "cwd"), "utf8")).toBe("/\n");
  });

  it("passes the environment it was given, TMUX and all", async () => {
    const stub = await stubClient("exit 0");
    await stub.client.run(["list-sessions"]);
    // The executor is what strips TMUX; the client passes on whatever it was handed.
    expect(await readFile(join(stub.dir, "tmux-env"), "utf8")).toBe("/tmp/leak,1,0");
  });

  it("refuses the user's default server", () => {
    try {
      createTmuxClient({ socketName: "default", env: {}, configFile: null });
      expect.unreachable("default must be refused");
    } catch (error) {
      expect(error).toMatchObject({ name: "ExecutorError", code: "socket-name-invalid" });
    }
  });

  it("refuses a socket name that is a path", () => {
    expect(() =>
      createTmuxClient({ socketName: "../agn", env: {}, configFile: null }),
    ).toThrowError(/not a usable tmux socket name/);
  });

  it("says how to install tmux when it is not on PATH", async () => {
    const empty = await mkdtemp(join(stubDir, "empty-"));
    const client = createTmuxClient({
      socketName: "agn-missing",
      env: { PATH: empty },
      configFile: join(empty, "tmux.conf"),
    });
    await expect(client.run(["list-sessions"])).rejects.toMatchObject({
      code: "tmux-not-found",
      hint: expect.stringContaining("brew install tmux"),
    });
  });

  it("turns a hung tmux into a failure, never into `the session is gone`", async () => {
    // exec, so the killed process is the sleep itself and no child keeps the pipes open.
    const stub = await stubClient("exec /bin/sleep 30");
    await expect(
      stub.client.run(["has-session", "-t", "agn-x"], { timeoutMs: 300 }),
    ).rejects.toMatchObject({ code: "tmux-failed" });
    const slow = createTmuxClient({
      socketName: "agn-stub",
      env: { PATH: stub.dir },
      configFile: stub.configFile,
    });
    await expect(hasSession(slow, "agn-x")).rejects.toMatchObject({ code: "tmux-failed" });
  });
});

describe("assertUsableVersion", () => {
  it("accepts 3.2a and the untagged builds ahead of it", async () => {
    expect(await assertUsableVersion((await stubClient("echo 'tmux 3.2a'")).client)).toBe("3.2a");
    expect(await assertUsableVersion((await stubClient("echo 'tmux next'")).client)).toBe("next");
    expect(await assertUsableVersion((await stubClient("echo 'tmux master'")).client)).toBe(
      "master",
    );
  });

  it("refuses 3.1c, which has neither -e nor pane_dead_signal", async () => {
    await expect(
      assertUsableVersion((await stubClient("echo 'tmux 3.1c'")).client),
    ).rejects.toMatchObject({ code: "tmux-too-old", hint: expect.stringContaining("3.2") });
  });

  it("says a version it cannot read is unreadable, not old", async () => {
    await expect(
      assertUsableVersion((await stubClient("echo 'tmux abc'")).client),
    ).rejects.toMatchObject({
      code: "tmux-failed",
      message: expect.stringContaining("could not read a version number"),
    });
  });

  it("refuses output that is not a tmux version", async () => {
    await expect(
      assertUsableVersion((await stubClient("echo 'hello there'")).client),
    ).rejects.toMatchObject({ code: "tmux-failed" });
  });

  it("reads the version of the tmux the tests run against", async () => {
    expect(await tmuxVersion(tmux.client)).toMatch(/^\d+\.\d+/);
  });
});

describe("sessionName", () => {
  it("prefixes the task id, which carries no . or : of its own", () => {
    expect(sessionName("t3n9v2wxyz")).toBe("agn-t3n9v2wxyz");
    expect(taskIdFromSession("agn-t3n9v2wxyz")).toBe("t3n9v2wxyz");
    expect(taskIdFromSession("work")).toBeNull();
  });
});

describe("parsePaneValue", () => {
  it("takes the last |-joined field of the first line", () => {
    expect(parsePaneValue("agn-x|123\n")).toBe("123");
    expect(parsePaneValue("agn-x|1\nagn-x|0\n")).toBe("1");
    expect(parsePaneValue("")).toBeNull();
  });
});

describe("a socket with no server", () => {
  it("has no session, no sessions, and kill-session on it is success", async () => {
    const idle = createTmuxClient({
      socketName: `${tmux.socketName}-idle`,
      env: tmux.env,
      configFile: tmux.paths.tmuxConf,
    });
    expect(await hasSession(idle, "agn-nothing")).toBe(false);
    expect(await listSessions(idle)).toEqual([]);
    await expect(killSession(idle, "agn-nothing")).resolves.toBeUndefined();
  });
});
