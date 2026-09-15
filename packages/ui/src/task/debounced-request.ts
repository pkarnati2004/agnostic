import { isAbortError } from "../api/error";

export type DebouncedRequest<In> = {
  /** Replaces whatever was pending or in flight with this input. */
  submit(input: In): void;
  cancel(): void;
};

export type DebouncedOptions<In, Out> = {
  delayMs: number;
  run(input: In, signal: AbortSignal): Promise<Out>;
  onResult(input: In, out: Out): void;
  /** Never called for an abort: the page asked for that one itself. */
  onError(input: In, error: unknown): void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

/**
 * One request at a time behind a pause: the dialog asks on every keystroke, the daemon hears from
 * it once the typing stops, and a reply to a question that has been replaced is dropped.
 */
export function createDebouncedRequest<In, Out>(
  opts: DebouncedOptions<In, Out>,
): DebouncedRequest<In> {
  const later = opts.setTimeout ?? setTimeout;
  const cancelTimer = opts.clearTimeout ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;

  const stop = () => {
    if (timer !== null) {
      cancelTimer(timer);
      timer = null;
    }
    inFlight?.abort();
    inFlight = null;
  };

  const start = async (input: In) => {
    const controller = new AbortController();
    inFlight = controller;
    try {
      const out = await opts.run(input, controller.signal);
      if (!controller.signal.aborted) {
        opts.onResult(input, out);
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        opts.onError(input, error);
      }
    } finally {
      if (inFlight === controller) {
        inFlight = null;
      }
    }
  };

  return {
    submit: (input) => {
      stop();
      timer = later(() => {
        timer = null;
        void start(input);
      }, opts.delayMs);
    },
    cancel: stop,
  };
}
