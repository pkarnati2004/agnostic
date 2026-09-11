import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@agnostic/core";
import { findOnPath } from "@agnostic/registry";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

/**
 * The harnesses a task test may launch, all of them the fake agent under another name. `claude`
 * and `codex` stay up like a real session; `quitter` and `failer` end on their own, which is how
 * a test reaches done and failed without killing anything.
 */
const BINARIES: Record<string, string[]> = {
  claude: [],
  codex: [],
  quitter: ["--exit-after", "2"],
  failer: ["--exit-after", "2", "--exit-code", "3"],
};

export type LaunchEnv = {
  socketName: string;
  binDir: string;
  /** Every fake harness's own log, one after another; each is whole, as that process wrote it. */
  readLog(): Promise<string>;
  env: Record<string, string>;
  cleanup(): Promise<void>;
};

let sequence = 0;

/**
 * What a daemon test launches instead of a real coding agent: a private tmux server, and a PATH
 * holding `claude` and `codex` as wrappers around `tests/fixtures/fake-agent.sh`. A unix socket
 * path is capped near 104 bytes and macOS temp directories are long, so TMUX_TMPDIR goes somewhere
 * short rather than under the test home.
 */
export async function createLaunchEnv(home: string): Promise<LaunchEnv> {
  await assertTmuxInstalled();
  const tmuxTmpdir = await mkdtemp("/tmp/agn-");
  const binDir = join(home, "bin");
  // One log per process: two harnesses appending to one file interleave mid-line.
  const logDir = join(home, "agent-logs");
  await mkdir(binDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  for (const [binary, args] of Object.entries(BINARIES)) {
    const file = join(binDir, binary);
    const flags = ["--log", `${logDir}/$$.log`, ...args].join(" ");
    await writeFile(file, `#!/bin/sh\nexec ${FAKE_AGENT} ${flags} "$@"\n`, "utf8");
    await chmod(file, 0o755);
  }
  sequence += 1;
  const socketName = `agn-test-${process.pid}-${sequence}`;
  // The fakes first, then node, tmux and the system tools any `sh` script expects: the executor's
  // own tmux calls run with this environment too, and detection is stubbed, so nothing real is
  // ever detected through it.
  const env = {
    PATH: [binDir, dirname(process.execPath), await tmuxDirectory(), "/usr/bin", "/bin"].join(":"),
    HOME: home,
    TMUX_TMPDIR: tmuxTmpdir,
  };
  return {
    socketName,
    binDir,
    env,
    readLog: () => readLogs(logDir),
    cleanup: async () => {
      // A leaked tmux server holds ptys for the life of the machine, so every socket that turned
      // up under this directory is killed, not just the one this test asked for.
      for (const socket of await socketsUnder(tmuxTmpdir)) {
        await run("tmux", ["-L", socket, "kill-server"], { env, inheritEnv: false }).catch(
          () => undefined,
        );
      }
      await rm(tmuxTmpdir, { recursive: true, force: true });
    },
  };
}

async function readLogs(logDir: string): Promise<string> {
  const names = await readdir(logDir).catch(() => [] as string[]);
  const logs = await Promise.all(names.map((name) => readFile(join(logDir, name), "utf8")));
  return logs.join("\n");
}

async function socketsUnder(tmuxTmpdir: string): Promise<string[]> {
  const sockets: string[] = [];
  for (const dir of await readdir(tmuxTmpdir).catch(() => [] as string[])) {
    for (const name of await readdir(join(tmuxTmpdir, dir)).catch(() => [] as string[])) {
      sockets.push(name);
    }
  }
  return sockets;
}

async function tmuxDirectory(): Promise<string> {
  const path = await findOnPath(["tmux"], process.env.PATH ?? "");
  return path === null ? "/usr/bin" : dirname(path);
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
