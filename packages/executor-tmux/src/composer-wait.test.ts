import type { RunResult } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { gateOnPane, waitForComposer } from "./composer-wait.js";
import type { TmuxClient } from "./tmux-client.js";

const FAST = { pollMs: 5, quietMs: 20, ceilingMs: 500 };

/** A client whose `capture-pane` answers with the next screen in the list, then repeats the last. */
function paneShowing(screens: string[]): TmuxClient & { captures: number } {
  const client = {
    socket: "test",
    captures: 0,
    async run(args: string[]): Promise<RunResult> {
      expect(args[0]).toBe("capture-pane");
      const stdout = screens[Math.min(client.captures, screens.length - 1)] ?? "";
      client.captures += 1;
      return { stdout, stderr: "", exitCode: 0, durationMs: 0 };
    },
  };
  return client;
}

describe("waitForComposer", () => {
  it("waits for a pane that is still painting and then calls it ready", async () => {
    const client = paneShowing(["", "Codex", "Codex\n>", "Codex\n>"]);

    expect(await waitForComposer(client, "agn-one", FAST)).toEqual({ ready: true, gate: null });
    expect(client.captures).toBeGreaterThan(3);
  });

  it("reports the gate phrase on a screen that would swallow a paste", async () => {
    const screen = "Do you trust the contents of this directory?\n> Yes, allow";
    const client = paneShowing([screen]);

    expect(await waitForComposer(client, "agn-two", FAST)).toEqual({
      ready: false,
      gate: "Do you trust the contents of this directory",
    });
  });

  it("reports a hooks review the same way", async () => {
    const client = paneShowing(["Hooks need review\n  Trust all and continue"]);

    expect((await waitForComposer(client, "agn-three", FAST)).gate).toBe("Hooks need review");
  });

  it("gives up at the ceiling on a pane that never holds still", async () => {
    let frame = 0;
    const client: TmuxClient = {
      socket: "test",
      async run(): Promise<RunResult> {
        frame += 1;
        return { stdout: `working ${frame}`, stderr: "", exitCode: 0, durationMs: 0 };
      },
    };

    const started = Date.now();
    expect(await waitForComposer(client, "agn-four", { ...FAST, ceilingMs: 60 })).toEqual({
      ready: false,
      gate: null,
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  it("treats a pane tmux cannot read as quiet, so the caller is not held up", async () => {
    const client: TmuxClient = {
      socket: "test",
      run: async (): Promise<RunResult> => ({
        stdout: "",
        stderr: "no such pane",
        exitCode: 1,
        durationMs: 0,
      }),
    };

    expect(await waitForComposer(client, "agn-five", FAST)).toEqual({ ready: true, gate: null });
  });
});

describe("gateOnPane", () => {
  it("answers from one capture and names the gate", async () => {
    const client = paneShowing(["Hooks need review\n> Trust all and continue"]);

    expect(await gateOnPane(client, "agn-five")).toBe("Hooks need review");
    expect(client.captures).toBe(1);
  });

  // The accepted false positive: the match is a substring of the visible pane, so an agent that
  // quotes a gate sentence in its own output reads as a gate until it scrolls away.
  it("treats a gate phrase the agent printed as ordinary output as a gate", async () => {
    const client = paneShowing([
      'The screen said "Do you trust the contents of this directory".\n>',
    ]);

    expect(await gateOnPane(client, "agn-six")).toBe("Do you trust the contents of this directory");
  });
});
