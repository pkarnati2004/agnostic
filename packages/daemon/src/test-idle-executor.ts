import type { ExecutorProvider } from "@agnostic/core";

/** Nothing runs: the daemon tests that never start a task must not need tmux to be installed. */
export function idleExecutor(): ExecutorProvider {
  const refuse = () => Promise.reject(new Error("this test daemon has no executor"));
  return {
    id: "tmux-local",
    prepare: refuse,
    launch: refuse,
    sessionState: () => Promise.resolve("gone" as const),
    attach: () => ({ kind: "tmux", argv: [] }),
    send: refuse,
    terminal: refuse,
    stop: () => Promise.resolve(),
    clean: () => Promise.resolve(),
    detect: () => Promise.resolve([]),
    onEvent: () => () => undefined,
    close: () => Promise.resolve(),
  };
}
