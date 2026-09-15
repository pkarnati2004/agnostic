import type { TerminalSize, TerminalStream } from "@agnostic/core";
// The one file in agnostic that imports node-pty rather than core's process.ts: a pty is not a
// child_process, and ADR 025 has the executor spawn the tmux client itself.
import { type IPty, spawn as spawnPty } from "node-pty";
import { ExecutorError } from "./error.js";

type OpenTerminalOptions = {
  /** Exactly `attach(handle).argv`: argv[0] is `tmux`, resolved through `env.PATH`. */
  argv: string[];
  /** The executor's client env: TMUX and TMUX_PANE absent, TMUX_TMPDIR honoured. */
  env: Record<string, string>;
  size: TerminalSize;
};

/** One tmux client under a pty. The session it attaches to is not touched, only watched. */
export function openTerminal(opts: OpenTerminalOptions): TerminalStream {
  const pty = spawnAttach(opts);
  const dataListeners = new Set<(data: Uint8Array) => void>();
  const exitListeners = new Set<(exitCode: number) => void>();
  let exited = false;

  // node-pty decodes with a stateful StringDecoder, so a character split across two reads survives.
  pty.onData((chunk) => {
    const bytes = Buffer.from(chunk, "utf8");
    for (const listener of dataListeners) {
      listener(bytes);
    }
  });
  pty.onExit(({ exitCode }) => {
    exited = true;
    for (const listener of exitListeners) {
      listener(exitCode);
    }
    dataListeners.clear();
    exitListeners.clear();
  });

  return {
    // node-pty writes a Buffer through untouched; nothing here re-encodes the caller's bytes.
    write: (data) => {
      if (!exited) {
        pty.write(Buffer.from(data));
      }
    },
    // A size out of range is ignored rather than thrown: it arrives from a browser, and node-pty
    // throws synchronously on anything node's pty layer cannot use.
    resize: (size) => {
      if (!exited && isUsableSize(size)) {
        pty.resize(size.cols, size.rows);
      }
    },
    onData: (cb) => {
      dataListeners.add(cb);
      return () => {
        dataListeners.delete(cb);
      };
    },
    onExit: (cb) => {
      exitListeners.add(cb);
      return () => {
        exitListeners.delete(cb);
      };
    },
    // SIGHUP: tmux drops this client and only this client.
    close: () => {
      if (!exited) {
        pty.kill();
      }
    },
  };
}

const DEFAULT_SIZE: TerminalSize = { cols: 80, rows: 24 };
const MAX_DIMENSION = 1000;

function isUsableSize(size: TerminalSize): boolean {
  return [size.cols, size.rows].every(
    (value) => Number.isInteger(value) && value >= 1 && value <= MAX_DIMENSION,
  );
}

function spawnAttach(opts: OpenTerminalOptions): IPty {
  const [command, ...args] = opts.argv;
  if (command === undefined) {
    throw new ExecutorError("a terminal needs an attach command to run", {
      code: "tmux-failed",
      hint: "This is a bug in agn: the executor produced an empty attach argv.",
    });
  }
  const size = isUsableSize(opts.size) ? opts.size : DEFAULT_SIZE;
  return spawnPty(command, args, {
    name: "xterm-256color",
    cols: size.cols,
    rows: size.rows,
    // Like every other tmux client agn starts, from "/" so it never holds a deleted directory open.
    cwd: "/",
    env: opts.env,
    // Windows is out of scope for v1, so node-pty's conpty path is never exercised.
  });
}
