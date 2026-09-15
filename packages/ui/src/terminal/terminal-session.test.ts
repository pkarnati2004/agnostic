import type { TaskStatus } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SessionPhase, startSession } from "./terminal-session";
import type { TerminalSocketEvents } from "./terminal-socket";

type FakeSocket = { events: TerminalSocketEvents; closed: boolean };

function harness(statuses: (TaskStatus | null)[]) {
  const sockets: FakeSocket[] = [];
  const phases: SessionPhase[] = [];
  const notices: (string | null)[] = [];
  const reads: string[] = [];
  const session = startSession({
    taskId: "t1",
    token: "sekret",
    size: { cols: 80, rows: 24 },
    readStatus: (id) => {
      reads.push(id);
      return Promise.resolve(statuses.shift() ?? null);
    },
    events: {
      onPhase: (phase) => phases.push(phase),
      onNotice: (line) => notices.push(line),
      onData: () => undefined,
    },
    connect: ({ events }) => {
      const socket: FakeSocket = { events, closed: false };
      sockets.push(socket);
      return {
        write: () => undefined,
        resize: () => undefined,
        close: () => {
          socket.closed = true;
        },
      };
    },
  });
  const last = (): FakeSocket => {
    const socket = sockets.at(-1);
    if (socket === undefined) {
      throw new Error("no socket was opened");
    }
    return socket;
  };
  return { session, sockets, phases, notices, reads, last };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSession", () => {
  it("goes live on ready", () => {
    const { phases, last } = harness([]);
    expect(phases).toEqual(["connecting"]);
    last().events.onReady();
    expect(phases).toEqual(["connecting", "live"]);
  });

  it("ends on the exit frame and says nothing more about the close", () => {
    const { phases, notices, last } = harness([]);
    last().events.onReady();
    last().events.onExit(0);
    last().events.onClose({ code: 1000, reason: "", sawExit: true });
    expect(phases).toEqual(["connecting", "live", "ended", "ended"]);
    expect(notices.at(-1)).toBeNull();
  });

  it("reconnects after a restart once the task reads as running", async () => {
    const { phases, notices, sockets, last } = harness(["running"]);
    last().events.onReady();
    last().events.onClose({ code: 1001, reason: "", sawExit: false });
    expect(phases.at(-1)).toBe("reconnecting");
    expect(notices.at(-1)).toBe("The daemon is restarting.");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
    expect(phases.at(-1)).toBe("connecting");
  });

  it("ends when the task the tab watched has finished", async () => {
    const { phases, last } = harness(["done"]);
    last().events.onClose({ code: 1006, reason: "", sawExit: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(phases.at(-1)).toBe("ended");
  });

  it("doubles the wait to ten seconds while the daemon cannot be read", async () => {
    const { reads, last } = harness([null, null, null, null, null]);
    last().events.onClose({ code: 1006, reason: "", sawExit: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(reads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(reads).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(reads).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reads).toHaveLength(5);
  });

  it("stops retrying when the tab closes", async () => {
    const { session, sockets, last } = harness(["running"]);
    last().events.onClose({ code: 1006, reason: "", sawExit: false });
    session.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);
  });

  it("closes the socket it holds when the tab closes", () => {
    const { session, last } = harness([]);
    last().events.onReady();
    session.stop();
    expect(last().closed).toBe(true);
  });
});
