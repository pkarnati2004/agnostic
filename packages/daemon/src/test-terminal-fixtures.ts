import type { TerminalSize, TerminalStream } from "@agnostic/core";
import type { Logger } from "./log.js";

// The fixtures the terminal tests share: a stream with no pty behind it, and a logger
// that writes nowhere. The socket side differs per file, so it stays in the file that needs it.

export type FakeStream = TerminalStream & {
  writes: Buffer[];
  sizes: TerminalSize[];
  closes: number;
  emitData(text: string): void;
  emitExit(code: number): void;
};

export function fakeStream(): FakeStream {
  const data: ((bytes: Uint8Array) => void)[] = [];
  const exit: ((code: number) => void)[] = [];
  const stream: FakeStream = {
    writes: [],
    sizes: [],
    closes: 0,
    write: (bytes) => stream.writes.push(Buffer.from(bytes)),
    resize: (size) => stream.sizes.push(size),
    onData: (cb) => {
      data.push(cb);
      return () => undefined;
    },
    onExit: (cb) => {
      exit.push(cb);
      return () => undefined;
    },
    close: () => {
      stream.closes += 1;
    },
    emitData: (text) => {
      for (const cb of data) {
        cb(Buffer.from(text, "utf8"));
      }
    },
    emitExit: (code) => {
      for (const cb of exit) {
        cb(code);
      }
    },
  };
  return stream;
}

export const silentLog: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  close: () => undefined,
};
