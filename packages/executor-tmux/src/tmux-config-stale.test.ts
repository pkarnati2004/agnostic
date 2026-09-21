import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestTmux, type TestTmux } from "./test-tmux.js";
import { tmuxConfigStale } from "./tmux-config.js";

let tmux: TestTmux;

beforeAll(async () => {
  tmux = await createTestTmux();
});

afterAll(() => tmux.cleanup());

function stale(): Promise<boolean> {
  return tmuxConfigStale({ paths: tmux.paths, socketName: tmux.socketName, env: tmux.env });
}

/** The server lives for the rest of the file once the first test has started it. */
async function startServer(): Promise<void> {
  await tmux.client.run(["new-session", "-d", "-s", "marker", "sh"], { allowFailure: true });
}

describe("tmuxConfigStale", () => {
  it("says nothing about a socket with no server on it", async () => {
    expect(await stale()).toBe(false);
  });

  it("is false for a server started on the config file agn has now", async () => {
    await startServer();
    expect(await stale()).toBe(false);
  });

  it("is false on a machine with no tmux to ask, which is what agn doctor runs on", async () => {
    await startServer();
    const empty = await mkdtemp(join(tmpdir(), "agn-no-tmux-"));
    const stale = await tmuxConfigStale({
      paths: tmux.paths,
      socketName: tmux.socketName,
      env: { ...tmux.env, PATH: empty },
    });
    expect(stale).toBe(false);
  });

  it("is true once the config has been rewritten under the running server", async () => {
    await startServer();
    const config = await readFile(tmux.paths.tmuxConf, "utf8");
    await writeFile(
      tmux.paths.tmuxConf,
      config.replace(/@agn-config \S+/, "@agn-config 000000000000"),
      "utf8",
    );

    expect(await stale()).toBe(true);

    await writeFile(tmux.paths.tmuxConf, config, "utf8");
  });
});
