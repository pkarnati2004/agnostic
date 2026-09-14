import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import type { AgnosticPaths } from "@agnostic/core";
import type { MiddlewareHandler } from "hono";
import { DaemonError } from "./error.js";
import type { Logger } from "./log.js";

const TOKEN_BYTES = 32;
const OWNER_ONLY = 0o600;

/**
 * The token is created once and lives for the life of `~/.agnostic`. "wx" makes creation atomic,
 * so two daemons racing to start still agree on one token.
 */
export async function ensureAuthToken(paths: AgnosticPaths, log: Logger): Promise<string> {
  await mkdir(paths.home, { recursive: true });
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  try {
    await writeFile(paths.authToken, token, { mode: OWNER_ONLY, flag: "wx" });
    return token;
  } catch (cause) {
    if (!isExists(cause)) {
      throw new DaemonError(`cannot write the auth token at ${paths.authToken}`, {
        code: "auth-token-unwritable",
        hint: "Check that ~/.agnostic is writable.",
        cause,
      });
    }
  }
  await warnOnLooseMode(paths.authToken, log);
  return (await readFile(paths.authToken, "utf8")).trim();
}

async function warnOnLooseMode(file: string, log: Logger): Promise<void> {
  const mode = (await stat(file)).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    log.warn("auth token is readable by other users", { file, mode: mode.toString(8) });
  }
}

/**
 * `/health` is the only route without a token: it carries nothing secret, and `agn daemon status`
 * needs it to tell a stale daemon from one whose token this user cannot read (Q4).
 */
export function bearerAuth(token: string): MiddlewareHandler {
  const expected = tokenDigest(token);
  return async (c, next) => {
    if (c.req.path === "/health") {
      return next();
    }
    const header = c.req.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!tokenMatches(presented, expected)) {
      throw new DaemonError("this request carries no valid agn auth token", {
        code: "unauthorized",
        hint: "The token is in ~/.agnostic/auth-token; the agn CLI reads it for you.",
      });
    }
    return next();
  };
}

/**
 * The one comparison for the auth token, whether it arrived as a Bearer header or as the terminal
 * socket's subprotocol (ADR 026). Hashing the presented value keeps the compare constant time
 * whatever its length; the expected digest is taken once, when the caller is built.
 */
export function tokenMatches(presented: string, expected: Buffer): boolean {
  return timingSafeEqual(tokenDigest(presented), expected);
}

export function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function isExists(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "EEXIST";
}
