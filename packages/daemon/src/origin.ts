import type { MiddlewareHandler } from "hono";
import { DaemonError } from "./error.js";

/** Both spellings of loopback: the URL `agn ui` prints is one, a user retyping it may write the other. */
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

/**
 * The belt beside the token (ADR 026): a loopback daemon is reachable from any page in the user's
 * browser, so only its own origin is served. A missing Origin is allowed - the CLI, curl, the hook
 * script and node's `fetch` send none, and none of them is a page.
 */
export function originAllowed(origin: string | undefined, port: number): boolean {
  if (origin === undefined) {
    return true;
  }
  const url = parseOrigin(origin);
  return (
    url !== null &&
    // A header carrying a path, a query or a trailing slash is not an origin at all.
    url.origin === origin &&
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.includes(url.hostname) &&
    url.port === String(port)
  );
}

/** Mounted before the auth check, so a foreign page is told 403 whatever token it guessed. */
export function originCheck(port: () => number): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin !== undefined && !originAllowed(origin, port())) {
      throw originForbidden(origin);
    }
    return next();
  };
}

export function originForbidden(origin: string): DaemonError {
  return new DaemonError(`${origin} is not this daemon's own origin`, {
    code: "origin-forbidden",
    hint: "Open the workspace from the URL `agn ui` prints.",
  });
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}
