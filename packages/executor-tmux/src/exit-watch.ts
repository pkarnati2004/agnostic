import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { SessionEvent } from "@agnostic/core";
import { ExecutorError } from "./error.js";
import { killSession, type TmuxClient, taskIdFromSession } from "./tmux-client.js";

const SUFFIX = ".exit";
// The hook's redirect creates the file before it writes to it; an empty read is simply too early.
const RETRY_MS = 50;

type ExitWatch = {
  /** Reads whatever is already there; the daemon's downtime is not a lost exit. */
  scan(): Promise<void>;
  close(): Promise<void>;
};

export function createExitWatch(
  client: TmuxClient,
  dir: string,
  emit: (event: SessionEvent) => void,
): ExitWatch {
  let closed = false;
  let queue: Promise<void> = Promise.resolve();
  const watcher: FSWatcher = watch(dir, () => {
    schedule();
  });
  watcher.on("error", () => {
    // A watch that dies (the directory was removed) must not take the daemon with it.
  });

  // The chain must never stay rejected: every later sweep would chain onto the rejection and no
  // exit would ever be read again, so a failure ends here rather than in the queue.
  function schedule(): Promise<void> {
    queue = queue.then(() => (closed ? undefined : sweep())).catch(warn);
    return queue;
  }

  async function sweep(): Promise<void> {
    let retry = false;
    for (const name of await sessionsWithExitFiles(dir)) {
      const file = join(dir, `${name}${SUFFIX}`);
      const text = await readFile(file, "utf8").catch(() => "");
      if (text.trim() === "") {
        retry = true;
        continue;
      }
      emit(exitEvent(name, text));
      await unlink(file).catch(() => undefined);
      await reap(name);
    }
    if (retry && !closed) {
      setTimeout(() => {
        schedule();
      }, RETRY_MS).unref();
    }
  }

  /** A session left behind is harmless: `alive` is false and the next launch kills it first. */
  async function reap(name: string): Promise<void> {
    try {
      await killSession(client, name);
    } catch (cause) {
      if (!(cause instanceof ExecutorError)) {
        throw cause;
      }
      // The tmux call that failed is already in the process log.
    }
  }

  return {
    scan: schedule,
    async close(): Promise<void> {
      closed = true;
      watcher.close();
      await queue;
    },
  };
}

async function sessionsWithExitFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  return (
    entries
      .filter((entry) => entry.endsWith(SUFFIX))
      .map((entry) => entry.slice(0, -SUFFIX.length))
      // Only agn's own sessions: anything else in the directory is not ours to reap.
      .filter((name) => taskIdFromSession(name) !== null)
  );
}

function exitEvent(session: string, text: string): SessionEvent {
  return {
    kind: "exited",
    taskId: taskIdFromSession(session) ?? session,
    tmuxSession: session,
    exitCode: parseExitStatus(text),
    at: new Date().toISOString(),
  };
}

/** Anything the sweep did not expect reaches stderr, which the daemon writes to its log. */
function warn(cause: unknown): void {
  process.emitWarning(cause instanceof Error ? cause : new Error(String(cause)));
}

/** `<status> <signal>`: tmux leaves the status empty when a signal, not an exit, ended the pane. */
export function parseExitStatus(text: string): number | null {
  const status = text.trim().split(/\s+/)[0] ?? "";
  return /^\d+$/.test(status) ? Number(status) : null;
}
