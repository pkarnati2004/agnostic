import type { TaskStatus } from "@agnostic/core";

const FIRST_WAIT_MS = 1_000;
const LONGEST_WAIT_MS = 10_000;

export type Reconnect = {
  /** Wait, then ask the daemon what became of the task. */
  schedule(): void;
  /** Back to the first wait, after a socket that opened. */
  reset(): void;
  stop(): void;
};

export type ReconnectOptions = {
  taskId: string;
  /** The task's status now, or null when the read itself failed. */
  readStatus(taskId: string): Promise<TaskStatus | null>;
  onLive(): void;
  onGone(): void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

/**
 * What a tab does between sockets. The browser never learns why an upgrade was refused - every
 * refusal arrives as close 1006 - so the answer comes from a task read, which reconciles the
 * session's liveness first (ADR 014). A daemon that is down at all doubles the wait.
 */
export function createReconnect(opts: ReconnectOptions): Reconnect {
  const later = opts.setTimeout ?? setTimeout;
  const cancel = opts.clearTimeout ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let wait = FIRST_WAIT_MS;
  let stopped = false;

  const ask = async () => {
    const status = await opts.readStatus(opts.taskId);
    if (stopped) {
      return;
    }
    if (status === "running" || status === "waiting") {
      opts.onLive();
      return;
    }
    // A read that failed, or a task not started yet, says nothing about the session.
    if (status === null || status === "queued") {
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
      schedule();
      return;
    }
    opts.onGone();
  };

  const schedule = () => {
    timer = later(() => {
      timer = null;
      void ask();
    }, wait);
  };

  return {
    schedule,
    reset: () => {
      wait = FIRST_WAIT_MS;
    },
    stop: () => {
      stopped = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
    },
  };
}
