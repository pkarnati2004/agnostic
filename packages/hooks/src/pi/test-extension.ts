import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgnosticPaths } from "@agnostic/core";
import { piExtensionSource } from "./extension-source.js";

// Not part of the package's exports: this is how both Pi extension tests load the file pi loads.

/** What pi hands an event to, and what a test calls to stand in for one. */
export type Handler = (event: unknown, ctx: unknown) => void;

/** One request the extension made, as a fetch stub recorded it. */
export type Post = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

type Extension = { default: (pi: { on: (name: string, fn: Handler) => void }) => void };

let loads = 0;

/**
 * The extension written to `dir` and imported, with the handlers it registered. A fresh module
 * every time: the queue and the session it reports both live in module state.
 */
export async function loadExtension(
  dir: string,
  paths: AgnosticPaths,
  kind: "pi" | "omp",
): Promise<Map<string, Handler>> {
  loads += 1;
  const file = join(dir, `agn-status-${loads}.mjs`);
  await writeFile(file, piExtensionSource(paths, kind), "utf8");
  const extension = (await import(pathToFileURL(file).href)) as Extension;
  const handlers = new Map<string, Handler>();
  extension.default({ on: (name, fn) => handlers.set(name, fn) });
  return handlers;
}

/** The two files the extension reads on every post to find the daemon that is running now. */
export async function writeDaemonFiles(
  paths: AgnosticPaths,
  port: number,
  token: string,
): Promise<void> {
  await mkdir(paths.home, { recursive: true });
  await writeFile(paths.daemon, JSON.stringify({ port, pid: 1 }), "utf8");
  await writeFile(paths.authToken, token, "utf8");
}

/** The session pi reports, as the extension reads it off the context of each event. */
export function piContext(sessionFile: string, isIdle?: boolean): unknown {
  return {
    sessionManager: { getSessionId: () => "pi-abc", getSessionFile: () => sessionFile },
    isIdle: () => isIdle === true,
  };
}

/** The posts are off the handler's critical path, so the queue drains after the turn of work. */
export function settle(): Promise<void> {
  return new Promise((resume) => setTimeout(resume, 0));
}
