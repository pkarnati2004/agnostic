import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// Repeated here rather than imported: the config runs before `@agnostic/core` has been built.
const DEFAULT_DAEMON_PORT = 7431;

const DEV_PORT = 5173;

// Every path the daemon answers on. The page is served by Vite; everything else is the daemon's.
const DAEMON_PATHS = [
  "/repos",
  "/tasks",
  "/profiles",
  "/events",
  "/usage",
  "/recommend",
  "/catalog",
  "/hooks",
  "/health",
  "/editors",
  "/doctor",
];

export default defineConfig(() => {
  const target = `http://127.0.0.1:${daemonPort()}`;
  return {
    base: "/ui/",
    plugins: [react(), tailwindcss()],
    // The terminal emulator is a third of the bundle and nothing but a task tab draws with it,
    // so it is a file of its own: the rest of the page no longer waits on it, and a release that
    // leaves xterm alone leaves its chunk cached.
    build: { rollupOptions: { output: { manualChunks: xtermChunk } } },
    // 127.0.0.1 rather than Vite's default localhost, which binds ::1 only: the URL agn
    // prints and the origin the daemon accepts are both written with the IPv4 address.
    server: { host: "127.0.0.1", port: DEV_PORT, strictPort: true, proxy: daemonProxy(target) },
  };
});

/** Undefined leaves the module where the bundler would have put it; only xterm is moved.
 * Exported for vite.config.test.ts. */
export function xtermChunk(id: string): string | undefined {
  return id.includes("@xterm/") ? "xterm" : undefined;
}

/** `DAEMON_PORT` first, then the running daemon's own file, then the port agn binds by default. */
function daemonPort(): number {
  const fromEnv = Number(process.env.DAEMON_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return portFromDaemonFile() ?? DEFAULT_DAEMON_PORT;
}

function portFromDaemonFile(): number | null {
  const home = process.env.AGNOSTIC_HOME ?? join(homedir(), ".agnostic");
  try {
    const info: unknown = JSON.parse(readFileSync(join(home, "daemon.json"), "utf8"));
    const port = (info as { port?: unknown }).port;
    return typeof port === "number" && Number.isInteger(port) ? port : null;
  } catch {
    // No daemon has run under this home yet; the default port is the best guess left.
    return null;
  }
}

/**
 * `ws: true` covers the terminal socket. The daemon accepts only its own origin, so the request
 * carries the target's origin and not Vite's: in dev the page is on another port. Vite merges
 * `headers` in the same step for a proxied request and for a proxied upgrade, so the rewrite
 * reaches both the fetches and the terminal socket. Exported for vite.config.test.ts.
 */
export function daemonProxy(target: string): Record<string, ProxyOptions> {
  const entries = DAEMON_PATHS.map((path) => [
    path,
    { target, changeOrigin: false, ws: true, headers: { origin: target } },
  ]);
  return Object.fromEntries(entries) as Record<string, ProxyOptions>;
}
