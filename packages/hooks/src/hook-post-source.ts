// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { AgnosticPaths } from "@agnostic/core";

/**
 * The transport both in-process hooks share: the Pi family's extension and the OpenCode family's
 * plugin run inside the harness, so they post to the daemon themselves instead of running
 * `post.sh`. The text is plain ESM JavaScript, valid as TypeScript, and reads its two paths from
 * the literals baked in here - the harness's environment is frozen when it starts, so a daemon
 * that restarts on another port is still found. The file this text goes into imports
 * `readFileSync` from `node:fs`.
 */
export function hookPostSource(paths: AgnosticPaths, route: string): string {
  return `const DAEMON_FILE = ${JSON.stringify(paths.daemon)};
const TOKEN_FILE = ${JSON.stringify(paths.authToken)};
const HOOK_PATH = ${JSON.stringify(route)};
const POST_TIMEOUT_MS = 1000;

let inFlight = false;
let pending = null;

// Read per post: the token is never written into this file, and a restarted daemon is followed.
function endpoint() {
  try {
    const daemon = JSON.parse(readFileSync(DAEMON_FILE, "utf8"));
    const token = readFileSync(TOKEN_FILE, "utf8").trim();
    return typeof daemon.port === "number" && token ? { port: daemon.port, token } : null;
  } catch {
    return null;
  }
}

// Latest-only: one post in flight and one waiting, so a slow daemon never backs up the harness.
function postHook(name, body) {
  pending = { name, body };
  return drain();
}

async function drain() {
  if (inFlight || pending === null) return;
  const next = pending;
  pending = null;
  inFlight = true;
  try {
    await send(next.name, next.body);
  } finally {
    inFlight = false;
  }
  await drain();
}

async function send(name, body) {
  const coords = endpoint();
  if (coords === null) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  if (timer.unref) timer.unref();
  try {
    await fetch("http://127.0.0.1:" + coords.port + HOOK_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + coords.token,
        "X-Agn-Task-Id": process.env.AGN_TASK_ID || "",
      },
      body: JSON.stringify({ hook_event_name: name, ...body }),
      signal: controller.signal,
    });
  } catch {
    // A daemon that is down, slow or gone must never fail the turn the user is having.
  } finally {
    clearTimeout(timer);
  }
}
`;
}
