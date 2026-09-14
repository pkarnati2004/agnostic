import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@agnostic/core";
import { findOnPath } from "@agnostic/registry";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

/**
 * The harnesses a task test may launch, all of them the fake agent under another name. `claude`
 * and `codex` stay up like a real session; `quitter` and `failer` end on their own, which is how
 * a test reaches done and failed without killing anything. `hooksFile` is where that harness's own
 * installer writes, in the shell's words: the wrapper reads its hook command back from it, so a
 * test exercises the install rather than a command a test invented.
 */
const BINARIES: Record<string, { args: string[]; hooksFile?: string }> = {
  claude: { args: [], hooksFile: '"$PWD/.claude/settings.local.json"' },
  codex: { args: [], hooksFile: '"$HOME/.codex/hooks.json"' },
  quitter: { args: ["--exit-after", "2"] },
  failer: { args: ["--exit-after", "2", "--exit-code", "3"] },
};

/** Reads the command out of a Claude-shaped hook config; nothing on stdout when there is none. */
const READ_HOOK_COMMAND = `const { readFileSync } = require("node:fs");
try {
  const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const entries = Object.values(config.hooks ?? {}).flat().flatMap((group) => group.hooks ?? []);
  const found = entries.find((entry) => typeof entry.command === "string");
  if (found) {
    process.stdout.write(found.command);
  }
} catch {}
`;

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
  const reader = join(binDir, "hook-command.cjs");
  await writeFile(reader, READ_HOOK_COMMAND, "utf8");
  for (const [binary, spec] of Object.entries(BINARIES)) {
    const file = join(binDir, binary);
    const flags = ["--log", `${logDir}/$$.log`, ...spec.args].join(" ");
    await writeFile(file, wrapper(flags, reader, spec.hooksFile), "utf8");
    await chmod(file, 0o755);
  }
  sequence += 1;
  const socketName = `agn-test-${process.pid}-${sequence}`;
  // The fakes first, then node, tmux and the system tools any `sh` script expects: the executor's
  // own tmux calls run with this environment too, and detection is stubbed, so nothing real is
  // ever detected through it.
  const env = {
    PATH: [
      binDir,
      dirname(process.execPath),
      await tmuxDirectory(),
      "/usr/bin",
      "/bin",
      // macOS keeps lsof here, and that is how the executor reads a process's directory.
      "/usr/sbin",
      "/sbin",
    ].join(":"),
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

/** The wrapper a harness's binary name resolves to: the fake agent, with the hook it was given. */
function wrapper(flags: string, reader: string, hooksFile: string | undefined): string {
  if (hooksFile === undefined) {
    return `#!/bin/sh\nexec ${FAKE_AGENT} ${flags} "$@"\n`;
  }
  return `#!/bin/sh
hook="$(node '${reader}' ${hooksFile} 2> /dev/null)"
if [ -n "$hook" ]; then
  exec ${FAKE_AGENT} ${flags} --hook-command "$hook" "$@"
fi
exec ${FAKE_AGENT} ${flags} "$@"
`;
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
