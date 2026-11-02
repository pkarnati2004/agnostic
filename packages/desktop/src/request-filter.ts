import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The only files the window loads from disk; agnd's bundle and node_modules sit beside them. */
const STATUS_FILES = ["status.html", "status.js"];

/**
 * The window talks to its own daemon and to nothing else: the page over http, the terminal over
 * ws, the app's status page and its script from disk, and DevTools. `localhost` is refused because the page is
 * loaded from 127.0.0.1, and a second spelling is a second origin to reason about.
 */
export function requestAllowed(url: string, daemonOrigin: string, statusDir: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all, so not one of the four kinds of request the window makes.
    return false;
  }
  switch (parsed.protocol) {
    case "http:":
      return parsed.origin === daemonOrigin;
    case "ws:":
      return `http://${parsed.host}` === daemonOrigin;
    case "file:":
      return STATUS_FILES.some((file) => fileURLToPath(parsed) === join(statusDir, file));
    case "devtools:":
      return true;
    default:
      return false;
  }
}

/** The two calls of Electron's `Session` that grant a page a camera, notifications and the like. */
type PermissionSession = {
  setPermissionRequestHandler(
    handler: (contents: unknown, permission: string, callback: (granted: boolean) => void) => void,
  ): void;
  setPermissionCheckHandler(handler: (contents: unknown, permission: string) => boolean): void;
};

/** The copy buttons call `navigator.clipboard.writeText`; reading the clipboard is still refused. */
const GRANTED = ["clipboard-sanitized-write"];

/** The workspace needs no browser permission but writing text to the clipboard. */
export function limitPermissions(session: PermissionSession): void {
  session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(GRANTED.includes(permission)),
  );
  session.setPermissionCheckHandler((_contents, permission) => GRANTED.includes(permission));
}
