import { mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import {
  type AgnosticPaths,
  type AttachInfo,
  type ExecutorProvider,
  type SessionHandle,
  type SessionState,
  scrubEnv,
} from "@agnostic/core";
import { detectHarnesses } from "./detect.js";
import { isExitFileFor } from "./exit-file.js";
import { createExitWatch } from "./exit-watch.js";
import { launchSession } from "./launch.js";
import { processProbe, readProcessTable } from "./process-table.js";
import { createEventFanout } from "./session-events.js";
import { stopSession } from "./stop.js";
import { createTmuxClient, paneDead, type TmuxClient } from "./tmux-client.js";
import { cleanWorktree, prepareWorktree } from "./worktree.js";

export type TmuxExecutorOptions = {
  paths: AgnosticPaths;
  /** Default `agn`: a socket of agn's own, so `tmux kill-server` never ends a task. */
  socketName?: string;
  /** What tmux client processes run with; the pane's own environment comes from the daemon. */
  env?: Record<string, string>;
};

export function createTmuxExecutor(opts: TmuxExecutorOptions): ExecutorProvider {
  const env = opts.env ?? clientEnv();
  const client = createTmuxClient({ socketName: opts.socketName ?? "agn", env });
  const defaultServer = createTmuxClient({ socketName: null, env });
  mkdirSync(opts.paths.sessions, { recursive: true });

  const events = createEventFanout();
  const watch = createExitWatch(client, opts.paths.sessions, events.emit);
  void watch.scan();
  const probe = processProbe();

  // The third case - a socket that is neither ours nor the default server - only comes from a task
  // row written before someone changed socketName, so its client is built once and not kept.
  function clientFor(handle: SessionHandle): TmuxClient {
    if (handle.tmuxSocket === client.socket) {
      return client;
    }
    return handle.tmuxSocket === null
      ? defaultServer
      : createTmuxClient({ socketName: handle.tmuxSocket, env });
  }

  return {
    id: "tmux-local",
    prepare: (input) => prepareWorktree(opts.paths, input),
    launch: (req) => launchSession(client, opts.paths.sessions, req),
    async sessionState(handle): Promise<SessionState> {
      // Null is "no such session"; remain-on-exit holds a dead pane until the watcher reads it.
      const dead = await paneDead(clientFor(handle), handle.tmuxSession);
      if (dead !== null) {
        // A session agn did not launch has no pane-died hook, so no exit file is on its way and a
        // dead pane of its is all agn will ever learn about it.
        return dead ? exitOnItsWay(handle) : "running";
      }
      // No session, but an exit file nobody has swept yet still owes this task its real exit code.
      return (await hasExitFile(opts.paths.sessions, handle.tmuxSession)) ? "exited" : "gone";
    },
    attach(handle): AttachInfo {
      const socket = handle.tmuxSocket === null ? [] : ["-L", handle.tmuxSocket];
      return {
        kind: "tmux",
        argv: ["tmux", "-u", ...socket, "attach-session", "-t", handle.tmuxSession],
      };
    },
    stop: (handle) => stopSession(clientFor(handle), handle, probe),
    clean: (input) => cleanWorktree(opts.paths, input),
    async detect(path, matchers) {
      return detectHarnesses([client, defaultServer], await readProcessTable(), path, matchers);
    },
    onEvent: events.subscribe,
    async close() {
      await watch.close();
      events.clear();
    },
  };
}

/**
 * A launch of agn's writes an exit file through its pane-died hook, so its dead pane still owes
 * the task an exit code. A session agn adopted has no such hook and no launch id: for that one,
 * dead is the end of the story.
 */
function exitOnItsWay(handle: SessionHandle): SessionState {
  return handle.launchId === null ? "gone" : "exited";
}

async function hasExitFile(sessionsDir: string, session: string): Promise<boolean> {
  const entries = await readdir(sessionsDir).catch(() => [] as string[]);
  return entries.some((entry) => isExitFileFor(entry, session));
}

/** TMUX and TMUX_PANE would point a client at the server agn itself was started from. */
function clientEnv(): Record<string, string> {
  const { TMUX: _tmux, TMUX_PANE: _pane, ...rest } = scrubEnv(process.env);
  return rest;
}
