import { describe, expect, it } from "vitest";
import { daemonProxy, xtermChunk } from "./vite.config.js";

describe("daemonProxy", () => {
  const target = "http://127.0.0.1:53199";
  const entries = daemonProxy(target);

  it("sends the daemon's own origin, which its Origin check accepts", () => {
    // In dev the page is on Vite's port, so without this every fetch would be a foreign origin.
    for (const [path, options] of Object.entries(entries)) {
      expect(options.headers, path).toEqual({ origin: target });
      expect(options.changeOrigin, path).toBe(false);
    }
  });

  it("rewrites the origin on the upgrade too, not only on the fetches", () => {
    // The terminal socket opens at /tasks/:id/terminal, under the /tasks entry.
    expect(entries["/tasks"]).toMatchObject({ target, ws: true, headers: { origin: target } });
  });

  it("proxies every path the daemon answers on, and nothing that Vite serves", () => {
    expect(Object.keys(entries)).toEqual([
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
    ]);
    expect(entries["/ui"]).toBeUndefined();
  });
});

describe("xtermChunk", () => {
  it("puts the terminal emulator and its addon in one chunk of their own", () => {
    expect(xtermChunk("/repo/node_modules/@xterm/xterm/lib/xterm.mjs")).toBe("xterm");
    expect(xtermChunk("/repo/node_modules/@xterm/addon-fit/lib/addon-fit.mjs")).toBe("xterm");
  });

  it("leaves every other module where the bundler put it", () => {
    expect(xtermChunk("/repo/packages/ui/src/app.tsx")).toBeUndefined();
    expect(xtermChunk("/repo/node_modules/react-dom/client.js")).toBeUndefined();
  });
});
