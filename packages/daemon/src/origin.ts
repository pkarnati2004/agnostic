import type { MiddlewareHandler } from "hono";
import { isUiRead } from "./auth.js";
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

/**
 * Mounted before the auth check, so a foreign page is told 403 whatever token it guessed. Fetching
 * the built page itself is exempt (ADR 026): a `<link>` or a navigation from elsewhere carries a
 * foreign Referer but never a foreign Origin, and the page holds no secret. Only a read is exempt,
 * so a form POST from a foreign page still has nowhere under `/ui` to land.
 */
export function originCheck(port: () => number): MiddlewareHandler {
  return async (c, next) => {
    if (isUiRead(c.req.method, c.req.path)) {
      return next();
    }
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
    // A header that is not a URL is not this daemon's origin: the caller refuses the request.
    return null;
  }
}
