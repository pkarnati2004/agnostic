type Handle = ReturnType<typeof setTimeout>;

/** Injected so the policy tests run under node with vitest's fake clock and no DOM. */
export type RefreshTimers = {
  setTimeout(run: () => void, ms: number): Handle;
  clearTimeout(handle: Handle): void;
  now(): number;
};

// Wrapped, not passed by reference: the browser's timer functions throw when called off any object
// other than the window.
export const browserTimers: RefreshTimers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  now: () => Date.now(),
};

export type RefreshScheduler = {
  start(): void;
  stop(): void;
  /** Something happened that the next read would show; the read waits out the debounce. */
  poke(): void;
  visibilityChanged(visible: boolean): void;
};

export const POKE_DEBOUNCE_MS = 1_000;

// A visible page is somebody asking, so it re-reads on a timer; a hidden one asks for nothing.
export const REFRESH_INTERVAL_MS = 60_000;

type SchedulerOptions = {
  /** Never rejects in practice; a rejection is swallowed so one bad read cannot stop the timer. */
  run(): Promise<void>;
  timers: RefreshTimers;
  debounceMs?: number;
  intervalMs?: number;
  visible(): boolean;
};

/**
 * When the workspace re-reads `GET /usage`: once on start, once a second after the last event that
 * touched usage, and once a minute while the page is on screen. Never two reads at a time - a poke
 * that lands during a read is remembered and answered by one more read after it.
 */
export function createRefreshScheduler(opts: SchedulerOptions): RefreshScheduler {
  const { timers, visible } = opts;
  const debounceMs = opts.debounceMs ?? POKE_DEBOUNCE_MS;
  const intervalMs = opts.intervalMs ?? REFRESH_INTERVAL_MS;
  let debounce: Handle | null = null;
  let interval: Handle | null = null;
  let running = false;
  let dirty = false;
  let stopped = false;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  const cancelInterval = () => {
    if (interval !== null) {
      timers.clearTimeout(interval);
      interval = null;
    }
  };

  const runNow = () => {
    if (stopped) {
      return;
    }
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    lastRunAt = timers.now();
    void opts
      .run()
      .catch(() => undefined)
      .then(() => {
        running = false;
        if (dirty) {
          dirty = false;
          runNow();
        }
      });
  };

  const armInterval = () => {
    cancelInterval();
    if (stopped) {
      return;
    }
    interval = timers.setTimeout(() => {
      interval = null;
      runNow();
      armInterval();
    }, intervalMs);
  };

  return {
    start: () => {
      runNow();
      if (visible()) {
        armInterval();
      }
    },
    stop: () => {
      stopped = true;
      dirty = false;
      cancelInterval();
      if (debounce !== null) {
        timers.clearTimeout(debounce);
        debounce = null;
      }
    },
    poke: () => {
      // A hidden page shows nobody the answer, and a streaming agent pokes often enough to keep a
      // read chain running for as long as it streams. Coming back on screen re-reads anyway.
      if (stopped || !visible()) {
        return;
      }
      if (debounce !== null) {
        timers.clearTimeout(debounce);
      }
      debounce = timers.setTimeout(() => {
        debounce = null;
        runNow();
      }, debounceMs);
    },
    visibilityChanged: (isVisible) => {
      if (stopped) {
        return;
      }
      if (!isVisible) {
        cancelInterval();
        return;
      }
      // Back on screen with stale figures: read before waiting out another full interval.
      if (timers.now() - lastRunAt >= intervalMs) {
        runNow();
      }
      armInterval();
    },
  };
}
