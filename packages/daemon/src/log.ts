import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { setProcessLog } from "@agnostic/core";
import type { MiddlewareHandler } from "hono";

type Fields = Record<string, string | number>;

export type Logger = {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  close(): void;
};

/**
 * One text line per entry, because this file is read with `tail -f`. Nothing from a request or
 * response body is ever a field: no prompt, no task title, no token.
 */
export function createLogger(file: string): Logger {
  mkdirSync(dirname(file), { recursive: true });
  const stream = createWriteStream(file, { flags: "a" });
  let open = true;
  const write = (level: string, msg: string, fields?: Fields) => {
    // Work in flight at shutdown still logs; a line after close is dropped, never a crash.
    if (open) {
      stream.write(`${new Date().toISOString()} ${level} ${msg}${format(fields)}\n`);
    }
  };
  setProcessLog((entry) => {
    write("INFO", `process ${entry.command}`, {
      args: entry.args.length,
      exit: entry.exitCode ?? -1,
      ms: entry.durationMs,
    });
  });
  return {
    debug: (msg, fields) => write("DEBUG", msg, fields),
    info: (msg, fields) => write("INFO", msg, fields),
    warn: (msg, fields) => write("WARN", msg, fields),
    error: (msg, fields) => write("ERROR", msg, fields),
    close: () => {
      open = false;
      setProcessLog(null);
      stream.end();
    },
  };
}

/** Method, path, status and duration. The path holds ids, which are opaque and safe to print. */
export function requestLog(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = Date.now();
    await next();
    log.info(`http ${c.req.method} ${c.req.path}`, {
      status: c.res.status,
      ms: Date.now() - startedAt,
    });
  };
}

function format(fields?: Fields): string {
  if (fields === undefined) {
    return "";
  }
  return Object.entries(fields)
    .map(([key, value]) => ` ${key}=${typeof value === "number" ? value : quote(value)}`)
    .join("");
}

function quote(value: string): string {
  const flat = value.replace(/\s+/g, " ");
  return flat.includes(" ") ? JSON.stringify(flat) : flat;
}
