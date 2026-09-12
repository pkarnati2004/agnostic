import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgnosticPaths, agnosticPaths, type ExecutorProvider, run } from "@agnostic/core";
import { createTmuxExecutor } from "./executor.js";
import { createTmuxClient, killSession, listSessions, type TmuxClient } from "./tmux-client.js";

export type TestTmux = {
  home: string;
  paths: AgnosticPaths;
  socketName: string;
  /** The environment every tmux client and every launched command runs with. */
  env: Record<string, string>;
  client: TmuxClient;
  /** Built on first use: a test that never asks for one never has an exit watcher running. */
  executor(): ExecutorProvider;
  cleanup(): Promise<void>;
};

let sequence = 0;

/**
 * One tmux server per test file, on a socket under a private `TMUX_TMPDIR`, with `TMUX` and
 * `TMUX_PANE` absent from the environment. Leaking a server exhausts the machine's pty pool, so
 * cleanup kills every server that appeared under that directory.
 */
export async function createTestTmux(): Promise<TestTmux> {
  await assertTmuxInstalled();
  const home = await mkdtemp(join(tmpdir(), "agn-executor-test-"));
  // A unix socket path is capped at ~104 bytes, and macOS temp directories are long, so the
  // private TMUX_TMPDIR goes somewhere short rather than under the test home.
  const tmuxTmpdir = await mkdtemp("/tmp/agn-");
  sequence += 1;
  const socketName = `t${process.pid}-${sequence}`;
  if (socketName.includes("default")) {
    throw new Error(`refusing to run tests on the socket ${socketName}`);
  }
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    TMUX_TMPDIR: tmuxTmpdir,
  };
  const paths = agnosticPaths(home);
  const client = createTmuxClient({ socketName, env });
  let executor: ExecutorProvider | null = null;
  return {
    home,
    paths,
    socketName,
    env,
    client,
    executor(): ExecutorProvider {
      executor ??= createTmuxExecutor({ paths, socketName, env });
      return executor;
    },
    async cleanup(): Promise<void> {
      await executor?.close();
      for (const socket of await socketsUnder(tmuxTmpdir)) {
        const server = createTmuxClient({ socketName: socket, env });
        for (const session of await listSessions(server)) {
          await killSession(server, session);
        }
        await server.run(["kill-server"], { allowFailure: true });
      }
      await rm(home, { recursive: true, force: true });
      await rm(tmuxTmpdir, { recursive: true, force: true });
    },
  };
}

async function socketsUnder(tmuxTmpdir: string): Promise<string[]> {
  const sockets: string[] = [];
  for (const dir of await readdir(tmuxTmpdir).catch(() => [] as string[])) {
    for (const name of await readdir(join(tmuxTmpdir, dir)).catch(() => [] as string[])) {
      if (name !== "default") {
        sockets.push(name);
      }
    }
  }
  return sockets;
}

async function assertTmuxInstalled(): Promise<void> {
  try {
    await run("tmux", ["-V"], { timeoutMs: 3_000 });
  } catch (cause) {
    throw new Error(
      "these tests need tmux 3.2 or newer: install it with `brew install tmux` (macOS) or `apt install tmux` (Linux)",
      { cause },
    );
  }
}

/** Polls until the check passes, so a test never sleeps for a fixed time it does not need. */
export async function waitFor(
  what: string,
  check: () => Promise<boolean> | boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${what} was still not true after ${timeoutMs}ms`);
}
